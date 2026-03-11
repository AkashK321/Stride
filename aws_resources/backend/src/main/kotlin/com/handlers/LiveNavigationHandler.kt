package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketResponse
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import com.services.DynamoDbTableClient
import com.services.RdsMapClient
import com.models.NavigationInstruction
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

    private val pixel_to_feet_ratio = 0.1 // 1 foot in real world corresponds to 10 pixels in our coordinate system (based on populate_floor_data.py)

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

    private val rdsMapClient = RdsMapClient()

    private fun estimateUserLocation(payload: Map<String, Any?>, prevX: Double, prevY: Double, prevTimeMs: Long, logger: LambdaLogger): Pair<Double, Double> {
        val heading = (payload["heading_degrees"] as Number).toDouble()
        val accel = payload["accelerometer"] as Map<*, *>
        val currentTimestampMs = (payload["timestamp_ms"] as Number).toLong()
        
        var currentX = prevX 
        var currentY = prevY

        // 1. Calculate time elapsed since last frame (Delta t)
        var deltaTimeSec = 0.0
        if (prevTimeMs > 0L && currentTimestampMs > prevTimeMs) {
            deltaTimeSec = (currentTimestampMs - prevTimeMs) / 1000.0
        }

        // Cap delta time at 5.0 seconds to prevent massive teleportation if the app is paused/backgrounded
        if (deltaTimeSec > 5.0) {
            deltaTimeSec = 5.0
        }

        // Compute 3D Acceleration Magnitude (Orientation-agnostic)
        val xAccel = (accel["x"] as? Number)?.toDouble() ?: 0.0
        val yAccel = (accel["y"] as? Number)?.toDouble() ?: 0.0
        val zAccel = (accel["z"] as? Number)?.toDouble() ?: 0.0
        
        val magnitude = Math.sqrt((xAccel * xAccel) + (yAccel * yAccel) + (zAccel * zAccel))

        // Movement Heuristic (Gravity is ~1.0g. Bounces > 1.2g indicate walking)
        val isMoving = magnitude > 1.2 

        if (isMoving && deltaTimeSec > 0) {
            // Average human walking speed is ~3.5 feet per second
            val speedFeetPerSec = 3.5
            val distanceFeet = speedFeetPerSec * deltaTimeSec
            
            // Convert to pixels (1 foot = 10 pixels per populate_floor_data.py)
            val distancePixels = distanceFeet * 10
            
            val headingRad = Math.toRadians(heading)
            
            // Apply heading to position (note: Y increases downwards in screen coordinates)
            currentX += distancePixels * Math.sin(headingRad)
            currentY -= distancePixels * Math.cos(headingRad)

            logger.log("Moving detected. DeltaTime: $deltaTimeSec sec, Distance: $distancePixels pixels, Heading: $heading, X: $currentX, Y: $currentY")
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
        logger.log("Payload: $payload")
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
        val currentTimestampMs = (payload["timestamp_ms"] as Number?)?.toLong() ?: System.currentTimeMillis()

        // TODO(business-logic): run live localization using image.
        val sessionData = sessionTableClient.getItemDetails(sessionId)
        val previousX = sessionData?.get("current_x")?.toDoubleOrNull() ?: 0.0
        val previousY = sessionData?.get("current_y")?.toDoubleOrNull() ?: 0.0
        val previousTime = sessionData?.get("last_updated_ms")?.toLongOrNull() ?: 0L
        val destLandmarkId = sessionData?.get("destLandmarkId")?.toString() ?: "unknown"
        val pathNodesRaw = sessionData?.get("path") as String? ?: ""
        val pathNodes = pathNodesRaw.split(",")

        if (sessionData != null) {
            logger.log("Restored session state for $sessionId: prevX=$previousX, prevY=$previousY")
        } else {
            logger.log("New session $sessionId started. Defaulting to (0.0, 0.0).")
        }

        // Execute Location Estimation based purely on PDR
        val (estimatedX, estimatedY) = estimateUserLocation(payload, previousX, previousY, previousTime, logger)
        
        // Execute Closest Node Search
        var closestNodeId: String = "unknown"
        try {
            rdsMapClient.getDbConnection().use { conn ->
                val closestNode = rdsMapClient.getClosestMapNode(conn, estimatedX, estimatedY)
                if (closestNode != null) {
                    closestNodeId = closestNode["NodeID"].toString()
                    logger.log("Estimated Location: ($estimatedX, $estimatedY). Nearest Node: $closestNodeId")
                }
            }
        } catch (e: Exception) {
            logger.log("Database error resolving closest map node: ${e.message}")
        }

        val instructions: List<NavigationInstruction>
        try {
            if (closestNodeId == "unkown" || !pathNodes.contains(closestNodeId)) {
                logger.log("Estimated closest node $closestNodeId is not on the original path. Recalculating path")
                rdsMapClient.getDbConnection().use { conn ->
                    // 1. Resolve Landmark to Nearest Node
                    val landmark = rdsMapClient.getLandmark(destLandmarkId.toInt(), conn)
                        ?: throw IllegalArgumentException("Landmark not found or has no associated node.")

                    val destNodeId = landmark.nearestNodeId

                    // 2. Identify Building Context (to limit the graph size)
                    val buildingId = rdsMapClient.getBuildingIdForNode(closestNodeId, conn)
                        ?: throw IllegalArgumentException("Start node does not belong to a recognized building.")

                    // 3. Find Shortest Path
                    val (pathNodesNew, _) = rdsMapClient.calculateShortestPath(buildingId, closestNodeId, destNodeId, conn)
                    if (pathNodesNew.isEmpty()) {
                        throw RuntimeException("No continuous path exists between these locations.")
                    }
                    logger.log("Calculated path: ${pathNodesNew.joinToString(" -> ")}")

                    // 4. Transform Path into Instructions
                    instructions = rdsMapClient.buildInstructions(conn, pathNodesNew, landmark)
                    logger.log("Translated instructions")
                    instructions.forEach({inst -> 
                        logger.log("Instruction: $inst")
                    })
                }
            } else {
                logger.log("Closest node $closestNodeId is on the original path. No need to recalculate.")
                instructions = emptyList()
            }
        } catch (e: Exception) {
            logger.log("Error during path recalculation or instruction generation: ${e.message}")
            postJsonToConnection(
                apiClient = apiClient,
                connectionId = connectionId,
                payload = mapOf(
                    "type" to "navigation_error",
                    "session_id" to sessionId,
                    "error" to "Failed to calculate navigation instructions: ${e.message}"
                ),
                logger = logger
            )
            return APIGatewayV2WebSocketResponse().apply { statusCode = 500 }
        }

        // Update state in DynamoDB with new estimated location and timestamp. Set TTL for 2 hours to allow stale session cleanup.
        val ttlSeconds = (System.currentTimeMillis() / 1000) + 7200 // 2 hour expiration
        sessionTableClient.putItem(mapOf(
            "session_id" to sessionId,
            "current_x" to estimatedX,
            "current_y" to estimatedY,
            "currentNodeId" to closestNodeId,
            "destLandmarkId" to destLandmarkId,
            "last_updated_ms" to currentTimestampMs,
            "ttl" to ttlSeconds
        ))

        val responsePayload = mapOf(
            "type" to "navigation_update",
            "session_id" to sessionId,
            "current_step" to 1,
            "remaining_instructions" to instructions,
            "request_id" to requestId,
            "message" to "Live navigation infrastructure is wired. Business logic pending.",
            "estimated_position" to mapOf(
                "node_id" to closestNodeId,
                "coordinates" to mapOf(
                    "x_feet" to estimatedX*pixel_to_feet_ratio,
                    "y_feet" to estimatedY*pixel_to_feet_ratio
                )
            )
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
        value.forEach { (_, v) ->
            if (v !is Number) return false
        }
        return true
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
