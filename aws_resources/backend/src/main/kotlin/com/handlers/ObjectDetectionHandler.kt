package com.handlers
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent 
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketResponse
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import java.net.URI
import java.util.Base64
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.services.SageMakerClient
import com.models.InferenceResult

class ObjectDetectionHandler : RequestHandler<APIGatewayV2WebSocketEvent, APIGatewayV2WebSocketResponse> {

    private var apiClient: ApiGatewayManagementApiClient? = null
    private val mapper = jacksonObjectMapper()

    override fun handleRequest(
        input: APIGatewayV2WebSocketEvent, 
        context: Context,
    ): APIGatewayV2WebSocketResponse {
        var logger = context.logger

        var validImage = false
        val connectionId = input.requestContext.connectionId
        val rawData = input.body ?: "{}"
        var imageBytes: ByteArray = ByteArray(0)

        if (apiClient == null) {
            val domainName = input.requestContext.domainName
            val stage = input.requestContext.stage
            val endpoint = "https://$domainName/$stage"

            apiClient = ApiGatewayManagementApiClient.builder()
                .credentialsProvider(EnvironmentVariableCredentialsProvider.create())
                .region(Region.US_EAST_1) // Adjust region as necessary
                .endpointOverride(URI.create(endpoint))
                .httpClient(UrlConnectionHttpClient.create())
                .build()
        }

        logger.log("Processing frame from connection: $connectionId")
        if (rawData == "{}") {
            logger.log("Warning: Received empty frame.")
            return APIGatewayV2WebSocketResponse().apply { statusCode = 400 }
        }

        try {
            val jsonMap = mapper.readValue(rawData, Map::class.java)
            val imageBase64 = jsonMap["body"] as? String ?: ""

            if (imageBase64.isNotEmpty()) {
                imageBytes = Base64.getDecoder().decode(imageBase64)

                // Check Magic Bytes for JPEG (First 2 bytes are FF D8)
                val isJpeg = imageBytes.size > 2 && 
                    imageBytes[0] == 0xFF.toByte() && 
                    imageBytes[1] == 0xD8.toByte()
                
                // Check Magic Bytes for PNG (First 8 bytes are 89 50 4E 47 0D 0A 1A 0A)
                val isPng = imageBytes.size > 8 &&
                    imageBytes[0] == 0x89.toByte() &&
                    imageBytes[1] == 0x50.toByte() &&  // P
                    imageBytes[2] == 0x4E.toByte() &&  // N
                    imageBytes[3] == 0x47.toByte()     // G

                if (isJpeg) {
                    logger.log("Valid JPEG Frame detected. Size: ${imageBytes.size}")
                    validImage = true
                } else if (isPng) {
                    logger.log("Valid PNG Frame detected. Size: ${imageBytes.size}")
                    validImage = true
                } else {
                    logger.log("Data received, but header is not JPEG or PNG.")
                }
            }
    

        } catch (e: IllegalArgumentException) {
            logger.log("Error: Payload is not valid Base64. ${e.message}")
        }

        // Process with SageMaker if valid image (JPEG or PNG)
        val inferenceResult: InferenceResult = if (validImage && imageBytes.isNotEmpty()) {
            try {
                logger.log("Calling SageMaker endpoint for inference...")
                val startTime = System.currentTimeMillis()
                
                val result = SageMakerClient.invokeEndpoint(imageBytes)
                
                val endTime = System.currentTimeMillis()
                logger.log("SageMaker inference completed in ${endTime - startTime}ms")
                logger.log("Detections found: ${result.metadata?.detectionCount ?: 0}")
                
                result
            } catch (e: Exception) {
                logger.log("Error calling SageMaker: ${e.message}")
                e.printStackTrace()
                InferenceResult(
                    status = "error",
                    error = "Failed to call SageMaker: ${e.message}"
                )
            }
        } else {
            // Invalid image or no image
            InferenceResult(
                status = "error",
                error = "Invalid image format. Supported formats: JPEG, PNG"
            )
        }

        // Send response back via WebSocket
        try {
            val responseJson = mapper.writeValueAsString(inferenceResult)
            logger.log("Sending inference results to connection: $connectionId")

            val postRequest = PostToConnectionRequest.builder()
                .connectionId(connectionId)
                .data(SdkBytes.fromByteArray(responseJson.toByteArray()))
                .build()

            apiClient!!.postToConnection(postRequest)
            logger.log("Response sent successfully")
        } catch (e: Exception) {
            logger.log("Caught exception while sending response: ${e.message}")
            e.printStackTrace()
        }

        return APIGatewayV2WebSocketResponse().apply {
            statusCode = 200
            body = "OK"
        }
    }
}