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
import com.models.LiveNavigationRequest
import com.models.SessionData
import com.models.MapNode
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
import kotlin.math.max
import kotlin.math.log
import kotlin.math.sqrt

private val METERS_TO_FEET = 3.28084
private val FEET_TO_PIXELS = 10.0
private val MAX_DISTANCE_FEET = 15.0

class LiveNavigationHandler(
    private val objectDetectionHandler: ObjectDetectionHandler = ObjectDetectionHandler(),
) : RequestHandler<APIGatewayV2WebSocketEvent, APIGatewayV2WebSocketResponse> {

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

    private fun estimateUserLocation(heading: Double, distanceTraveled: Double, prevX: Double, prevY: Double, logger: LambdaLogger): Pair<Double, Double> {
        var currentX = prevX 
        var currentY = prevY

        if (distanceTraveled > 0) {
            // Snap to nearest 90-degree increment + offset to handle sensor drift
            val estimatedHeading = rdsMapClient.snapBearingToMap(heading, 51.0)
            val headingRad = Math.toRadians(estimatedHeading)
            
            // Convert distance traveled from feet back to map pixels
            val distancePixels = distanceTraveled * FEET_TO_PIXELS
            val deltaX = distancePixels * sin(headingRad)
            val deltaY = distancePixels * cos(headingRad)

            currentX += deltaX
            currentY += deltaY

            logger.log(String.format("PDR Update | Heading: %.1f°, Snapped: %.1f°, Distance: %.2f ft | ΔX: %.2f, ΔY: %.2f | New PDR Location: (%.2f, %.2f)", 
                heading, estimatedHeading, distanceTraveled, deltaX, deltaY, currentX, currentY))
        } else {
            logger.log("No movement detected from PDR data. Retaining previous location ($currentX, $currentY).")
        }
        
        return Pair(currentX, currentY)
    }

    private fun getNavigationProgress(nextNode: MapNode?, currX: Double, currY: Double): Double {
        if (nextNode == null) return 0.0
        val dx = currX - nextNode.coordX
        val dy = currY - nextNode.coordY
        return sqrt(dx * dx + dy * dy) * pixel_to_feet_ratio
    }

    private fun fuseLocationWithLandmarks(
        pdrX: Double, 
        pdrY: Double, 
        headingDegrees: Double, 
        detectedObjects: List<DetectedObject>,
        logger: LambdaLogger
    ): Pair<Double, Double> {
        
        // Return early if no objects detected
        if (detectedObjects.isEmpty()) {
            return Pair(pdrX, pdrY)
        }

        // Find the closest confident landmark
        val primaryLandmark = detectedObjects.minByOrNull { it.distanceMeters } ?: return Pair(pdrX, pdrY)
        
        val distanceFeet = primaryLandmark.distanceMeters * METERS_TO_FEET
        
        // Distance Threshold Check (Ignore CV if > 15 feet)
        if (distanceFeet > MAX_DISTANCE_FEET) {
            logger.log("Landmark '${primaryLandmark.obj.className}' detected, but ignored. Distance ($distanceFeet ft) exceeds 15 ft threshold.")
            return Pair(pdrX, pdrY)
        }

        // Use OCR text (room number) as the landmark name when available; fall back to class name
        val ocrText = primaryLandmark.obj.text
        val landmarkName = if (!ocrText.isNullOrBlank()) ocrText else primaryLandmark.obj.className

        val dbLandmark = rdsMapClient.getDbConnection().use { conn -> 
                rdsMapClient.getLandmarkByName(landmarkName, conn)
            }
        if (dbLandmark == null) {
            logger.log("Detected landmark '$landmarkName' not found in RDS database.")
            return Pair(pdrX, pdrY)
        }

        // Calculate Absolute Position from CV & Compass
        val distancePixels = distanceFeet * FEET_TO_PIXELS
        val headingRad = Math.toRadians(headingDegrees)

        // Y increases downwards, Heading 0 is North
        val cvEstimatedX = dbLandmark.coordX - (distancePixels * Math.sin(headingRad))
        val cvEstimatedY = dbLandmark.coordY + (distancePixels * Math.cos(headingRad))

        // Calculate Dynamic Alpha (CV Weight)
        // alpha = maxAlpha at 0 ft, linearly decaying to 0.0 at 15 ft
        val maxAlpha = 0.90 // Cap trust at 90% to prevent jitter if bounding boxes fluctuate
        var alpha = maxAlpha * (1.0 - (distanceFeet / MAX_DISTANCE_FEET))
        
        // Safety clamp to ensure alpha stays between 0.0 and 1.0
        alpha = max(0.0, Math.min(1.0, alpha))

        // Apply Complementary Filter
        val fusedX = (alpha * cvEstimatedX) + ((1.0 - alpha) * pdrX)
        val fusedY = (alpha * cvEstimatedY) + ((1.0 - alpha) * pdrY)

        logger.log(
            String.format(
                "Fusion Applied | Landmark: %s (class=%s) | Dist: %.2f ft | Alpha: %.2f | PDR: (%.1f, %.1f) | CV: (%.1f, %.1f) | Fused: (%.1f, %.1f)",
                landmarkName, primaryLandmark.obj.className, distanceFeet, alpha, pdrX, pdrY, cvEstimatedX, cvEstimatedY, fusedX, fusedY
            )
        )

        return Pair(fusedX, fusedY)
    }

    private fun parseNavigationFramePayload(payload: Map<String, Any?>): LiveNavigationRequest {
        val sessionId = payload["session_id"] as String
        val requestId = (payload["request_id"] as Number).toInt()
        val timestampMs = (payload["timestamp_ms"] as Number).toLong()
        val imageBase64 = payload["image_base64"] as String
        val focalLengthPixels = (payload["focal_length_pixels"] as Number).toDouble()
        val headingDegrees = (payload["heading_degrees"] as Number).toDouble()
        val distanceTraveled = (payload["distance_traveled"] as? Number)?.toDouble() ?: 0.0
        val gps = payload["gps"] as? Map<String, Double> ?: emptyMap()

        return LiveNavigationRequest(
            session_id = sessionId,
            request_id = requestId.toString(),
            timestamp_ms = timestampMs,
            image_base64 = imageBase64,
            focal_length_pixels = focalLengthPixels,
            heading_degrees = headingDegrees,
            distance_traveled = distanceTraveled,
            gps = gps
        )
    }

    private fun getSessionData(tableClient: DynamoDbTableClient, sessionId: String, logger: LambdaLogger): SessionData {
        val item = tableClient.getItemDetails(sessionId) ?: return SessionData(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, 0L, "unknown", 0, emptyList())
        try {
            val sessionData = SessionData(
                previousX = item.get("current_x")!!.toDouble(),
                previousY = item.get("current_y")!!.toDouble(),
                previousTime = item.get("last_updated_ms")?.toLongOrNull() ?: 0L,
                destLandmarkId = item.get("destLandmarkId")!!.toString(),
                currentStep = item.get("currentStep")?.toIntOrNull() ?: 0,
                pathNodes = item.get("path")?.split(",") ?: emptyList()
            )
            return sessionData
        } catch (e: Exception) {
            logger.log("Error occurred while parsing session data for ID: $sessionId")
            return SessionData(0.0, 0.0, 0L, "unknown", 0, emptyList())
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

        val distanceTraveled = payload["distance_traveled"]
        if (distanceTraveled != null && distanceTraveled !is Number) {
            return "Invalid field: distance_traveled must be a number"
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

        val navRequest = parseNavigationFramePayload(payload)

        val sessionData = getSessionData(sessionTableClient, navRequest.session_id, logger)

        if (sessionData.previousX != Double.POSITIVE_INFINITY || sessionData.previousY != Double.POSITIVE_INFINITY) {
            logger.log("Restored session state for ${navRequest.session_id}: prevX=${sessionData.previousX}, prevY=${sessionData.previousY}")
        } else {
            val sessionId = (payload["session_id"] as? String) ?: "unknown"
            val requestId = (payload["request_id"] as? Number)?.toInt()
            val errorPayload = mutableMapOf<String, Any>(
                "type" to "navigation_error",
                "session_id" to sessionId,
                "error" to "Session data not found or invalid. Ensure a navigation session is properly initialized before sending live navigation frames."
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

        // Execute Location Estimation based purely on PDR
        val (pdrX, pdrY) = estimateUserLocation(navRequest.heading_degrees, navRequest.distance_traveled, sessionData.previousX, sessionData.previousY, logger)

        val detectedObjects: List<DetectedObject> =
            objectDetectionHandler.detectObjectsFromImage(
                imageBase64 = navRequest.image_base64,
                logger = logger,
                focalLength = navRequest.focal_length_pixels,
            )

        val (estimatedX, estimatedY) = fuseLocationWithLandmarks(pdrX, pdrY, navRequest.heading_degrees, detectedObjects, logger)
        
        // Execute Closest Node Search
        var closestNodeId: String = "unknown"
        var buildingId: String = "unknown"
        try {
            rdsMapClient.getDbConnection().use { conn ->
                val closestNode = rdsMapClient.getClosestMapNode(conn, estimatedX, estimatedY)
                if (closestNode != null) {
                    closestNodeId = closestNode["NodeID"].toString()
                    buildingId = closestNode["BuildingID"].toString()
                    logger.log("Estimated Location: ($estimatedX, $estimatedY). Nearest Node: $closestNodeId")
                }
            }
        } catch (e: Exception) {
            logger.log("Database error resolving closest map node: ${e.message}")
        }

        var instructions: List<NavigationInstruction>
        var pathNodesNew = sessionData.pathNodes
        var pathRecalculated = false
        var progress = 0.0
        try {
            rdsMapClient.getDbConnection().use { conn ->
                val isOffPath = closestNodeId != "unknown" && !sessionData.pathNodes.contains(closestNodeId)
                
                val nextNodeIndex = sessionData.currentStep + 1
                val nextNodeId = if (nextNodeIndex < sessionData.pathNodes.size) sessionData.pathNodes[nextNodeIndex] else null
                
                var distToNextNode = Double.MAX_VALUE
                if (nextNodeId != null) {
                    val nextNode = rdsMapClient.getNode(nextNodeId, conn)
                    distToNextNode = getNavigationProgress(nextNode, estimatedX, estimatedY)
                }

                // Threshold of 2.0 feet to advance to the next step
                val reachedNextNode = distToNextNode <= 2.0

                if (isOffPath) {
                    logger.log("Node $closestNodeId is off path. Recalculating.")
                    pathRecalculated = true
                    sessionData.currentStep = 0
                    
                    val landmark = rdsMapClient.getLandmark(sessionData.destLandmarkId.toInt(), conn)
                        ?: throw IllegalArgumentException("Landmark not found.")
                    if (buildingId == "unknown") {
                        buildingId = rdsMapClient.getBuildingIdForNode(closestNodeId, conn) ?: throw IllegalArgumentException("Building unknown.")
                    }
                    
                    pathNodesNew = rdsMapClient.calculateShortestPath(buildingId, closestNodeId, landmark.nearestNodeId, conn).first
                    instructions = rdsMapClient.buildInstructions(conn, pathNodesNew, landmark)
                    
                    if (pathNodesNew.size > 1) {
                        val newNextNode = rdsMapClient.getNode(pathNodesNew[1], conn)
                        progress = getNavigationProgress(newNextNode, estimatedX, estimatedY)
                    }

                } else if (reachedNextNode) {
                    logger.log("Reached next node $nextNodeId. Advancing step.")
                    sessionData.currentStep += 1
                    val landmark = rdsMapClient.getLandmark(sessionData.destLandmarkId.toInt(), conn)
                        ?: throw IllegalArgumentException("Landmark not found.")
                    
                    val remainingPath = sessionData.pathNodes.drop(sessionData.currentStep)
                    instructions = rdsMapClient.buildInstructions(conn, remainingPath, landmark)

                    val newNextNodeIndex = sessionData.currentStep + 1
                    if (newNextNodeIndex < sessionData.pathNodes.size) {
                        val newNextNode = rdsMapClient.getNode(sessionData.pathNodes[newNextNodeIndex], conn)
                        progress = getNavigationProgress(newNextNode, estimatedX, estimatedY)
                    } else {
                        progress = 0.0 // Reached final destination node
                    }
                } else {
                    logger.log("Staying on path. Progress to $nextNodeId: $distToNextNode ft")
                    progress = distToNextNode
                    val landmark = rdsMapClient.getLandmark(sessionData.destLandmarkId.toInt(), conn)
                        ?: throw IllegalArgumentException("Landmark not found.")
                    
                    val remainingPath = sessionData.pathNodes.drop(sessionData.currentStep)
                    instructions = rdsMapClient.buildInstructions(conn, remainingPath, landmark)
                }
            }
        } catch (e: Exception) {
            logger.log("Error during path recalculation or instruction generation: ${e.message}")
            postJsonToConnection(
                apiClient = apiClient,
                connectionId = connectionId,
                payload = mapOf(
                    "type" to "navigation_error",
                    "session_id" to navRequest.session_id,
                    "error" to "Failed to calculate navigation instructions: ${e.message}"
                ),
                logger = logger
            )
            return APIGatewayV2WebSocketResponse().apply { statusCode = 500 }
        }

        val logicalCurrentNodeId = if (pathNodesNew.isNotEmpty() && sessionData.currentStep < pathNodesNew.size) {
            pathNodesNew[sessionData.currentStep]
        } else {
            closestNodeId // Fallback if out of bounds
        }

        // Record tracking data dynamically with a standard TTL cleanup strategy
        val ttlSeconds = (System.currentTimeMillis() / 1000) + 7200
        sessionTableClient.putItem(mapOf(
            "session_id" to navRequest.session_id,
            "current_x" to estimatedX,
            "current_y" to estimatedY,
            "currentStep" to sessionData.currentStep,
            "currentNodeId" to logicalCurrentNodeId,
            "destLandmarkId" to sessionData.destLandmarkId,
            "path" to pathNodesNew.joinToString(","),
            "pathRecalculated" to pathRecalculated,
            "last_updated_ms" to navRequest.timestamp_ms,
            "ttl" to ttlSeconds
        ))

        // Return actual location based on user movement, not closest map node
        val responsePayload = mapOf(
            "type" to "navigation_update",
            "session_id" to navRequest.session_id,
            "current_step" to sessionData.currentStep,
            "remaining_instructions" to instructions,
            "progress" to progress, // NEW PROGRESS FIELD ADDED HERE
            "request_id" to navRequest.request_id,
            "message" to "Localization: PDR + landmark fusion executed.",
            "estimated_position" to mapOf(
                "node_id" to closestNodeId,
                "coordinates" to mapOf(
                    "x_feet" to estimatedX * pixel_to_feet_ratio,
                    "y_feet" to estimatedY * pixel_to_feet_ratio
                )
            )
        )

        postJsonToConnection(apiClient, connectionId, responsePayload, logger)
        return APIGatewayV2WebSocketResponse().apply { 
            statusCode = 200
            body = "OK" 
        }
    }
}
