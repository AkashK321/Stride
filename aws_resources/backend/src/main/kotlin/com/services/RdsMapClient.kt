package com.services

import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import java.sql.Connection
import java.sql.DriverManager
import java.util.PriorityQueue
import com.models.LandmarkDetails
import com.models.NavigationInstruction

class RdsMapClient {
    private val mapper = jacksonObjectMapper()
    
    // Class-level cached database connection properties
    private val dbHost: String
    private val dbPort: String
    private val dbName: String
    private val dbUser: String
    private val dbPassword: String

    init {
        dbHost = System.getenv("DB_HOST") ?: "localhost"
        dbPort = System.getenv("DB_PORT") ?: "5432"
        dbName = System.getenv("DB_NAME") ?: "stride_db"
        
        val secretArn = System.getenv("DB_SECRET_ARN")

        // If a Secret ARN is provided (Production/AWS Env), fetch the credentials securely
        if (!secretArn.isNullOrBlank()) {
            val secretsClient = SecretsManagerClient.builder()
                .region(Region.US_EAST_1)
                .build()

            val valueRequest = GetSecretValueRequest.builder()
                .secretId(secretArn)
                .build()

            val secretString = secretsClient.getSecretValue(valueRequest).secretString()

            // Parse the JSON secret payload AWS creates automatically for RDS
            val secretMap: Map<String, String> = mapper.readValue(secretString)
            dbUser = secretMap["username"] ?: "postgres"
            dbPassword = secretMap["password"] ?: "password"
            
            secretsClient.close()
        } else {
            // Fallback for local testing or unmanaged environments
            dbUser = System.getenv("DB_USER") ?: "postgres"
            dbPassword = System.getenv("DB_PASSWORD") ?: "password"
        }
    }

    /**
     * Establishes a new JDBC connection using the cached credentials.
     * Ensure the calling function wraps this in a .use { conn -> } block to prevent connection leaks.
     */
    fun getDbConnection(): Connection {
        val url = "jdbc:postgresql://$dbHost:$dbPort/$dbName"
        return DriverManager.getConnection(url, dbUser, dbPassword)
    }

