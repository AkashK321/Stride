package com.services

import com.models.InferenceResult
import com.services.inference.UltralyticsInferenceParser
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sagemakerruntime.SageMakerRuntimeClient
import software.amazon.awssdk.services.sagemakerruntime.model.InvokeEndpointRequest
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import java.time.Duration

/**
 * Client for invoking SageMaker YOLOv11 endpoint
 * Singleton pattern - client is initialized once and reused
 */
object SageMakerClient {

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
     * @param imageBytes Raw JPEG/PNG image bytes
     * @return InferenceResult with detections or error
     */
    fun invokeEndpoint(imageBytes: ByteArray): InferenceResult {
        try {
            initialize()

            val startTime = System.currentTimeMillis()

            val contentType = when {
                imageBytes.size > 2 &&
                    imageBytes[0] == 0xFF.toByte() &&
                    imageBytes[1] == 0xD8.toByte() -> "image/jpeg"
                imageBytes.size > 4 &&
                    imageBytes[0] == 0x89.toByte() &&
                    imageBytes[1] == 0x50.toByte() &&
                    imageBytes[2] == 0x4E.toByte() &&
                    imageBytes[3] == 0x47.toByte() -> "image/png"
                else -> "application/octet-stream"
            }

            val request = InvokeEndpointRequest.builder()
                .endpointName(endpointName)
                .contentType(contentType)
                .accept("application/json")
                .body(SdkBytes.fromByteArray(imageBytes))
                .build()

            val response = client!!.invokeEndpoint(request)
            val responseBody = response.body().asUtf8String()

            val inferenceTime = System.currentTimeMillis() - startTime

            return UltralyticsInferenceParser.parse(responseBody, inferenceTimeMs = inferenceTime)
        } catch (e: Exception) {
            println("Error invoking SageMaker endpoint: ${e.message}")
            e.printStackTrace()

            return InferenceResult(
                status = "error",
                error = "SageMaker inference failed: ${e.message}",
            )
        }
    }
}
