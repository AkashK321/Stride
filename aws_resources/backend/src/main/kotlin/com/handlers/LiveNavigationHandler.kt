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
import com.models.NavigationCoordinates
import com.models.NavigationUpdatePosition
import com.models.NavigationUpdateResponse
import com.models.MapNode
import com.models.NavigationStepType
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
private val PIXEL_TO_FEET = 1.0 / FEET_TO_PIXELS
private val MAX_DISTANCE_FEET = 15.0

class LiveNavigationHandler(
    private val objectDetectionHandler: ObjectDetectionHandler = ObjectDetectionHandler(),
) : RequestHandler<APIGatewayV2WebSocketEvent, APIGatewayV2WebSocketResponse> {

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

    private val rdsMapClient = RdsMapClient()

    private fun logNavTrace(
        logger: LambdaLogger,
        event: String,
        fields: Map<String, Any?>,
    ) {
        try {
            val tracePayload = linkedMapOf<String, Any?>(
                "event" to event,
                "source" to "LiveNavigationHandler",
                "ts_ms" to System.currentTimeMillis(),
            )
            tracePayload.putAll(fields)
            logger.log("[nav-trace] ${mapper.writeValueAsString(tracePayload)}")
        } catch (e: Exception) {
            logger.log("[nav-trace] failed_to_serialize event=$event error=${e.message}")
        }
    }

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
        logger.log("PDR Estimation | Accel Mag: %.2f g | Moving: %b | DeltaTime: %.2f sec".format(magnitude, isMoving, deltaTimeSec))

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

    private fun getNavigationProgress(nextNode: MapNode?, currX: Double, currY: Double): Double {
        if (nextNode == null) return 0.0
        val dx = currX - nextNode.coordX
        val dy = currY - nextNode.coordY
        return sqrt(dx * dx + dy * dy) * PIXEL_TO_FEET
    }

    /**
     * Applies live progress to the active instruction by subtracting traveled distance on the
     * current edge from the first aggregated instruction's remaining distance.
     */
    private fun applyProgressToCurrentInstruction(
        conn: Connection,
        instructions: List<NavigationInstruction>,
        remainingPath: List<String>,
        distToNextNodeFeet: Double,
        logger: LambdaLogger,
    ): List<NavigationInstruction> {
        if (instructions.isEmpty()) return instructions
        val firstInstruction = instructions.first()
        if (firstInstruction.step_type != NavigationStepType.segment) return instructions
        if (remainingPath.size < 2) return instructions
        if (!distToNextNodeFeet.isFinite()) return instructions

        val currentNodeId = remainingPath[0]
        val nextNodeId = remainingPath[1]
        val currentEdgeFeet = rdsMapClient.getEdgeDistanceFeet(conn, currentNodeId, nextNodeId)
            ?: return instructions

        val clampedDistanceToNext = distToNextNodeFeet.coerceIn(0.0, currentEdgeFeet)
        val traveledOnCurrentEdge = (currentEdgeFeet - clampedDistanceToNext).coerceAtLeast(0.0)
        val adjustedDistanceFeet = (firstInstruction.distance_feet - traveledOnCurrentEdge).coerceAtLeast(0.0)
        logger.log(
            String.format(
                "Instruction progress | edge %s->%s: edge=%.2f ft, to_next=%.2f ft, first_step %.2f -> %.2f ft",
                currentNodeId,
                nextNodeId,
                currentEdgeFeet,
                clampedDistanceToNext,
                firstInstruction.distance_feet,
                adjustedDistanceFeet
            )
        )

        return listOf(firstInstruction.copy(distance_feet = adjustedDistanceFeet)) + instructions.drop(1)
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

        // Get Landmark Object from RDS
        val dbLandmark = rdsMapClient.getDbConnection().use { conn -> 
                rdsMapClient.getLandmarkByName(primaryLandmark.obj.className, conn)
            }
        if (dbLandmark == null) {
            logger.log("Detected landmark '${primaryLandmark.obj.className}' not found in RDS database.")
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
                "Fusion Applied | Landmark: %s | Dist: %.2f ft | Alpha: %.2f | PDR: (%.1f, %.1f) | CV: (%.1f, %.1f) | Fused: (%.1f, %.1f)",
                primaryLandmark.obj.className, distanceFeet, alpha, pdrX, pdrY, cvEstimatedX, cvEstimatedY, fusedX, fusedY
            )
        )

        return Pair(fusedX, fusedY)
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
        val imageBase64 = payload["image_base64"] as String
        val focalLength = (payload["focal_length_pixels"] as Number).toDouble()

        logNavTrace(
            logger = logger,
            event = "navigation_request_received",
            fields = mapOf(
                "session_id" to sessionId,
                "request_id" to requestId,
                "route_key" to routeKey,
                "distance_traveled_input_ft" to (payload["distance_traveled"] as? Number)?.toDouble(),
                "heading_degrees" to (payload["heading_degrees"] as? Number)?.toDouble(),
                "timestamp_ms" to currentTimestampMs,
            ),
        )

        val sessionData = sessionTableClient.getItemDetails(sessionId)
        val previousX = sessionData?.get("current_x")?.toDoubleOrNull() ?: 0.0
        val previousY = sessionData?.get("current_y")?.toDoubleOrNull() ?: 0.0
        val previousTime = sessionData?.get("last_updated_ms")?.toLongOrNull() ?: 0L
        val destLandmarkId = sessionData?.get("destLandmarkId")?.toString() ?: "unknown"
        val pathNodesRaw = sessionData?.get("path") ?: ""
        var currentStep = sessionData?.get("currentStep")?.toIntOrNull() ?: 0
        val pathNodes = pathNodesRaw.split(",")

        if (sessionData != null) {
            logger.log("Restored session state for $sessionId: prevX=$previousX, prevY=$previousY")
        } else {
            logger.log("New session $sessionId started. Defaulting to (0.0, 0.0).")
        }

        // Execute Location Estimation based purely on PDR
        val (pdrX, pdrY) = estimateUserLocation(payload, previousX, previousY, previousTime, logger)

        val detectedObjects: List<DetectedObject> =
            objectDetectionHandler.detectObjectsFromImage(
                imageBase64 = imageBase64,
                logger = logger,
                focalLength = focalLength,
            )

        val headingDegrees = (payload["heading_degrees"] as Number).toDouble()
        val (estimatedX, estimatedY) = fuseLocationWithLandmarks(pdrX, pdrY, headingDegrees, detectedObjects, logger)
        
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

        var instructions: List<NavigationInstruction> = emptyList()
        var pathNodesNew: List<String> = emptyList()
        var pathRecalculated = false
        try {
            // Recalculate path if the closes node is not on the origina path
            if (closestNodeId == "unknown" || !pathNodes.contains(closestNodeId)) {
                logger.log("Estimated closest node $closestNodeId is not on the original path. Recalculating path")
                pathRecalculated = true
                currentStep = 0 // Reset step to 0 since we are generating a new path from the current location
                rdsMapClient.getDbConnection().use { conn ->
                    // 1. Resolve Landmark to Nearest Node
                    val landmark = rdsMapClient.getLandmark(destLandmarkId.toInt(), conn)
                        ?: throw IllegalArgumentException("Landmark not found or has no associated node.")

                    val destNodeId = landmark.nearestNodeId

                    // 2. Identify Building Context (to limit the graph size)
                    if (buildingId == "unknown") {
                        buildingId = rdsMapClient.getBuildingIdForNode(closestNodeId, conn)
                            ?: throw IllegalArgumentException("Closest node does not belong to a recognized building.")
                    }
                    // 3. Find Shortest Path
                    pathNodesNew = rdsMapClient.calculateShortestPath(buildingId, closestNodeId, destNodeId, conn).first
                    if (pathNodesNew.isEmpty()) {
                        throw RuntimeException("No continuous path exists between these locations.")
                    }
                    logger.log("Calculated path: ${pathNodesNew.joinToString(" -> ")}")

                    // 4. Transform Path into Instructions
                    var builtInstructions = rdsMapClient.buildInstructions(conn, pathNodesNew, landmark)
                    var progressFeet = 0.0
                    if (pathNodesNew.size > 1) {
                        val newNextNode = rdsMapClient.getNode(pathNodesNew[1], conn)
                        progressFeet = getNavigationProgress(newNextNode, estimatedX, estimatedY)
                    }
                    instructions = applyProgressToCurrentInstruction(
                        conn = conn,
                        instructions = builtInstructions,
                        remainingPath = pathNodesNew,
                        distToNextNodeFeet = progressFeet,
                        logger = logger,
                    )
                    logger.log("Translated instructions")
                    instructions.forEach { inst ->
                        logger.log("Instruction: $inst")
                    }
                }
            } else {
                logger.log("Closest node $closestNodeId is on the original path. No need to recalculate.")
                pathNodesNew = pathNodes.dropWhile({ it != closestNodeId }) // Get remaining path starting from closest node
                if (pathNodesNew.size < pathNodes.size) {
                    currentStep += 1 // Increment step to reflect progress along the path
                }
                instructions = rdsMapClient.getDbConnection().use { conn ->
                    val landmark = rdsMapClient.getLandmark(destLandmarkId.toInt(), conn)
                        ?: throw IllegalArgumentException("Landmark not found or has no associated node.")
                    var builtInstructions = rdsMapClient.buildInstructions(conn, pathNodesNew, landmark)
                    var progressFeet = 0.0
                    if (pathNodesNew.size > 1) {
                        val nextNode = rdsMapClient.getNode(pathNodesNew[1], conn)
                        progressFeet = getNavigationProgress(nextNode, estimatedX, estimatedY)
                    }
                    applyProgressToCurrentInstruction(
                        conn = conn,
                        instructions = builtInstructions,
                        remainingPath = pathNodesNew,
                        distToNextNodeFeet = progressFeet,
                        logger = logger,
                    )
                }
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

        val activePath = pathNodesNew.takeIf { it.isNotEmpty() } ?: pathNodes
        val logicalCurrentNodeId =
            if (activePath.isNotEmpty() && currentStep < activePath.size) activePath[currentStep] else closestNodeId
        val firstInstruction = instructions.firstOrNull()
        logNavTrace(
            logger = logger,
            event = "navigation_update_computed",
            fields = mapOf(
                "session_id" to sessionId,
                "request_id" to requestId,
                "current_step" to currentStep,
                "path_len" to activePath.size,
                "closest_node_id" to closestNodeId,
                "logical_current_node_id" to logicalCurrentNodeId,
                "path_recalculated" to pathRecalculated,
                "instructions_count" to instructions.size,
                "first_instruction_step" to firstInstruction?.step,
                "first_instruction_distance_feet" to firstInstruction?.distance_feet,
                "first_instruction_turn_intent" to firstInstruction?.turn_intent,
                "distance_traveled_input_ft" to (payload["distance_traveled"] as? Number)?.toDouble(),
                "estimated_x" to estimatedX,
                "estimated_y" to estimatedY,
            ),
        )

        // Update state in DynamoDB with new estimated location and timestamp. Set TTL for 2 hours to allow stale session cleanup.
        val ttlSeconds = (System.currentTimeMillis() / 1000) + 7200 // 2 hour expiration
        sessionTableClient.putItem(mapOf(
            "session_id" to sessionId,
            "current_x" to estimatedX,
            "current_y" to estimatedY,
            "currentStep" to currentStep,
            "currentNodeId" to closestNodeId,
            "destLandmarkId" to destLandmarkId,
            "path" to (pathNodesNew.takeIf { 
                            it.isNotEmpty() 
                        }?.joinToString(",") ?: pathNodes.joinToString(",")),
            "pathRecalculated" to pathRecalculated,
            "last_updated_ms" to currentTimestampMs,
            "ttl" to ttlSeconds
        ))

        val responsePayload = NavigationUpdateResponse(
            type = "navigation_update",
            session_id = sessionId,
            current_step = currentStep,
            remaining_instructions = instructions,
            request_id = requestId,
            message = "Localization: PDR + landmark fusion; closest map node returned in estimated_position.",
            estimated_position = NavigationUpdatePosition(
                node_id = closestNodeId,
                coordinates = NavigationCoordinates(
                    x = estimatedX,
                    y = estimatedY
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
        payload: Any,
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
