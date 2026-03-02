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
import java.net.URI
import java.util.Base64

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

        // TODO(business-logic): resolve session context and current step from persistent session store.
        // TODO(business-logic): run live localization using image + sensor signals.
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
