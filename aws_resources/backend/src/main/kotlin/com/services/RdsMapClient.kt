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
import com.models.MapNode
import com.models.NavigationCoordinates
import com.models.NavigationStepType

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
        val query = "SELECT Name, NearestNodeID, DoorID, DistanceToNode, BearingFromNode, MapCoordinateX, MapCoordinateY FROM Landmarks WHERE LandmarkID = ?"
        conn.prepareStatement(query).use { stmt -> 
            stmt.setInt(1, landmarkId)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                val nearestNodeId = rs.getString("NearestNodeID")
                val doorId = rs.getString("DoorID")
                return LandmarkDetails(
                    id = landmarkId,
                    name = rs.getString("Name"),
                    nearestNodeId = nearestNodeId,
                    doorId = doorId,
                    distanceToNode = rs.getDouble("DistanceToNode"),
                    bearingFromNode = rs.getString("BearingFromNode") ?: "",
                    coordX = rs.getInt("MapCoordinateX"),
                    coordY = rs.getInt("MapCoordinateY")
                )
            }
        }
        return null
    }

    fun getNode(nodeId: String, conn: Connection): MapNode? {
        // Replaced IN ($nodeId) with = ?
        val nodeQuery = "SELECT NodeIDString, CoordinateX, CoordinateY FROM MapNodes WHERE NodeIDString = ?"
        
        conn.prepareStatement(nodeQuery).use { stmt ->
            // This will now correctly replace the '?' with the nodeId
            stmt.setString(1, nodeId) 
            val rs = stmt.executeQuery()
            
            if (rs.next()) {    
                return MapNode(
                    id = rs.getString("NodeIDString"),
                    coordX = rs.getInt("CoordinateX"),
                    coordY = rs.getInt("CoordinateY")
                )
            }
        }
        return null
    }

    fun getEdgeDistanceFeet(conn: Connection, startNodeId: String, endNodeId: String): Double? {
        val edgeQuery = """
            SELECT DistanceMeters
            FROM MapEdges
            WHERE
                (StartNodeID = ? AND EndNodeID = ?)
                OR
                (IsBidirectional = TRUE AND StartNodeID = ? AND EndNodeID = ?)
            LIMIT 1
        """
        conn.prepareStatement(edgeQuery).use { stmt ->
            stmt.setString(1, startNodeId)
            stmt.setString(2, endNodeId)
            stmt.setString(3, endNodeId)
            stmt.setString(4, startNodeId)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                return rs.getDouble("DistanceMeters") * 3.28084
            }
        }
        return null
    }


    fun getLandmarkByName(name: String, conn: Connection): LandmarkDetails? {
        val query = """
            SELECT LandmarkID, Name, NearestNodeID, DoorID, DistanceToNode, BearingFromNode, MapCoordinateX, MapCoordinateY 
            FROM Landmarks 
            WHERE Name = ? 
            LIMIT 1
        """
        conn.prepareStatement(query).use { stmt -> 
            stmt.setString(1, name)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                val nearestNodeId = rs.getString("NearestNodeID")
                val doorId = rs.getString("DoorID")
                return LandmarkDetails(
                    id = rs.getInt("LandmarkID"),
                    name = rs.getString("Name"),
                    nearestNodeId = nearestNodeId,
                    doorId = doorId,
                    distanceToNode = rs.getDouble("DistanceToNode"),
                    bearingFromNode = rs.getString("BearingFromNode") ?: "",
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
        require(landmark.nearestNodeId == path.last()) {
            "Landmark nearest node '${landmark.nearestNodeId}' must match route end '${path.last()}'."
        }
        require(landmark.doorId.isNotBlank()) { "Landmark ${landmark.id} is missing required door_id." }

        val placeholders = path.joinToString(",") { "?" }
        val nodeQuery = "SELECT NodeIDString, CoordinateX, CoordinateY, NodeMeta FROM MapNodes WHERE NodeIDString IN ($placeholders)"
        val nodeData = mutableMapOf<String, NodeSnapshot>()
        conn.prepareStatement(nodeQuery).use { stmt ->
            path.forEachIndexed { index, id -> stmt.setString(index + 1, id) }
            val rs = stmt.executeQuery()
            while (rs.next()) {
                val nodeId = rs.getString("NodeIDString")
                val nodeMetaRaw = rs.getString("NodeMeta")
                nodeData[nodeId] = NodeSnapshot(
                    x = rs.getInt("CoordinateX"),
                    y = rs.getInt("CoordinateY"),
                    doors = parseNodeDoors(nodeId, nodeMetaRaw),
                )
            }
        }
        require(path.all { nodeData.containsKey(it) }) {
            val missingNodes = path.filterNot { nodeData.containsKey(it) }
            "Missing node metadata for path nodes: $missingNodes"
        }

        val edgePairs = path.zipWithNext()
        val edgeMap = mutableMapOf<Pair<String, String>, EdgeSnapshot>()
        if (edgePairs.isNotEmpty()) {
            val edgeClauses = edgePairs.joinToString(" OR ") {
                "((StartNodeID = ? AND EndNodeID = ?) OR (StartNodeID = ? AND EndNodeID = ?))"
            }
            val edgeQuery = "SELECT StartNodeID, EndNodeID, DistanceMeters, Bearing, IsBidirectional FROM MapEdges WHERE $edgeClauses"
            conn.prepareStatement(edgeQuery).use { stmt ->
                var paramIndex = 1
                edgePairs.forEach { (start, end) ->
                    stmt.setString(paramIndex++, start)
                    stmt.setString(paramIndex++, end)
                    stmt.setString(paramIndex++, end)
                    stmt.setString(paramIndex++, start)
                }
                val rs = stmt.executeQuery()
                while (rs.next()) {
                    val start = rs.getString("StartNodeID")
                    val end = rs.getString("EndNodeID")
                    val distanceMeters = rs.getDouble("DistanceMeters")
                    val bearing = rs.getDouble("Bearing")
                    if (rs.wasNull()) {
                        throw IllegalArgumentException("Edge bearing is required for v2 navigation semantics: $start -> $end")
                    }
                    val normalizedBearing = normalizeBearing(bearing)
                    edgeMap[Pair(start, end)] = EdgeSnapshot(
                        distanceMeters = distanceMeters,
                        bearingDegrees = normalizedBearing,
                    )
                    if (rs.getBoolean("IsBidirectional")) {
                        val reversePair = Pair(end, start)
                        if (!edgeMap.containsKey(reversePair)) {
                            edgeMap[reversePair] = EdgeSnapshot(
                                distanceMeters = distanceMeters,
                                bearingDegrees = normalizeBearing(normalizedBearing + 180.0),
                            )
                        }
                    }
                }
            }
        }
        require(edgePairs.all { edgeMap.containsKey(Pair(it.first, it.second)) }) {
            val missingEdges = edgePairs.filterNot { edgeMap.containsKey(Pair(it.first, it.second)) }
            "Missing directed edges for route segments: $missingEdges"
        }

        val incomingBearing = edgePairs.lastOrNull()?.let { edgeMap[Pair(it.first, it.second)]?.bearingDegrees }
        val arrivalDoorCue = resolveArrivalDoorCue(
            nearestNode = nodeData.getValue(path.last()),
            landmark = landmark,
            incomingBearing = incomingBearing
        )
        val arrivalDirection = "Arrived, destination on your ${arrivalDoorCue.side}"

        val instructions = mutableListOf<NavigationInstruction>()
        for (i in edgePairs.indices) {
            val (nodeId, nextNodeId) = edgePairs[i]
            val node = nodeData.getValue(nodeId)
            val edgeInfo = edgeMap.getValue(Pair(nodeId, nextNodeId))
            val distFeet = edgeInfo.distanceMeters * 3.28084
            val directionStr = bearingToDirectionString(edgeInfo.bearingDegrees)
            val headingDegrees = edgeInfo.bearingDegrees

            val nextHeading = when {
                i + 1 < edgePairs.size -> edgeMap[Pair(edgePairs[i + 1].first, edgePairs[i + 1].second)]?.bearingDegrees
                else -> null
            }

            val turnAtEnd = if (nextHeading != null) {
                headingDeltaToTurnAtEnd(nextHeading - headingDegrees)
            } else null

            instructions.add(
                NavigationInstruction(
                    step = i + 1,
                    step_type = NavigationStepType.segment,
                    distance_feet = distFeet,
                    direction = directionStr,
                    start_node_id = nodeId,
                    end_node_id = nextNodeId,
                    node_id = nodeId,
                    coordinates = NavigationCoordinates(
                        x = node.x.toDouble(),
                        y = node.y.toDouble()
                    ),
                    heading_degrees = headingDegrees,
                    turn_intent = turnAtEnd
                )
            )
        }

        // Add the absolute final "arrive" instruction for the landmark coordinates
        instructions.add(
            NavigationInstruction(
                step = path.size + 1,
                step_type = NavigationStepType.arrival,
                distance_feet = 0.0,
                direction = arrivalDirection,
                start_node_id = landmark.nearestNodeId,
                end_node_id = landmark.nearestNodeId,
                node_id = "${landmark.name}",
                coordinates = NavigationCoordinates(
                    x = landmark.coordX.toDouble(),
                    y = landmark.coordY.toDouble()
                ),
                heading_degrees = null,
                turn_intent = null
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

    private data class EdgeSnapshot(
        val distanceMeters: Double,
        val bearingDegrees: Double,
    )

    private data class NodeSnapshot(
        val x: Int,
        val y: Int,
        val doors: List<NodeDoorMeta>,
    )

    private data class NodeDoorMeta(
        val id: String,
        val sideByBearing: List<DoorSideByBearing>,
    )

    private data class DoorSideByBearing(
        val bearingDegrees: Double,
        val side: String,
    )

    private fun headingsNearlyEqual(a: Double?, b: Double?): Boolean {
        if (a == null || b == null) return a == b
        var diff = kotlin.math.abs(a - b)
        if (diff > 180.0) diff = 360.0 - diff
        return diff <= AGGREGATION_HEADING_TOLERANCE_DEGREES
    }

    private fun parseNodeDoors(nodeId: String, nodeMetaRaw: String?): List<NodeDoorMeta> {
        if (nodeMetaRaw.isNullOrBlank()) return emptyList()
        val root = mapper.readTree(nodeMetaRaw)
        val doorsNode = root.get("doors") ?: return emptyList()
        require(doorsNode.isArray) { "NodeMeta.doors must be an array for node '$nodeId'" }

        return doorsNode.map { doorNode ->
            val doorId = doorNode.get("id")?.asText()?.trim().orEmpty()
            require(doorId.isNotBlank()) { "Node '$nodeId' contains a door entry without id." }
            val sideByBearingNode = doorNode.get("side_by_bearing")
            require(sideByBearingNode != null && sideByBearingNode.isArray && sideByBearingNode.size() > 0) {
                "Node '$nodeId' door '$doorId' must define non-empty side_by_bearing."
            }
            val sideEntries = sideByBearingNode.map { sideEntry ->
                val side = sideEntry.get("side")?.asText()?.trim()?.lowercase().orEmpty()
                require(side == "left" || side == "right") {
                    "Node '$nodeId' door '$doorId' has invalid side '$side'."
                }
                val bearing = sideEntry.get("bearing_deg")?.asDouble()
                    ?: throw IllegalArgumentException("Node '$nodeId' door '$doorId' is missing bearing_deg.")
                DoorSideByBearing(
                    bearingDegrees = normalizeBearing(bearing),
                    side = side,
                )
            }
            NodeDoorMeta(
                id = doorId,
                sideByBearing = sideEntries,
            )
        }
    }

    private fun normalizeBearing(bearing: Double): Double {
        val mod = bearing % 360.0
        return if (mod < 0.0) mod + 360.0 else mod
    }

    private fun angularDifference(a: Double, b: Double): Double {
        var diff = kotlin.math.abs(normalizeBearing(a) - normalizeBearing(b))
        if (diff > 180.0) diff = 360.0 - diff
        return diff
    }

    private fun resolveArrivalDoorCue(
        nearestNode: NodeSnapshot,
        landmark: LandmarkDetails,
        incomingBearing: Double?,
    ): DoorSideByBearing {
        val matchingDoor = nearestNode.doors.firstOrNull { it.id == landmark.doorId }
            ?: throw IllegalArgumentException(
                "Landmark ${landmark.id} door_id '${landmark.doorId}' is not present on node '${landmark.nearestNodeId}'."
            )
        val sideEntries = matchingDoor.sideByBearing
        if (incomingBearing == null) {
            return sideEntries.first()
        }
        return sideEntries.minByOrNull { angularDifference(it.bearingDegrees, incomingBearing) }
            ?: throw IllegalArgumentException("Door '${matchingDoor.id}' has no bearing entries.")
    }

    /**
     * Aggregates instructions: merges consecutive segments with same/near heading, and merges
     * zero-distance segments into the previous segment (so "0 ft, then turn left" disappears).
     * The group's turn_intent, node_id, and coordinates come from the last segment in the group.
     */
    private fun aggregateInstructions(instructions: List<NavigationInstruction>): List<NavigationInstruction> {
        if (instructions.isEmpty()) return emptyList()
        val result = mutableListOf<NavigationInstruction>()
        var i = 0
        var stepNum = 1
        while (i < instructions.size) {
            val first = instructions[i]
            if (first.step_type == NavigationStepType.arrival) {
                result.add(first.copy(step = stepNum, turn_intent = null))
                stepNum++
                i++
                continue
            }
            var totalFeet = first.distance_feet
            var lastInGroup = first
            var j = i + 1
            while (j < instructions.size && instructions[j].step_type != NavigationStepType.arrival &&
                   (headingsNearlyEqual(first.heading_degrees, instructions[j].heading_degrees) ||
                    instructions[j].distance_feet == 0.0)) {
                totalFeet += instructions[j].distance_feet
                lastInGroup = instructions[j]
                j++
            }
            result.add(NavigationInstruction(
                step = stepNum,
                step_type = NavigationStepType.segment,
                distance_feet = totalFeet,
                direction = first.direction,
                heading_degrees = first.heading_degrees,
                turn_intent = lastInGroup.turn_intent,
                start_node_id = first.start_node_id,
                end_node_id = lastInGroup.end_node_id,
                node_id = first.node_id,
                coordinates = lastInGroup.coordinates
            ))
            stepNum++
            i = j
        }
        return result
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