    fun getClosestMapNode(conn: Connection, x: Double, y: Double): Map<String, Any>? {
        // Find the closest node using squared Euclidean distance (avoids expensive SQRT operation)
        val query = """
            SELECT NodeIDString, CoordinateX, CoordinateY, FloorID, BuildingID,
                   (POWER(CoordinateX - ?, 2) + POWER(CoordinateY - ?, 2)) as dist_sq
            FROM MapNodes
            ORDER BY dist_sq ASC
            LIMIT 1
        """
        conn.prepareStatement(query).use { stmt ->
            stmt.setDouble(1, x)
            stmt.setDouble(2, y)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                return mapOf(
                    "NodeID" to rs.getString("NodeIDString"),
                    "CoordinateX" to rs.getInt("CoordinateX"),
                    "CoordinateY" to rs.getInt("CoordinateY"),
                    "FloorID" to rs.getInt("FloorID"),
                    "BuildingID" to rs.getString("BuildingID")
                )
            }
        }
        return null
    }

    fun getLandmark(landmarkId: Int, conn: Connection): LandmarkDetails? {
        val query = "SELECT Name, NearestNodeID, DistanceToNode, BearingFromNode, MapCoordinateX, MapCoordinateY FROM Landmarks WHERE LandmarkID = ?"
        conn.prepareStatement(query).use { stmt -> 
            stmt.setInt(1, landmarkId)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                return LandmarkDetails(
                    id = landmarkId,
                    name = rs.getString("Name"),
                    nearestNodeId = rs.getString("NearestNodeID"),
                    distanceToNode = rs.getDouble("DistanceToNode"),
                    bearingFromNode = rs.getString("BearingFromNode") ?: "continue",
                    coordX = rs.getInt("MapCoordinateX"),
                    coordY = rs.getInt("MapCoordinateY")
                )
            }
        }
        return null
    }

    fun getBuildingIdForNode(nodeId: String, conn: Connection): String? {
        val query = "SELECT BuildingID FROM MapNodes WHERE NodeIDString = ?"
        conn.prepareStatement(query).use { stmt -> 
            stmt.setString(1, nodeId)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                return rs.getString("BuildingID")
            }
        }
        return null
    }

    /**
     * Resolves start_location.node_id (NodeIDString) and verifies it exists.
     * Only accepts the string node id from floor data (e.g. "staircase_main_2S01").
     */
    fun resolveStartNodeId(conn: Connection, nodeIdRaw: String): String? {
        val trimmed = nodeIdRaw.trim()
        if (trimmed.isEmpty()) return null
        val query = "SELECT NodeIDString FROM MapNodes WHERE NodeIDString = ?"
        conn.prepareStatement(query).use { stmt ->
            stmt.setString(1, trimmed)
            val rs = stmt.executeQuery()
            if (rs.next()) return trimmed
        }
        return null
    }

    fun calculateShortestPath(buildingId: String, startNode: String, endNode: String, conn: Connection): Pair<List<String>, Double> {
        val query = """
            SELECT e.StartNodeID, e.EndNodeID, e.DistanceMeters, e.IsBidirectional
            FROM MapEdges e
            JOIN MapNodes n ON e.StartNodeID = n.NodeIDString
            WHERE n.BuildingID = ?
        """
        // Building adjacency list
        val graph = mutableMapOf<String, MutableList<Pair<String, Double>>>()
        conn.prepareStatement(query).use { stmt -> 
            stmt.setString(1, buildingId)
            val rs = stmt.executeQuery()
            while (rs.next()) {
                val u = rs.getString("StartNodeID")
                val v = rs.getString("EndNodeID")
                val weight = rs.getDouble("DistanceMeters")
                val isBidi = rs.getBoolean("IsBidirectional")

                graph.getOrPut(u) { mutableListOf() }.add(Pair(v, weight))
                if (isBidi) {
                    graph.getOrPut(v) { mutableListOf() }.add(Pair(u, weight))
                }
            }
        }

        // Dijkstra setup
        val distances = mutableMapOf<String, Double>().withDefault { Double.POSITIVE_INFINITY }
        val previous = mutableMapOf<String, String?>()
        // Priority queue, ordered by shortest distance
        val pq = PriorityQueue<Pair<Double, String>>(compareBy { it.first })

        distances[startNode] = 0.0
        pq.add(Pair(0.0, startNode))

        while (pq.isNotEmpty()) {
            val (currentDist, u) = pq.poll()
            if (u == endNode) break
            if (currentDist > distances.getValue(u)) continue

            for ((v, weight) in graph[u] ?: emptyList()) {
                val newDist = currentDist + weight
                if (newDist < distances.getValue(v)) {
                    distances[v] = newDist
                    previous[v] = u
                    pq.add(Pair(newDist, v))
                }
            }
        }

        // Reconstruct path
        if (!previous.containsKey(endNode) && startNode != endNode) {
            throw IllegalArgumentException("No path found between start and destination")
        }

        val path = mutableListOf<String>()
        var curr: String? = endNode
        while (curr != null) {
            path.add(curr)
            curr = previous[curr]
        }
        path.reverse()

        return Pair(path, distances.getValue(endNode))
    }

    /**
     * Converts a raw list of NodeIDs into the structured payload expected by the frontend.
     * Fetches exact distances and bearings from the MapEdges table.
     */
    fun buildInstructions(conn: Connection, path: List<String>, landmark: LandmarkDetails): List<NavigationInstruction> {
        if (path.isEmpty()) return emptyList()

        val placeholders = path.joinToString(",") { "?" }
        val nodeQuery = "SELECT NodeIDString, CoordinateX, CoordinateY FROM MapNodes WHERE NodeIDString IN ($placeholders)"
        val nodeData = mutableMapOf<String, Pair<Int, Int>>()
        
        conn.prepareStatement(nodeQuery).use { stmt ->
            path.forEachIndexed { index, id -> stmt.setString(index + 1, id) }
            val rs = stmt.executeQuery()
            while (rs.next()) {
                nodeData[rs.getString("NodeIDString")] = Pair(rs.getInt("CoordinateX"), rs.getInt("CoordinateY"))
            }
        }

        val edgeQuery = """
            SELECT StartNodeID, EndNodeID, DistanceMeters, Bearing, IsBidirectional
            FROM MapEdges WHERE StartNodeID IN ($placeholders) AND EndNodeID IN ($placeholders)
        """
        val edgeMap = mutableMapOf<Pair<String, String>, Pair<Double, Double?>>()
        
        if (path.size > 1) {
            conn.prepareStatement(edgeQuery).use { stmt ->
                var paramIndex = 1
                path.forEach { stmt.setString(paramIndex++, it) }
                path.forEach { stmt.setString(paramIndex++, it) }
                val rs = stmt.executeQuery()
                while (rs.next()) {
                    val start = rs.getString("StartNodeID")
                    val end = rs.getString("EndNodeID")
                    val dist = rs.getDouble("DistanceMeters")
                    val rawBearing = rs.getDouble("Bearing")
                    val bearing: Double? = if (rs.wasNull()) null else rawBearing
                    val isBidi = rs.getBoolean("IsBidirectional")
                    
                    edgeMap[Pair(start, end)] = Pair(dist, bearing)
                    if (isBidi) {
                        val reverseBearing = bearing?.let { (it + 180.0) % 360.0 }
                        edgeMap[Pair(end, start)] = Pair(dist, reverseBearing)
                    }
                }
            }
        }

        val instructions = mutableListOf<NavigationInstruction>()
        
        // Map the Node path
        for (i in path.indices) {
            val nodeId = path[i]
            val coords = nodeData[nodeId] ?: Pair(0, 0)
            
            val (distFeet, directionStr, headingDegrees) = if (i < path.size - 1) {
                // Not at the last node yet, lookup edge to the next node
                val nextNodeId = path[i + 1]
                val edgeInfo = edgeMap[Pair(nodeId, nextNodeId)]
                if (edgeInfo != null) {
                    Triple(edgeInfo.first * 3.28084, bearingToDirectionString(edgeInfo.second), edgeInfo.second)
                } else {
                    Triple(0.0, "continue", null)
                }
            } else {
                // At the final node. Look towards the actual Landmark destination.
                Triple(landmark.distanceToNode * 3.28084, "Head ${landmark.bearingFromNode}", cardinalToDegrees(landmark.bearingFromNode))
            }

            val nextHeading = when {
                i >= path.size - 1 -> null
                i + 2 < path.size -> edgeMap[Pair(path[i + 1], path[i + 2])]?.second
                else -> cardinalToDegrees(landmark.bearingFromNode)
            }

            val turnAtEnd = if (headingDegrees != null && nextHeading != null) {
                headingDeltaToTurnAtEnd(nextHeading - headingDegrees)
            } else null

            instructions.add(
                NavigationInstruction(
                    step = i + 1,
                    distance_feet = distFeet,
                    direction = directionStr,
                    node_id = nodeId,
                    coordinates = mapOf("x" to coords.first.toDouble(), "y" to coords.second.toDouble()),
                    heading_degrees = headingDegrees,
                    turn_at_end = turnAtEnd
                )
            )
        }

        // Add the absolute final "arrive" instruction for the landmark coordinates
        instructions.add(
            NavigationInstruction(
                step = path.size + 1,
                distance_feet = 0.0,
                direction = "arrive",
                node_id = "${landmark.name}",
                coordinates = mapOf("x" to landmark.coordX.toDouble(), "y" to landmark.coordY.toDouble()),
                heading_degrees = null,
                turn_at_end = null
            )
        )

        return aggregateInstructions(instructions)
    }

    /**
     * Maps the change in heading from current segment to next segment to a turn-at-end label.
     * Convention: delta in degrees (next - current), normalized to [0, 360).
     * - ~0° or ~360° → straight
     * - ~90° → right
     * - ~180° → around
     * - ~270° → left
     * Tolerance: ±22.5° for each bucket.
     */
    private fun headingDeltaToTurnAtEnd(deltaDegrees: Double): String? {
        val normalized = ((deltaDegrees % 360.0) + 360.0) % 360.0
        return when {
            normalized <= 22.5 || normalized >= 337.5 -> "straight"
            normalized in 67.5..112.5 -> "right"
            normalized in 157.5..202.5 -> "around"
            normalized in 247.5..292.5 -> "left"
            else -> "straight" // near-straight fallback
        }
    }

    private companion object {
        /** Max angular difference (degrees) to consider two segments "same direction" for aggregation. */
        const val AGGREGATION_HEADING_TOLERANCE_DEGREES = 22.5
    }

    private fun headingsNearlyEqual(a: Double?, b: Double?): Boolean {
        if (a == null || b == null) return a == b
        var diff = kotlin.math.abs(a - b)
        if (diff > 180.0) diff = 360.0 - diff
        return diff <= AGGREGATION_HEADING_TOLERANCE_DEGREES
    }

    /**
     * Aggregates instructions: merges consecutive segments with same/near heading, and merges
     * zero-distance segments into the previous segment (so "0 ft, then turn left" disappears).
     * The group's turn_at_end, node_id, and coordinates come from the last segment in the group.
     */
    private fun aggregateInstructions(instructions: List<NavigationInstruction>): List<NavigationInstruction> {
        if (instructions.isEmpty()) return emptyList()
        val result = mutableListOf<NavigationInstruction>()
        var i = 0
        var stepNum = 1
        while (i < instructions.size) {
            val first = instructions[i]
            if (first.direction == "arrive") {
                result.add(first.copy(step = stepNum, turn_at_end = null))
                stepNum++
                i++
                continue
            }
            var totalFeet = first.distance_feet
            var lastInGroup = first
            var j = i + 1
            while (j < instructions.size && instructions[j].direction != "arrive" &&
                   (headingsNearlyEqual(first.heading_degrees, instructions[j].heading_degrees) ||
                    instructions[j].distance_feet == 0.0)) {
                totalFeet += instructions[j].distance_feet
                lastInGroup = instructions[j]
                j++
            }
            result.add(NavigationInstruction(
                step = stepNum,
                distance_feet = totalFeet,
                direction = first.direction,
                heading_degrees = first.heading_degrees,
                turn_at_end = lastInGroup.turn_at_end,
                node_id = lastInGroup.node_id,
                coordinates = lastInGroup.coordinates
            ))
            stepNum++
            i = j
        }
        return result
    }

    private fun cardinalToDegrees(bearingFromNode: String?): Double? {
        if (bearingFromNode.isNullOrBlank()) return null
        return when (bearingFromNode.trim().lowercase()) {
            "north" -> 0.0
            "east" -> 90.0
            "south" -> 180.0
            "west" -> 270.0
            else -> null
        }
    }

    fun bearingToDirectionString(bearing: Double?): String {
        if (bearing == null) return "continue"
        
        return when {
            bearing >= 337.5 || bearing < 22.5 -> "Head North"
            bearing >= 22.5 && bearing < 67.5 -> "Head Northeast"
            bearing >= 67.5 && bearing < 112.5 -> "Head East"
            bearing >= 112.5 && bearing < 157.5 -> "Head Southeast"
            bearing >= 157.5 && bearing < 202.5 -> "Head South"
            bearing >= 202.5 && bearing < 247.5 -> "Head Southwest"
            bearing >= 247.5 && bearing < 292.5 -> "Head West"
            bearing >= 292.5 && bearing < 337.5 -> "Head Northwest"
            else -> "continue"
        }
    }
}