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

data class Detection(
    val classId: Int, //COCO class id
    val confidence: Float,
    val bbox: List<Float>, // [x, y, w, h]
)

data class DetectedObject(
    val obj: Detection,
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

    private val endpointName: String = System.getenv("ENDPOINT_NAME") ?: "default-endpoint",
    private val configTableName: String = System.getenv("CONFIG_TABLE_NAME") ?: "default-table",

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
        internal val classHeightMap = mutableMapOf<Int, Float>()
        internal var isCacheLoaded = false
    }

    // public get classHeightCache() = classHeightMap
    // public get isClassHeightCacheLoaded() = isCacheLoaded
    
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
    
    fun estimateDistance(height: Int, obj: Int, focalLength: Double = 800.0): Double {
        val avgHeight = classHeightMap[obj] ?: 1.7f

        val perceivedHeight = height.toDouble()
        return (avgHeight * focalLength) / perceivedHeight
    }

    fun estimateDistances(detections: List<Detection>): List<DetectedObject> {
        if (detections.isEmpty()) {
            return emptyList()
        }

        val detectedObjects = mutableListOf<DetectedObject>()

        detections.forEach( {
            val distance = estimateDistance(it.bbox[3].toInt(), it.classId)
            detectedObjects.add(DetectedObject(it, distance))
        })
        return detectedObjects
    }

    fun getDetections(imageBytes: ByteArray): List<Detection> {
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
            val distancesList = estimatedDistances.map { detected ->
                mapOf(
                    "classId" to detected.obj.classId,
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

            apiGatewayFactory(endpointName).postToConnection(postRequest)
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