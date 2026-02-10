package com.handlers
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent 
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketResponse
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.LambdaLogger
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sagemakerruntime.SageMakerRuntimeClient
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.ScanRequest
import java.net.URI
import java.util.Base64
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.services.SageMakerClient
import com.models.InferenceResult
import com.models.BoundingBox
import kotlin.collections.emptyList

data class DetectedObject(
    val obj: BoundingBox,
    val distanceMeters: Double
)

class ObjectDetectionHandler (
    private val ddbClient: DynamoDbClient = DynamoDbClient.builder()
        .region(Region.US_EAST_1)
        .httpClient(UrlConnectionHttpClient.create())
        .build(),
    
    private val sagemakerClient: SageMakerRuntimeClient = SageMakerRuntimeClient.builder()
        .region(Region.US_EAST_1)
        .httpClient(UrlConnectionHttpClient.create())
        .build(),

    private val heightMapTableName: String = System.getenv("HEIGHT_MAP_TABLE_NAME") ?: "default-table",

    private val apiGatewayFactory: (String) -> ApiGatewayManagementApiClient = { endpointUrl ->
        ApiGatewayManagementApiClient.builder()
            .region(Region.US_EAST_1)
            .endpointOverride(URI.create(endpointUrl))
            .credentialsProvider(EnvironmentVariableCredentialsProvider.create())
            .httpClient(UrlConnectionHttpClient.create())
            .build()
    }

) : RequestHandler<APIGatewayV2WebSocketEvent, APIGatewayV2WebSocketResponse> {

    private val mapper = jacksonObjectMapper()

    companion object {
        internal val classHeightMap = mutableMapOf<String, Float>()
        internal var isCacheLoaded = false
    }
    
    private fun loadClassHeightCache(logger: LambdaLogger) {
        if (isCacheLoaded) {
            return
        }
        
        val tableName = heightMapTableName
        try {
            val request = ScanRequest.builder().tableName(tableName).build()
            val response = ddbClient.scan(request)

            for (item in response.items()) {
                val name = item["class_name"]?.n()?.toString()
                val height = item["avg_height_meters"]?.s()?.toFloatOrNull()

                if (name != null && height != null) {
                    classHeightMap[name] = height
                }
            }
            isCacheLoaded = true
            logger.log("Class height cache loaded with ${classHeightMap.size} entries.")
        } catch (e: Exception) {
            logger.log("Error loading class height cache: ${e.message}")
            classHeightMap["person"] = 1.7f // Default height
        }
    }
    
    fun estimateDistance(height: Int, obj: String, focalLength: Double = 800.0): Double {
        val avgHeight = classHeightMap[obj] ?: 1.7f

        val perceivedHeight = height.toDouble()
        if (perceivedHeight == 0.0) {
            return 0.0
        }

        return (avgHeight * focalLength) / perceivedHeight
    }

    fun estimateDistances(detections: List<BoundingBox>): List<DetectedObject> {
        if (detections.isEmpty()) {
            return emptyList()
        }

        val detectedObjects = mutableListOf<DetectedObject>()

        detections.forEach( {
            val distance = estimateDistance(it.height.toInt(), it.className)
            detectedObjects.add(DetectedObject(it, distance))
        })
        return detectedObjects
    }

    fun getDetections(validImage: Boolean, imageBytes: ByteArray, logger: LambdaLogger): List<BoundingBox> {
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
        return inferenceResult.detections
    }

    override fun handleRequest(
        input: APIGatewayV2WebSocketEvent, 
        context: Context,
    ): APIGatewayV2WebSocketResponse {
        var logger = context.logger

        var validImage = false
        val connectionId = input.requestContext.connectionId
        val routeKey = input.requestContext.routeKey ?: "unknown"
        val rawData = input.body ?: "{}"
        var imageBytes: ByteArray = ByteArray(0)

        
        val domainName = input.requestContext.domainName
        val stage = input.requestContext.stage
        val endpoint = "https://$domainName/$stage"

        val apiClient = apiGatewayFactory(endpoint)

        loadClassHeightCache(logger)

        // Handle $default route (debugging - should not normally be used)
        if (routeKey == "\$default") {
            logger.log("WARNING: Message received on \$default route - route selection may have failed")
            logger.log("Raw body (first 200 chars): ${rawData.take(200)}")
            
            // Try to send error response
            val errorResponse = mapper.writeValueAsString(mapOf(
                "status" to "error",
                "error" to "Message received on \$default route. Route selection failed. Check that your message has 'action' field."
            ))
            
            try {
                val postRequest = PostToConnectionRequest.builder()
                    .connectionId(connectionId)
                    .data(SdkBytes.fromByteArray(errorResponse.toByteArray()))
                    .build()
                apiClient.postToConnection(postRequest)
                logger.log("Sent error response for \$default route")
            } catch (e: Exception) {
                logger.log("Failed to send error response: ${e.message}")
            }
            
            return APIGatewayV2WebSocketResponse().apply { statusCode = 200 }
        }
        

        logger.log("Processing frame from connection: $connectionId")
        if (rawData == "{}") {
            logger.log("Warning: Received empty frame.")
            return APIGatewayV2WebSocketResponse().apply { statusCode = 400 }
        }

        try {
            logger.log("Parsing JSON body...")
            val jsonMap = mapper.readValue(rawData, Map::class.java)
            val imageBase64 = jsonMap["body"] as? String ?: ""
            logger.log("Base64 string length: ${imageBase64.length}")

            if (imageBase64.isNotEmpty()) {
                logger.log("Decoding base64...")
                imageBytes = Base64.getDecoder().decode(imageBase64)
                logger.log("Decoded image size: ${imageBytes.size} bytes")

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

        //TODO: Run object detection on the imageBytes
        val detections = getDetections(validImage, imageBytes, logger)

        val estimatedDistances = estimateDistances(detections)

        try {
            val distancesList = estimatedDistances.map { detected ->
                mapOf(
                    "className" to detected.obj.className,
                    "distance" to String.format(java.util.Locale.US, "%.3f", detected.distanceMeters)
                )
            }

            val responsePayload = mapOf(
                "frameSize" to imageBytes.size,
                "valid" to validImage,
                "estimatedDistances" to distancesList
            )

            val responseMessage = mapper.writeValueAsString(responsePayload)
            logger.log("Sending response: $responseMessage")

            val postRequest = PostToConnectionRequest.builder()
                .connectionId(connectionId)
                .data(SdkBytes.fromByteArray(responseMessage.toByteArray()))
                .build()

            apiClient.postToConnection(postRequest)
            logger.log("Response sent to connection: $connectionId")
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