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
            SELECT NodeID, CoordinateX, CoordinateY, FloorID, BuildingID,
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
                    "NodeID" to rs.getInt("NodeID"),
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
                    nearestNodeId = rs.getInt("NearestNodeID"),
                    distanceToNode = rs.getDouble("DistanceToNode"),
                    bearingFromNode = rs.getString("BearingFromNode") ?: "continue",
                    coordX = rs.getInt("MapCoordinateX"),
                    coordY = rs.getInt("MapCoordinateY")
                )
            }
        }
        return null
    }

    fun getBuildingIdForNode(nodeId: Int, conn: Connection): String? {
        val query = "SELECT BuildingID FROM MapNodes WHERE NodeID = ?"
        conn.prepareStatement(query).use { stmt -> 
            stmt.setInt(1, nodeId)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                return rs.getString("BuildingID")
            }
        }
        return null
    }

    fun calculateShortestPath(buildingId: String, startNode: Int, endNode: Int, conn: Connection): Pair<List<Int>, Double> {
        val query = """
            SELECT e.StartNodeID, e.EndNodeID, e.DistanceMeters, e.IsBidirectional
            FROM MapEdges e
            JOIN MapNodes n ON e.StartNodeID = n.NodeID
            WHERE n.BuildingID = ?
        """
        // Building adjacency list
        val graph = mutableMapOf<Int, MutableList<Pair<Int, Double>>>()
        conn.prepareStatement(query).use { stmt -> 
            stmt.setString(1, buildingId)
            val rs = stmt.executeQuery()
            while (rs.next()) {
                val u = rs.getInt("StartNodeID")
                val v = rs.getInt("EndNodeID")
                val weight = rs.getDouble("DistanceMeters")
                val isBidi = rs.getBoolean("IsBidirectional")

                graph.getOrPut(u) { mutableListOf() }.add(Pair(v, weight))
                if (isBidi) {
                    graph.getOrPut(v) { mutableListOf() }.add(Pair(u, weight))
                }
            }
        }

        // Dijkstra setup
        val distances = mutableMapOf<Int, Double>().withDefault { Double.POSITIVE_INFINITY }
        val previous = mutableMapOf<Int, Int?>()
        // Priority queue, ordered by shortest distance
        val pq = PriorityQueue<Pair<Double, Int>>(compareBy { it.first })

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

        val path = mutableListOf<Int>()
        var curr: Int? = endNode
        while (curr != null) {
            path.add(curr)
            curr = previous[curr]
        }
        path.reverse()

        return Pair(path, distances.getValue(endNode))
    }

    fun buildInstructions(conn: Connection, path: List<Int>, landmark: LandmarkDetails): List<NavigationInstruction> {
        if (path.isEmpty()) return emptyList()

        val placeholders = path.joinToString(",") { "?" }
        val nodeQuery = "SELECT NodeID, CoordinateX, CoordinateY FROM MapNodes WHERE NodeID IN ($placeholders)"
        val nodeData = mutableMapOf<Int, Pair<Int, Int>>()
        
        conn.prepareStatement(nodeQuery).use { stmt ->
            path.forEachIndexed { index, id -> stmt.setInt(index + 1, id) }
            val rs = stmt.executeQuery()
            while (rs.next()) {
                nodeData[rs.getInt("NodeID")] = Pair(rs.getInt("CoordinateX"), rs.getInt("CoordinateY"))
            }
        }

        val edgeQuery = """
            SELECT StartNodeID, EndNodeID, DistanceMeters, Bearing, IsBidirectional
            FROM MapEdges WHERE StartNodeID IN ($placeholders) AND EndNodeID IN ($placeholders)
        """
        val edgeMap = mutableMapOf<Pair<Int, Int>, Pair<Double, Double?>>()
        
        if (path.size > 1) {
            conn.prepareStatement(edgeQuery).use { stmt ->
                var paramIndex = 1
                path.forEach { stmt.setInt(paramIndex++, it) }
                path.forEach { stmt.setInt(paramIndex++, it) }
                val rs = stmt.executeQuery()
                while (rs.next()) {
                    val start = rs.getInt("StartNodeID")
                    val end = rs.getInt("EndNodeID")
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
            
            var distFeet = 0.0
            var directionStr = ""
            
            if (i < path.size - 1) {
                // Not at the last node yet, lookup edge to the next node
                val nextNodeId = path[i + 1]
                val edgeInfo = edgeMap[Pair(nodeId, nextNodeId)]
                
                if (edgeInfo != null) {
                    distFeet = edgeInfo.first * 3.28084
                    directionStr = bearingToDirectionString(edgeInfo.second)
                } else {
                    directionStr = "continue"
                }
            } else {
                // At the final node. Look towards the actual Landmark destination.
                distFeet = landmark.distanceToNode * 3.28084
                directionStr = "Head ${landmark.bearingFromNode}"
            }
            
            instructions.add(
                NavigationInstruction(
                    step = i + 1,
                    distance_feet = distFeet,
                    direction = directionStr,
                    node_id = nodeId.toString(),
                    coordinates = mapOf("x" to coords.first.toDouble(), "y" to coords.second.toDouble())
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
                coordinates = mapOf("x" to landmark.coordX.toDouble(), "y" to landmark.coordY.toDouble())
            )
        )

        return instructions
    }

    private fun bearingToDirectionString(bearing: Double?): String {
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