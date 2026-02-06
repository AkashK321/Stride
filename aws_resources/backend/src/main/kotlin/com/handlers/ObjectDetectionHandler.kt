package com.handlers
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent 
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketResponse
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.LambdaLogger
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.ScanRequest
import java.net.URI
import java.util.Base64
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

data class DetectionResult(
    val classId: Int, //COCO class id
    val confidence: Float,
    val bbox: List<Float>, // [x, y, w, h]
    val distanceMeters: Float
)

class ObjectDetectionHandler : RequestHandler<APIGatewayV2WebSocketEvent, APIGatewayV2WebSocketResponse> {

    private var apiClient: ApiGatewayManagementApiClient? = null
    private val mapper = jacksonObjectMapper()

    companion object {
        private val classHeightMap = mutableMapOf<Int, Float>()
        private var isCacheLoaded = false
    }

    private val ddbClient = DynamoDbClient.builder()
        .region(Region.US_EAST_1)
        .httpClient(UrlConnectionHttpClient.create())
        .build()
    
    private fun loadClassHeightCache(logger: LambdaLogger) {
        if (isCacheLoaded) {
            return
        }
        
        val tableName = System.getenv("CONFIG_TABLE_NAME")
        try {
            val request = ScanRequest.builder().tableName(tableName).build()
            val response = ddbClient.scan(request)

            for (item in response.items()) {
                val id = item["class_id"]?.n()?.toIntOrNull()
                val height = item["avg_height_meters"]?.s()?.toFloatOrNull()

                if (id != null && height != null) {
                    classHeightMap[id] = height
                }
            }
            isCacheLoaded = true
            logger.log("Class height cache loaded with ${classHeightMap.size} entries.")
        } catch (e: Exception) {
            logger.log("Error loading class height cache: ${e.message}")
            classHeightMap[0] = 1.7f // Default height
        }
    }
    
    fun estimateDistance(height: Int, obj: Int, focalLength: Double = 700.0): Double {
        val avgHeight = classHeightMap[obj] ?: 1.7f

        val perceivedHeight = height.toDouble()
        return (avgHeight * focalLength) / perceivedHeight
    }

    fun estimateDistances(detections: List<DetectionResult>): List<DetectionResult> {
        return detections.map { detection ->
            val distance = estimateDistance(
                height = detection.bbox[3].toInt(),
                obj = detection.classId
            )
            detection.copy(distanceMeters = distance.toFloat())
        }
    }

    fun getDetections(imageBytes: ByteArray): List<DetectionResult> {
        TODO("Implement object detection logic with SageMaker")
    }

    override fun handleRequest(
        input: APIGatewayV2WebSocketEvent, 
        context: Context,
    ): APIGatewayV2WebSocketResponse {
        var logger = context.logger

        var validImage = false
        val connectionId = input.requestContext.connectionId
        val rawData = input.body ?: "{}"
        var imageBytes: ByteArray = ByteArray(0)

        loadClassHeightCache(logger)

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
                if (imageBytes.size > 2 && 
                    imageBytes[0] == 0xFF.toByte() && 
                    imageBytes[1] == 0xD8.toByte()) {
                        
                    logger.log("Valid JPEG Frame detected. Size: ${imageBytes.size}")
                    validImage = true
                    
                } else {
                    logger.log("Data received, but header is not JPEG.")
                }
            }
        } catch (e: IllegalArgumentException) {
            logger.log("Error: Payload is not valid Base64. ${e.message}")
        }

        //TODO: Run object detection on the imageBytes
        val detections = getDetections(imageBytes)

        val estimatedDistances = estimateDistances(detections)

        try {
            val responseMessage = "Frame received: ${imageBytes.size} bytes, Valid JPEG: $validImage, Estimated Distances: ${estimatedDistances.size}"
            logger.log("Sending response: $responseMessage")

            val postRequest = PostToConnectionRequest.builder()
                .connectionId(connectionId)
                .data(SdkBytes.fromByteArray(responseMessage.toByteArray()))
                .build()

            apiClient!!.postToConnection(postRequest)
            logger.log("Response sent to connection: $connectionId")
        } catch (e: Exception) {
            logger.log("Caught exception while sending acknowledgment: ${e.message}")
        }

        return APIGatewayV2WebSocketResponse().apply {
            statusCode = 200
            body = "OK"
        }
    }
}