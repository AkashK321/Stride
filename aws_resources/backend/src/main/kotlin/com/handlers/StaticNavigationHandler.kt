package com.handlers

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.sql.Connection
import java.sql.DriverManager
import java.util.PriorityQueue



data class LandmarkResult(
    val name: String,
    val floor_number: Int,
    val nearest_node: String
)

data class SearchResponse(
    val results: List<LandmarkResult>
)

data class NavigationStartRequest(
    val destination: Destination,
    val start_location: StartLocation
)

data class Destination(
    val landmark_id: String
)

data class StartLocation(
    val node_id: String
)

data class NavigationInstruction(
    val step: Int,
    val distance_feet: Double,
    val direction: String?,
    val node_id: String,
    val coordinates: Map<String, Double>
)

data class NavigationStartResponse(
    val session_id: String,
    val instructions: List<NavigationInstruction>
)

class StaticNavigationHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val mapper = jacksonObjectMapper()

    private fun getDbConnection(): Connection {
        val dbHost = System.getenv("DB_HOST") ?: "localhost"
        val dbPort = System.getenv("DB_PORT") ?: "5432"
        val dbName = System.getenv("DB_NAME") ?: "stride_db"
        val dbUser = System.getenv("DB_USER") ?: "postgres"
        val dbPassword = System.getenv("DB_PASSWORD") ?: "password"

        val url = "jdbc:postgresql://$dbHost:$dbPort/$dbName"
        return DriverManager.getConnection(url, dbUser, dbPassword)
    }

    override fun handleRequest(
        input: APIGatewayProxyRequestEvent,
        context: Context,
    ): APIGatewayProxyResponseEvent {
        val logger = context.logger
        logger.log("Request: ${input.httpMethod} ${input.path}")

        val path = input.path ?: ""
        val method = input.httpMethod ?: ""

        // /search endpoint (GET)
        if (path == "/search" && method == "GET") {
            val query = input.queryStringParameters?.get("query")
            if (query == null || query.length < 1) {
                return createErrorResponse(400, "Missing or invalid 'query' parameter (min 1 character)")
            }
            val response = handleSearch(query, logger)
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withHeaders(mapOf("Content-Type" to "application/json"))
                .withBody(mapper.writeValueAsString(response))
        }

        // /navigation/start endpoint (POST)
        if (path == "/navigation/start" && method == "POST") {
            val body = input.body
            if (body.isNullOrBlank()) {
                return createErrorResponse(400, "Missing request body")
            }
            val navRequest = try {
                mapper.readValue(body, NavigationStartRequest::class.java)
            } catch (e: Exception) {
                return createErrorResponse(400, "Invalid request body format: ${e.message}")
            }
            if (navRequest.destination.landmark_id.isBlank() || navRequest.start_location.node_id.isBlank()) {
                return createErrorResponse(400, "destination.landmark_id and start_location.node_id are required")
            }
            val response = handleNavigationStart(navRequest, logger)
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withHeaders(mapOf("Content-Type" to "application/json"))
                .withBody(mapper.writeValueAsString(response))
        }

        // Unknown endpoint
        return createErrorResponse(404, "Endpoint not found")
    }

    private fun handleSearch(query: String, logger: LambdaLogger): SearchResponse {
        // Placeholder for search logic
        val response = SearchResponse(
            results = listOf(
                LandmarkResult("Room 226", 2, "r226_door"),
                LandmarkResult("Room 224", 2, "r224_door")
            )
        )
        return response
    }

    private fun handleNavigationStart(request: NavigationStartRequest, logger: LambdaLogger): NavigationStartResponse {
        val startNodeId = request.start_location.node_id.toIntOrNull()
            ?: throw IllegalArgumentException("Invalid start_location.node_id")
        val destLandmarkId = request.destination.landmark_id.toIntOrNull()
            ?: throw IllegalArgumentException("Invalid destination.landmark_id")

        getDbConnection().use { conn ->
            // 1. Resolve Landmark to Nearest Node
            val destNodeId = getNearestNodeFromLandmark(destLandmarkId, conn)
                ?: throw IllegalArgumentException("Landmark not found or has no associated node.")

            // 2. Identify Building Context (to limit the graph size)
            val buildingId = getBuildingIdForNode(startNodeId, conn)
                ?: throw IllegalArgumentException("Start node does not belong to a recognized building.")

            // 3. Find Shortest Path
            val (pathNodes, _) = calculateShortestPath(buildingId, startNodeId, destNodeId, conn)
            if (pathNodes.isEmpty()) {
                throw RuntimeException("No continuous path exists between these locations.")
            }
            logger.log("Calculated path: ${pathNodes.joinToString(" -> ")}")

            // 4. Transform Path into Instructions
            val instructions = buildInstructions(conn, pathNodes)
            logger.log("Translated instructions")
            instructions.forEach({inst -> 
                logger.log("Instruction: $inst")
            })

            return NavigationStartResponse(
                session_id = "nav_session_${System.currentTimeMillis()}",
                instructions = instructions
            )
        }
    }

    private fun getNearestNodeFromLandmark(landmarkId: Int, conn: Connection): Int? {
        val query = "SELECT NearestNodeID FROM Landmarks WHERE LandmarkID = ?"
        conn.prepareStatement(query).use { stmt -> 
            stmt.setInt(1, landmarkId)
            val rs = stmt.executeQuery()
            if (rs.next()) {
                return rs.getInt("NearestNodeID")
            }
        }
        return null
    }

    private fun getBuildingIdForNode(nodeId: Int, conn: Connection): String? {
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

    private fun calculateShortestPath(buildingId: String, startNode: Int, endNode: Int, conn: Connection): Pair<List<Int>, Double> {
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

    /**
     * Converts a raw list of NodeIDs into the structured payload expected by the frontend.
     * Fetches exact distances and bearings from the MapEdges table.
     */
    private fun buildInstructions(conn: Connection, path: List<Int>): List<NavigationInstruction> {
        if (path.isEmpty()) return emptyList()

        val placeholders = path.joinToString(",") { "?" }
        
        // 1. Fetch Coordinates for all nodes in the path
        val nodeQuery = "SELECT NodeID, CoordinateX, CoordinateY FROM MapNodes WHERE NodeID IN ($placeholders)"
        val nodeData = mutableMapOf<Int, Pair<Int, Int>>()
        
        conn.prepareStatement(nodeQuery).use { stmt ->
            path.forEachIndexed { index, id -> stmt.setInt(index + 1, id) }
            val rs = stmt.executeQuery()
            while (rs.next()) {
                nodeData[rs.getInt("NodeID")] = Pair(rs.getInt("CoordinateX"), rs.getInt("CoordinateY"))
            }
        }

        // 2. Fetch Actual Distances and Bearings for the edges in the path
        // We fetch any edge where BOTH start and end nodes are in our path list.
        val edgeQuery = """
            SELECT StartNodeID, EndNodeID, DistanceMeters, Bearing, IsBidirectional
            FROM MapEdges
            WHERE StartNodeID IN ($placeholders) AND EndNodeID IN ($placeholders)
        """
        
        // Map<Pair<FromNode, ToNode>, Pair<DistanceMeters, Bearing?>>
        val edgeMap = mutableMapOf<Pair<Int, Int>, Pair<Double, Double?>>()
        
        if (path.size > 1) {
            conn.prepareStatement(edgeQuery).use { stmt ->
                // We have two IN clauses, so we bind the path variables twice
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
                    
                    // Forward direction
                    edgeMap[Pair(start, end)] = Pair(dist, bearing)
                    
                    // Reverse direction (if bidirectional, we add 180 degrees to the bearing)
                    if (isBidi) {
                        val reverseBearing = bearing?.let { (it + 180.0) % 360.0 }
                        edgeMap[Pair(end, start)] = Pair(dist, reverseBearing)
                    }
                }
            }
        }

        // 3. Construct the Instructions
        val instructions = mutableListOf<NavigationInstruction>()
        
        for (i in path.indices) {
            val nodeId = path[i]
            val coords = nodeData[nodeId] ?: Pair(0, 0)
            
            var distFeet = 0.0
            var directionStr = "arrive" // Default for the last node
            
            // If we are not at the final destination, look up the edge to the next node
            if (i < path.size - 1) {
                val nextNodeId = path[i + 1]
                val edgeInfo = edgeMap[Pair(nodeId, nextNodeId)]
                
                if (edgeInfo != null) {
                    val distMeters = edgeInfo.first
                    distFeet = distMeters * 3.28084 // Convert to feet
                    
                    directionStr = bearingToDirectionString(edgeInfo.second)
                } else {
                    // Fallback in case edge data is missing
                    directionStr = "continue"
                }
            }
            
            instructions.add(
                NavigationInstruction(
                    step = i + 1,
                    distance_feet = distFeet,
                    direction = directionStr,
                    node_id = nodeId.toString(),
                    coordinates = mapOf(
                        "x" to coords.first.toDouble(),
                        "y" to coords.second.toDouble()
                    )
                )
            )
        }
        return instructions
    }

    /**
     * Converts a numerical bearing (0-360 degrees) into a compass direction.
     * 0/360 = North, 90 = East, 180 = South, 270 = West
     */
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

    private fun createErrorResponse(
        statusCode: Int,
        message: String
    ): APIGatewayProxyResponseEvent {
        val errorBody = mapper.writeValueAsString(mapOf("error" to message))
        return APIGatewayProxyResponseEvent()
            .withStatusCode(statusCode)
            .withBody(errorBody)
            .withHeaders(mapOf("Content-Type" to "application/json"))
    }
}