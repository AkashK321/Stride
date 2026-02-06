package com.services

import com.models.BoundingBox
import com.models.InferenceResult
import com.models.Metadata
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sagemakerruntime.SageMakerRuntimeClient
import software.amazon.awssdk.services.sagemakerruntime.model.InvokeEndpointRequest
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Duration

/**
 * Client for invoking SageMaker YOLOv11 endpoint
 * Singleton pattern - client is initialized once and reused
 */
object SageMakerClient {
    
    private val mapper = jacksonObjectMapper()
    private var client: SageMakerRuntimeClient? = null
    private var endpointName: String? = null
    
    /**
     * Initialize the SageMaker client
     * Called once on first use
     */
    private fun initialize() {
        if (client == null) {
            endpointName = System.getenv("SAGEMAKER_ENDPOINT_NAME") 
                ?: throw IllegalStateException("SAGEMAKER_ENDPOINT_NAME environment variable not set")
            
            val region = System.getenv("AWS_REGION_SAGEMAKER") ?: "us-east-1"
            
            client = SageMakerRuntimeClient.builder()
                .region(Region.of(region))
                .credentialsProvider(EnvironmentVariableCredentialsProvider.create())
                .httpClient(UrlConnectionHttpClient.builder().build())
                .overrideConfiguration { config ->
                    config.apiCallTimeout(Duration.ofSeconds(30))
                    config.apiCallAttemptTimeout(Duration.ofSeconds(30))
                }
                .build()
            
            println("SageMaker client initialized for endpoint: $endpointName")
        }
    }
    
    /**
     * Invoke the SageMaker endpoint with image bytes
     * 
     * @param imageBytes Raw JPEG image bytes
     * @return InferenceResult with detections or error
     */
    fun invokeEndpoint(imageBytes: ByteArray): InferenceResult {
        try {
            // Ensure client is initialized
            initialize()
            
            val startTime = System.currentTimeMillis()
            
            // Detect content type based on magic bytes
            val contentType = when {
                // JPEG: FF D8
                imageBytes.size > 2 && 
                    imageBytes[0] == 0xFF.toByte() && 
                    imageBytes[1] == 0xD8.toByte() -> "image/jpeg"
                // PNG: 89 50 4E 47
                imageBytes.size > 4 &&
                    imageBytes[0] == 0x89.toByte() &&
                    imageBytes[1] == 0x50.toByte() &&
                    imageBytes[2] == 0x4E.toByte() &&
                    imageBytes[3] == 0x47.toByte() -> "image/png"
                // Default to octet-stream
                else -> "application/octet-stream"
            }
            
            // Create SageMaker request
            val request = InvokeEndpointRequest.builder()
                .endpointName(endpointName)
                .contentType(contentType)
                .accept("application/json")
                .body(SdkBytes.fromByteArray(imageBytes))
                .build()
            
            // Call SageMaker endpoint
            val response = client!!.invokeEndpoint(request)
            val responseBody = response.body().asUtf8String()
            
            val inferenceTime = System.currentTimeMillis() - startTime
            
            // Parse response (Ultralytics format)
            val sagemakerResponse = mapper.readValue<SageMakerResponse>(responseBody)
            
            // Check if inference was successful
            if (!sagemakerResponse.success) {
                return InferenceResult(
                    status = "error",
                    error = sagemakerResponse.error ?: "Unknown error from SageMaker"
                )
            }
            
            // Convert predictions to our format
            val detections = sagemakerResponse.predictions.map { pred ->
                // Convert (x1, y1, x2, y2) to (x, y, width, height)
                val x = pred.box.x1
                val y = pred.box.y1
                val width = pred.box.x2 - pred.box.x1
                val height = pred.box.y2 - pred.box.y1
                
                BoundingBox(
                    x = x,
                    y = y,
                    width = width,
                    height = height,
                    className = pred.className,
                    confidence = pred.confidence
                )
            }
            
            // Create metadata
            val metadata = Metadata(
                imageWidth = sagemakerResponse.image.width,
                imageHeight = sagemakerResponse.image.height,
                inferenceTimeMs = inferenceTime,
                detectionCount = detections.size
            )
            
            return InferenceResult(
                status = "success",
                detections = detections,
                metadata = metadata
            )
            
        } catch (e: Exception) {
            println("Error invoking SageMaker endpoint: ${e.message}")
            e.printStackTrace()
            
            return InferenceResult(
                status = "error",
                error = "SageMaker inference failed: ${e.message}"
            )
        }
    }
}

/**
 * Data classes for parsing SageMaker response (Ultralytics format)
 */
private data class SageMakerResponse(
    val success: Boolean,
    val predictions: List<Prediction>,
    val image: ImageInfo,
    val error: String? = null
)

private data class Prediction(
    @JsonProperty("class") val className: String,
    val confidence: Float,
    val box: Box
)

private data class Box(
    val x1: Int,
    val y1: Int,
    val x2: Int,
    val y2: Int
)

private data class ImageInfo(
    val width: Int,
    val height: Int
)
