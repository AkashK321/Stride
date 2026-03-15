package com.handlers

import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest
import com.fasterxml.jackson.module.kotlin.readValue
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.sql.Connection
import java.sql.DriverManager
import java.util.PriorityQueue
import com.services.DynamoDbTableClient

data class LandmarkDetails(
    val id: Int,
    val name: String,
    val nearestNodeId: String,
    val distanceToNode: Double,
    val bearingFromNode: String,
    val coordX: Int,
    val coordY: Int
)

data class LandmarkResult(
    val landmark_id: Int,
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
    val coordinates: Map<String, Double>,
    val heading_degrees: Double?
)

data class NavigationStartResponse(
    val session_id: String,
    val instructions: List<NavigationInstruction>
)

class StaticNavigationHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val mapper = jacksonObjectMapper()

    private val sessionTableClient = DynamoDbTableClient(
        tableName = System.getenv("SESSION_TABLE_NAME") ?: "NavigationSessionTable",
        primaryKeyName = "session_id"
    )

    private fun getDbConnection(): Connection {
        val dbHost = System.getenv("DB_HOST") ?: "localhost"
        val dbPort = System.getenv("DB_PORT") ?: "5432"
        val dbName = System.getenv("DB_NAME") ?: "stride_db"
        val secretArn = System.getenv("DB_SECRET_ARN")
        
        val dbUser: String
        val dbPassword: String

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
            dbUser = System.getenv("DB_USER") ?: "postgres"
            dbPassword = System.getenv("DB_PASSWORD") ?: "password"
        }

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
            if (query == null || query.trim().isEmpty()) {
                return createErrorResponse(400, "Query parameter 'query' is required and must be at least 1 character")
            }
            
            // Parse the optional limit parameter, default to 10 if missing or invalid
            val limitStr = input.queryStringParameters?.get("limit")
            val limit = limitStr?.toIntOrNull() ?: 10

            return try {
                val response = handleSearch(query.trim(), limit, logger)
                APIGatewayProxyResponseEvent()
                    .withStatusCode(200)
                    .withHeaders(mapOf("Content-Type" to "application/json"))
                    .withBody(mapper.writeValueAsString(response))
            } catch (e: Exception) {
                logger.log("Search error: ${e.message}")
                createErrorResponse(500, "Internal server error")
            }
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

    private fun handleSearch(query: String, limit: Int, logger: LambdaLogger): SearchResponse {
        val results = mutableListOf<LandmarkResult>()

        getDbConnection().use { conn ->
            // Join Landmarks and Floors; Landmarks.NearestNodeID now stores the canonical string node ID.
            val sql = """
                SELECT l.LandmarkID, l.Name, f.FloorNumber,
                       l.NearestNodeID AS NearestNodeDisplay
                FROM Landmarks l
                JOIN Floors f ON l.FloorID = f.FloorID
                WHERE l.Name ILIKE ?
                LIMIT ?
            """.trimIndent()

            conn.prepareStatement(sql).use { stmt ->
                stmt.setString(1, "%$query%")
                stmt.setInt(2, limit)

                val rs = stmt.executeQuery()
                while (rs.next()) {
                    results.add(
                        LandmarkResult(
                            landmark_id = rs.getInt("LandmarkID"),
                            name = rs.getString("Name"),
                            floor_number = rs.getInt("FloorNumber"),
                            nearest_node = rs.getString("NearestNodeDisplay")
                        )
                    )
                }
            }
        }

        logger.log("Found ${results.size} results for query: $query")
        return SearchResponse(results)
    }

    private fun handleNavigationStart(request: NavigationStartRequest, logger: LambdaLogger): NavigationStartResponse {
        val destLandmarkId = request.destination.landmark_id.toIntOrNull()
            ?: throw IllegalArgumentException("Invalid destination.landmark_id")

        getDbConnection().use { conn ->
            // Resolve start node: accept integer string or NodeIDString (e.g. "staircase_main_2S01")
            val startNodeId = resolveStartNodeId(conn, request.start_location.node_id)
                ?: throw IllegalArgumentException("Invalid start_location.node_id")

            // 1. Resolve Landmark to Nearest Node
            val landmark = getLandmarkDetails(destLandmarkId, conn)
                ?: throw IllegalArgumentException("Landmark not found or has no associated node.")

            val destNodeId = landmark.nearestNodeId

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
            val instructions = buildInstructions(conn, pathNodes, landmark)
            logger.log("Translated instructions")
            instructions.forEach({inst -> 
                logger.log("Instruction: $inst")
            })

            val sessionId = "nav_session_${System.currentTimeMillis()}"

            // 5. Initialize the Live Navigation Session in DynamoDB
            try {
                // The first instruction step is the starting node, which contains the start X and Y (in pixels)
                val startX = instructions.firstOrNull()?.coordinates?.get("x") ?: 0.0
                val startY = instructions.firstOrNull()?.coordinates?.get("y") ?: 0.0
                
                val ttlSeconds = (System.currentTimeMillis() / 1000) + 7200 // 2 hour expiration
                
                sessionTableClient.putItem(mapOf(
                    "session_id" to sessionId,
                    "current_x" to startX,
                    "current_y" to startY,
                    "last_updated_ms" to System.currentTimeMillis(), // Initial timestamp for delta-t calculations
                    "ttl" to ttlSeconds
                ))
                logger.log("Successfully initialized DynamoDB session state for $sessionId at ($startX, $startY)")
            } catch (e: Exception) {
                logger.log("Error initializing session in DynamoDB: ${e.message}")
            }

            return NavigationStartResponse(
                session_id = sessionId,
                instructions = instructions
            )
        }
    }

    private fun getLandmarkDetails(landmarkId: Int, conn: Connection): LandmarkDetails? {
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

    private fun getBuildingIdForNode(nodeId: String, conn: Connection): String? {
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
    private fun resolveStartNodeId(conn: Connection, nodeIdRaw: String): String? {
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

    private fun calculateShortestPath(buildingId: String, startNode: String, endNode: String, conn: Connection): Pair<List<String>, Double> {
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
    private fun buildInstructions(conn: Connection, path: List<String>, landmark: LandmarkDetails): List<NavigationInstruction> {
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
                Triple(landmark.distanceToNode * 3.28084, "Head ${landmark.bearingFromNode}", null)
            }
            
            instructions.add(
                NavigationInstruction(
                    step = i + 1,
                    distance_feet = distFeet,
                    direction = directionStr,
                        node_id = nodeId,
                    coordinates = mapOf("x" to coords.first.toDouble(), "y" to coords.second.toDouble()),
                    heading_degrees = headingDegrees
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
                heading_degrees = null
            )
        )

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
