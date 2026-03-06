package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketResponse
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import com.services.DynamoDbTableClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest
import java.time.Instant
import java.net.URI
import java.util.Base64
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest
import java.sql.Connection
import java.sql.DriverManager
import kotlin.math.cos
import kotlin.math.sin

class LiveNavigationHandler : RequestHandler<APIGatewayV2WebSocketEvent, APIGatewayV2WebSocketResponse> {

    private val mapper = jacksonObjectMapper()

    private val apiGatewayFactory: (String) -> ApiGatewayManagementApiClient = { endpointUrl ->
        ApiGatewayManagementApiClient.builder()
            .region(Region.US_EAST_1)
            .endpointOverride(URI.create(endpointUrl))
            .credentialsProvider(EnvironmentVariableCredentialsProvider.create())
            .httpClient(UrlConnectionHttpClient.create())
            .build()
    }

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

        if (!secretArn.isNullOrBlank()) {
            val secretsClient = SecretsManagerClient.builder()
                .region(Region.US_EAST_1)
                .build()

            val valueRequest = GetSecretValueRequest.builder().secretId(secretArn).build()
            val secretString = secretsClient.getSecretValue(valueRequest).secretString()
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

    private fun getClosestMapNode(conn: Connection, x: Double, y: Double): Map<String, Any>? {
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

    private fun estimateUserLocation(payload: Map<String, Any?>, prevX: Double, prevY: Double): Pair<Double, Double> {
        val heading = (payload["heading_degrees"] as Number).toDouble()
        val accel = payload["accelerometer"] as Map<*, *>
        
        var currentX = prevX 
        var currentY = prevY

        // Pedestrian Dead Reckoning (PDR)
        val yAccel = (accel["y"] as Number).toDouble()
        
        // Simple heuristic: if y-acceleration exceeds threshold, consider it a step.
        // Can be improved later with sliding window peak detection.
        val isMoving = yAccel > 1.2 

        if (isMoving) {
            val stepSizeMeters = 0.762 // Avg human step is ~2.5 feet (0.762 meters)
            val stepSizePixels = stepSizeMeters * 3.28084 * 10 // Convert to pixels (1 foot = 10 pixels per populate_floor_data.py)
            
            val headingRad = Math.toRadians(heading)
            
            // Apply heading to position (note: Y increases downwards in screen/image coordinates)
            // 0 degrees = North (up, -y), 90 degrees = East (right, +x), etc.
            currentX += stepSizePixels * sin(headingRad)
            currentY -= stepSizePixels * cos(headingRad)
        }
        
        return Pair(currentX, currentY)
    }

    override fun handleRequest(
        input: APIGatewayV2WebSocketEvent,
        context: Context
    ): APIGatewayV2WebSocketResponse {
        val logger = context.logger
        val requestContext = input.requestContext

        val connectionId = requestContext.connectionId
        val domainName = requestContext.domainName
        val stage = requestContext.stage
        val routeKey = requestContext.routeKey ?: "unknown"

        if (connectionId.isNullOrBlank() || domainName.isNullOrBlank() || stage.isNullOrBlank()) {
            logger.log("Missing request context fields required for WebSocket response")
            return APIGatewayV2WebSocketResponse().apply {
                statusCode = 400
                body = "Missing WebSocket request context"
            }
        }

        val endpoint = "https://$domainName/$stage"
        val apiClient = apiGatewayFactory(endpoint)
        val rawBody = input.body ?: ""

        logger.log("Live navigation request received on route: $routeKey")

        if (routeKey == "\$default") {
            postJsonToConnection(
                apiClient = apiClient,
                connectionId = connectionId,
                payload = mapOf(
                    "type" to "navigation_error",
                    "session_id" to "unknown",
                    "error" to "Route selection failed. Use the 'navigation' WebSocket route."
                ),
                logger = logger
            )
            return APIGatewayV2WebSocketResponse().apply { statusCode = 200 }
        }

        // Defensive guard: this handler should only process the dedicated live-nav route.
        if (routeKey != "navigation") {
            postJsonToConnection(
                apiClient = apiClient,
                connectionId = connectionId,
                payload = mapOf(
                    "type" to "navigation_error",
                    "session_id" to "unknown",
                    "error" to "Unsupported route '$routeKey'. Use 'navigation'."
                ),
                logger = logger
            )
            return APIGatewayV2WebSocketResponse().apply { statusCode = 400 }
        }

        val payload = try {
            mapper.readValue<Map<String, Any?>>(rawBody)
        } catch (e: Exception) {
            postJsonToConnection(
                apiClient = apiClient,
                connectionId = connectionId,
                payload = mapOf(
                    "type" to "navigation_error",
                    "session_id" to "unknown",
                    "error" to "Invalid JSON payload"
                ),
                logger = logger
            )
            return APIGatewayV2WebSocketResponse().apply { statusCode = 400 }
        }

        val validationError = validateNavigationFramePayload(payload)
        if (validationError != null) {
            val sessionId = (payload["session_id"] as? String) ?: "unknown"
            val requestId = (payload["request_id"] as? Number)?.toInt()
            val errorPayload = mutableMapOf<String, Any>(
                "type" to "navigation_error",
                "session_id" to sessionId,
                "error" to validationError
            )
            if (requestId != null) {
                errorPayload["request_id"] = requestId
            }

            postJsonToConnection(
                apiClient = apiClient,
                connectionId = connectionId,
                payload = errorPayload,
                logger = logger
            )
            return APIGatewayV2WebSocketResponse().apply { statusCode = 400 }
        }

        val sessionId = payload["session_id"] as String
        val requestId = (payload["request_id"] as Number).toInt()

        // TODO(business-logic): run live localization using image.
        val sessionData = sessionTableClient.getItemDetails(sessionId)
        val previousX = sessionData?.get("current_x")?.toDoubleOrNull() ?: 0.0
        val previousY = sessionData?.get("current_y")?.toDoubleOrNull() ?: 0.0

        if (sessionData != null) {
            logger.log("Restored session state for $sessionId: prevX=$previousX, prevY=$previousY")
        } else {
            logger.log("New session $sessionId started. Defaulting to (0.0, 0.0).")
        }

        // Execute Location Estimation based purely on PDR
        val (estimatedX, estimatedY) = estimateUserLocation(payload, previousX, previousY)
        // Update state in DynamoDB with new estimated location and timestamp. Set TTL for 2 hours to allow stale session cleanup.
        val ttlSeconds = (System.currentTimeMillis() / 1000) + 7200 // 2 hour expiration
        sessionTableClient.putItem(mapOf(
            "session_id" to sessionId,
            "current_x" to estimatedX,
            "current_y" to estimatedY,
            "last_updated_ms" to System.currentTimeMillis(),
            "ttl" to ttlSeconds
        ))
        
        // Execute Closest Node Search
        var closestNodeId: String
        try {
            getDbConnection().use { conn ->
                val closestNode = getClosestMapNode(conn, estimatedX, estimatedY)
                if (closestNode != null) {
                    closestNodeId = closestNode["NodeID"].toString()
                    logger.log("Estimated Location: ($estimatedX, $estimatedY). Nearest Node: $closestNodeId")
                }
            }
        } catch (e: Exception) {
            logger.log("Database error resolving closest map node: ${e.message}")
        }

        // TODO(business-logic): compute remaining instructions, estimated position, and completion state.
        val responsePayload = mapOf(
            "type" to "navigation_update",
            "session_id" to sessionId,
            "current_step" to 1,
            "remaining_instructions" to emptyList<Any>(),
            "request_id" to requestId,
            "message" to "Live navigation infrastructure is wired. Business logic pending."
        )

        postJsonToConnection(
            apiClient = apiClient,
            connectionId = connectionId,
            payload = responsePayload,
            logger = logger
        )

        return APIGatewayV2WebSocketResponse().apply {
            statusCode = 200
            body = "OK"
        }
    }

    private fun validateNavigationFramePayload(payload: Map<String, Any?>): String? {
        val sessionId = payload["session_id"] as? String
        if (sessionId.isNullOrBlank()) return "Missing or invalid field: session_id"

        val imageBase64 = payload["image_base64"] as? String
        if (imageBase64.isNullOrBlank()) return "Missing or invalid field: image_base64"
        try {
            Base64.getDecoder().decode(imageBase64)
        } catch (_: IllegalArgumentException) {
            return "Invalid field: image_base64 must be valid Base64"
        }

        val focalLength = (payload["focal_length_pixels"] as? Number)?.toDouble()
            ?: return "Missing or invalid field: focal_length_pixels"
        if (focalLength <= 0.0) return "Invalid field: focal_length_pixels must be > 0"

        val headingDegrees = (payload["heading_degrees"] as? Number)?.toDouble()
            ?: return "Missing or invalid field: heading_degrees"
        if (headingDegrees < 0.0 || headingDegrees > 360.0) {
            return "Invalid field: heading_degrees must be in range [0, 360]"
        }

        val requestId = payload["request_id"] as? Number
            ?: return "Missing or invalid field: request_id"
        if (!isWholeNumber(requestId)) {
            return "Invalid field: request_id must be an integer"
        }

        if (!validateVector3(payload["accelerometer"])) {
            return "Missing or invalid field: accelerometer (x, y, z required)"
        }

        if (!validateVector3(payload["gyroscope"])) {
            return "Missing or invalid field: gyroscope (x, y, z required)"
        }

        val gps = payload["gps"]
        if (gps != null && gps !is Map<*, *>) {
            return "Invalid field: gps must be an object"
        }
        if (gps is Map<*, *>) {
            if (gps["latitude"] !is Number || gps["longitude"] !is Number) {
                return "Invalid field: gps.latitude and gps.longitude are required numbers"
            }
        }

        val timestamp = payload["timestamp_ms"]
        if (timestamp != null && timestamp !is Number) {
            return "Invalid field: timestamp_ms must be a number"
        }

        return null
    }

    private fun validateVector3(value: Any?): Boolean {
        if (value !is Map<*, *>) return false
        return value["x"] is Number && value["y"] is Number && value["z"] is Number
    }

    private fun isWholeNumber(number: Number): Boolean {
        return when (number) {
            is Byte, is Short, is Int, is Long -> true
            is Float -> number % 1 == 0f
            is Double -> number % 1 == 0.0
            else -> false
        }
    }

    private fun postJsonToConnection(
        apiClient: ApiGatewayManagementApiClient,
        connectionId: String,
        payload: Map<String, Any>,
        logger: com.amazonaws.services.lambda.runtime.LambdaLogger
    ) {
        try {
            val message = mapper.writeValueAsString(payload)
            val postRequest = PostToConnectionRequest.builder()
                .connectionId(connectionId)
                .data(SdkBytes.fromByteArray(message.toByteArray()))
                .build()
            apiClient.postToConnection(postRequest)
        } catch (e: Exception) {
            logger.log("Failed to post WebSocket message: ${e.message}")
        }
    }
}
