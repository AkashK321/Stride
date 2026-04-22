package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.models.LiveNavigationRequest
import com.models.MapNode
import com.models.NavigationInstruction
import com.models.SessionData
import com.services.DynamoDbTableClient
import com.services.RdsMapClient
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Base64
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

private val METERS_TO_FEET = 3.28084
private val FEET_TO_PIXELS = 10.0
private val MAX_DISTANCE_FEET = 15.0

private data class MultipartPart(
    val name: String,
    val filename: String?,
    val contentType: String?,
    val data: ByteArray,
)

class LiveNavigationHandler(
    private val objectDetectionHandler: ObjectDetectionHandler = ObjectDetectionHandler(),
) : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val mapper = jacksonObjectMapper()

    private val pixel_to_feet_ratio = 0.1

    private val sessionTableClient = DynamoDbTableClient(
        tableName = System.getenv("SESSION_TABLE_NAME") ?: "NavigationSessionTable",
        primaryKeyName = "session_id",
    )

    private val rdsMapClient = RdsMapClient()

    private fun jsonResponse(statusCode: Int, payload: Map<String, Any?>): APIGatewayProxyResponseEvent {
        return APIGatewayProxyResponseEvent()
            .withStatusCode(statusCode)
            .withHeaders(
                mapOf(
                    "Content-Type" to "application/json",
                ),
            )
            .withBody(mapper.writeValueAsString(payload))
    }

    private fun parseMultipart(bodyBytes: ByteArray, boundary: String): Map<String, MultipartPart> {
        val delimiter = "--$boundary"
        val raw = String(bodyBytes, StandardCharsets.ISO_8859_1)
        val segments = raw.split(delimiter)
        val parts = mutableMapOf<String, MultipartPart>()

        for (segment in segments) {
            if (segment.isBlank() || segment == "--" || segment == "--\r\n") continue

            val trimmedSegment = segment.trimStart('\r', '\n')
            val headerEnd = trimmedSegment.indexOf("\r\n\r\n")
            if (headerEnd < 0) continue

            val headerText = trimmedSegment.substring(0, headerEnd)
            var bodyText = trimmedSegment.substring(headerEnd + 4)
            if (bodyText.endsWith("\r\n")) {
                bodyText = bodyText.substring(0, bodyText.length - 2)
            }

            val headers = headerText.split("\r\n")
            val contentDisposition =
                headers.firstOrNull { it.startsWith("Content-Disposition:", ignoreCase = true) } ?: continue
            val contentType =
                headers.firstOrNull { it.startsWith("Content-Type:", ignoreCase = true) }
                    ?.substringAfter(":")
                    ?.trim()

            val name = Regex("name=\"([^\"]+)\"").find(contentDisposition)?.groupValues?.get(1) ?: continue
            val filename = Regex("filename=\"([^\"]+)\"").find(contentDisposition)?.groupValues?.get(1)
            val data = bodyText.toByteArray(StandardCharsets.ISO_8859_1)

            parts[name] = MultipartPart(
                name = name,
                filename = filename,
                contentType = contentType,
                data = data,
            )
        }

        return parts
    }

    private fun parseMultipartRequest(
        input: APIGatewayProxyRequestEvent,
    ): Pair<Map<String, Any?>?, String?> {
        val contentType = input.headers?.entries
            ?.firstOrNull { it.key.equals("content-type", ignoreCase = true) }
            ?.value
            ?: return Pair(null, "Missing Content-Type header")

        val boundary = Regex("boundary=([^;]+)")
            .find(contentType)
            ?.groupValues
            ?.get(1)
            ?.trim()
            ?.removePrefix("\"")
            ?.removeSuffix("\"")
            ?: return Pair(null, "Invalid multipart request: missing boundary")

        val requestBody = input.body ?: return Pair(null, "Missing request body")
        val bodyBytes = if (input.isBase64Encoded == true) {
            Base64.getDecoder().decode(requestBody)
        } else {
            requestBody.toByteArray(StandardCharsets.ISO_8859_1)
        }

        val parts = parseMultipart(bodyBytes, boundary)
        val metadataPart = parts["metadata"] ?: return Pair(null, "Missing multipart field: metadata")
        val imagePart = parts["image"] ?: return Pair(null, "Missing multipart field: image")
        if (imagePart.data.isEmpty()) return Pair(null, "Invalid multipart field: image is empty")

        val metadata = try {
            mapper.readValue<Map<String, Any?>>(String(metadataPart.data, StandardCharsets.UTF_8)).toMutableMap()
        } catch (_: Exception) {
            return Pair(null, "Invalid metadata JSON")
        }

        metadata["image_base64"] = Base64.getEncoder().encodeToString(imagePart.data)
        return Pair(metadata, null)
    }

    private fun estimateUserLocation(
        heading: Double,
        distanceTraveled: Double,
        prevX: Double,
        prevY: Double,
        logger: LambdaLogger,
    ): Pair<Double, Double> {
        var currentX = prevX
        var currentY = prevY

        if (distanceTraveled > 0) {
            val estimatedHeading = rdsMapClient.snapBearingToMap(heading, 51.0)
            val headingRad = Math.toRadians(estimatedHeading)
            val distancePixels = distanceTraveled * FEET_TO_PIXELS
            val deltaX = distancePixels * sin(headingRad)
            val deltaY = distancePixels * cos(headingRad)

            currentX += deltaX
            currentY += deltaY

            logger.log(
                String.format(
                    "PDR Update | Heading: %.1f°, Snapped: %.1f°, Distance: %.2f ft | ΔX: %.2f, ΔY: %.2f | New PDR Location: (%.2f, %.2f)",
                    heading,
                    estimatedHeading,
                    distanceTraveled,
                    deltaX,
                    deltaY,
                    currentX,
                    currentY,
                ),
            )
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
        logger: LambdaLogger,
    ): Pair<Double, Double> {
        if (detectedObjects.isEmpty()) return Pair(pdrX, pdrY)

        val primaryLandmark = detectedObjects.minByOrNull { it.distanceMeters } ?: return Pair(pdrX, pdrY)

        val distanceFeet = primaryLandmark.distanceMeters * METERS_TO_FEET
        if (distanceFeet > MAX_DISTANCE_FEET) {
            logger.log("Landmark '${primaryLandmark.obj.className}' detected, but ignored. Distance ($distanceFeet ft) exceeds 15 ft threshold.")
            return Pair(pdrX, pdrY)
        }

        val ocrText = primaryLandmark.obj.text
        val landmarkName = if (!ocrText.isNullOrBlank()) ocrText else primaryLandmark.obj.className

        val dbLandmark = rdsMapClient.getDbConnection().use { conn ->
            rdsMapClient.getLandmarkByName(landmarkName, conn)
        }
        if (dbLandmark == null) {
            logger.log("Detected landmark '$landmarkName' not found in RDS database.")
            return Pair(pdrX, pdrY)
        }

        val distancePixels = distanceFeet * FEET_TO_PIXELS
        val headingRad = Math.toRadians(headingDegrees)
        val cvEstimatedX = dbLandmark.coordX - (distancePixels * Math.sin(headingRad))
        val cvEstimatedY = dbLandmark.coordY + (distancePixels * Math.cos(headingRad))

        val maxAlpha = 0.90
        var alpha = maxAlpha * (1.0 - (distanceFeet / MAX_DISTANCE_FEET))
        alpha = max(0.0, Math.min(1.0, alpha))

        val fusedX = (alpha * cvEstimatedX) + ((1.0 - alpha) * pdrX)
        val fusedY = (alpha * cvEstimatedY) + ((1.0 - alpha) * pdrY)

        logger.log(
            String.format(
                "Fusion Applied | Landmark: %s (class=%s) | Dist: %.2f ft | Alpha: %.2f | PDR: (%.1f, %.1f) | CV: (%.1f, %.1f) | Fused: (%.1f, %.1f)",
                landmarkName,
                primaryLandmark.obj.className,
                distanceFeet,
                alpha,
                pdrX,
                pdrY,
                cvEstimatedX,
                cvEstimatedY,
                fusedX,
                fusedY,
            ),
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
            gps = gps,
        )
    }

    private fun getSessionData(tableClient: DynamoDbTableClient, sessionId: String, logger: LambdaLogger): SessionData {
        val item = tableClient.getItemDetails(sessionId)
            ?: return SessionData(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, 0L, "unknown", 0, emptyList())
        return try {
            SessionData(
                previousX = item["current_x"]!!.toDouble(),
                previousY = item["current_y"]!!.toDouble(),
                previousTime = item["last_updated_ms"]?.toLongOrNull() ?: 0L,
                destLandmarkId = item["destLandmarkId"]!!.toString(),
                currentStep = item["currentStep"]?.toIntOrNull() ?: 0,
                pathNodes = item["path"]?.split(",") ?: emptyList(),
            )
        } catch (e: Exception) {
            logger.log("Error occurred while parsing session data for ID: $sessionId")
            SessionData(0.0, 0.0, 0L, "unknown", 0, emptyList())
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

    override fun handleRequest(input: APIGatewayProxyRequestEvent, context: Context): APIGatewayProxyResponseEvent {
        val logger = context.logger
        logger.log("Live navigation HTTP request received.")

        val (payload, payloadError) = parseMultipartRequest(input)
        if (payloadError != null || payload == null) {
            return jsonResponse(
                400,
                mapOf(
                    "type" to "navigation_error",
                    "session_id" to "unknown",
                    "error" to (payloadError ?: "Invalid multipart payload"),
                ),
            )
        }

        val validationError = validateNavigationFramePayload(payload)
        if (validationError != null) {
            return jsonResponse(
                400,
                mapOf(
                    "type" to "navigation_error",
                    "session_id" to ((payload["session_id"] as? String) ?: "unknown"),
                    "request_id" to (payload["request_id"] as? Number)?.toInt(),
                    "error" to validationError,
                ),
            )
        }

        val navRequest = parseNavigationFramePayload(payload)
        val sessionData = getSessionData(sessionTableClient, navRequest.session_id, logger)

        if (sessionData.previousX == Double.POSITIVE_INFINITY && sessionData.previousY == Double.POSITIVE_INFINITY) {
            return jsonResponse(
                400,
                mapOf(
                    "type" to "navigation_error",
                    "session_id" to navRequest.session_id,
                    "request_id" to navRequest.request_id.toInt(),
                    "error" to "Session data not found or invalid. Ensure a navigation session is properly initialized before sending live navigation frames.",
                ),
            )
        }

        val (pdrX, pdrY) = estimateUserLocation(
            navRequest.heading_degrees,
            navRequest.distance_traveled,
            sessionData.previousX,
            sessionData.previousY,
            logger,
        )

        val detectedObjects: List<DetectedObject> = objectDetectionHandler.detectObjectsFromImage(
            imageBase64 = navRequest.image_base64,
            logger = logger,
            focalLength = navRequest.focal_length_pixels,
        )

        val (estimatedX, estimatedY) = fuseLocationWithLandmarks(
            pdrX,
            pdrY,
            navRequest.heading_degrees,
            detectedObjects,
            logger,
        )

        var closestNodeId = "unknown"
        var buildingId = "unknown"
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

        val instructions: List<NavigationInstruction>
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

                val reachedNextNode = distToNextNode <= 2.0

                if (isOffPath) {
                    logger.log("Node $closestNodeId is off path. Recalculating.")
                    pathRecalculated = true
                    sessionData.currentStep = 0

                    val landmark = rdsMapClient.getLandmark(sessionData.destLandmarkId.toInt(), conn)
                        ?: throw IllegalArgumentException("Landmark not found.")
                    if (buildingId == "unknown") {
                        buildingId = rdsMapClient.getBuildingIdForNode(closestNodeId, conn)
                            ?: throw IllegalArgumentException("Building unknown.")
                    }

                    pathNodesNew = rdsMapClient.calculateShortestPath(
                        buildingId,
                        closestNodeId,
                        landmark.nearestNodeId,
                        conn,
                    ).first
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
                        progress = 0.0
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
            return jsonResponse(
                500,
                mapOf(
                    "type" to "navigation_error",
                    "session_id" to navRequest.session_id,
                    "request_id" to navRequest.request_id.toInt(),
                    "error" to "Failed to calculate navigation instructions: ${e.message}",
                ),
            )
        }

        val logicalCurrentNodeId = if (pathNodesNew.isNotEmpty() && sessionData.currentStep < pathNodesNew.size) {
            pathNodesNew[sessionData.currentStep]
        } else {
            closestNodeId
        }

        val ttlSeconds = (System.currentTimeMillis() / 1000) + 7200
        sessionTableClient.putItem(
            mapOf(
                "session_id" to navRequest.session_id,
                "current_x" to estimatedX,
                "current_y" to estimatedY,
                "currentStep" to sessionData.currentStep,
                "currentNodeId" to logicalCurrentNodeId,
                "destLandmarkId" to sessionData.destLandmarkId,
                "path" to pathNodesNew.joinToString(","),
                "pathRecalculated" to pathRecalculated,
                "last_updated_ms" to navRequest.timestamp_ms,
                "ttl" to ttlSeconds,
            ),
        )

        return jsonResponse(
            200,
            mapOf(
                "type" to "navigation_update",
                "session_id" to navRequest.session_id,
                "current_step" to sessionData.currentStep,
                "remaining_instructions" to instructions,
                "progress" to progress,
                "request_id" to navRequest.request_id.toInt(),
                "message" to "Localization: PDR + landmark fusion executed.",
                "estimated_position" to mapOf(
                    "node_id" to closestNodeId,
                    "coordinates" to mapOf(
                        "x_feet" to estimatedX * pixel_to_feet_ratio,
                        "y_feet" to estimatedY * pixel_to_feet_ratio,
                    ),
                ),
                "processed_at" to Instant.now().toString(),
            ),
        )
    }
}
