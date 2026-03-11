package com.handlers

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.services.DynamoDbTableClient
import com.services.RdsMapClient
import com.models.LandmarkResult
import com.models.NavigationInstruction
import com.models.NavigationStartRequest
import com.models.NavigationStartResponse
import com.models.SearchResponse
import com.models.Destination
import com.models.StartLocation

class StaticNavigationHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val mapper = jacksonObjectMapper()

    private val sessionTableClient = DynamoDbTableClient(
        tableName = System.getenv("SESSION_TABLE_NAME") ?: "NavigationSessionTable",
        primaryKeyName = "session_id"
    )

    private val rdsMapClient = RdsMapClient()

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

        rdsMapClient.getDbConnection().use { conn ->
            // Join Landmarks and Floors to get the floor number.
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
        val startNodeId = request.start_location.node_id.toIntOrNull()
            ?: throw IllegalArgumentException("Invalid start_location.node_id")
        val destLandmarkId = request.destination.landmark_id.toIntOrNull()
            ?: throw IllegalArgumentException("Invalid destination.landmark_id")

        rdsMapClient.getDbConnection().use { conn ->
            // 1. Resolve Landmark to Nearest Node
            val landmark = rdsMapClient.getLandmark(destLandmarkId, conn)
                ?: throw IllegalArgumentException("Landmark not found or has no associated node.")

            val destNodeId = landmark.nearestNodeId

            // 2. Identify Building Context (to limit the graph size)
            val buildingId = rdsMapClient.getBuildingIdForNode(startNodeId, conn)
                ?: throw IllegalArgumentException("Start node does not belong to a recognized building.")

            // 3. Find Shortest Path
            val (pathNodes, _) = rdsMapClient.calculateShortestPath(buildingId, startNodeId, destNodeId, conn)
            if (pathNodes.isEmpty()) {
                throw RuntimeException("No continuous path exists between these locations.")
            }
            logger.log("Calculated path: ${pathNodes.joinToString(" -> ")}")

            // 4. Transform Path into Instructions
            val instructions = rdsMapClient.buildInstructions(conn, pathNodes, landmark)
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
                    "currentNodeId" to startNodeId,
                    "destLandmarkId" to destLandmarkId,
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