package com.services

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.models.InferenceResult
import com.services.inference.UltralyticsInferenceParser
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * POSTs image bytes to an Ultralytics-compatible HTTP server ([INFERENCE_HTTP_URL]/invocations).
 * Used when [INFERENCE_HTTP_URL] is set (e.g. VPC-local endpoint, load balancer, or tunneled dev server).
 */
object HttpInferenceClient {

    const val ENV_INFERENCE_HTTP_URL = "INFERENCE_HTTP_URL"
    /** Must match dashboard session token when inference_server runs with INFERENCE_REQUIRE_SESSION=1. */
    const val ENV_INFERENCE_HTTP_SECRET = "INFERENCE_HTTP_SECRET"
    const val HEADER_INFERENCE_SECRET = "X-Stride-Inference-Secret"

    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    fun baseUrl(): String? = System.getenv(ENV_INFERENCE_HTTP_URL)?.trim()?.takeIf { it.isNotEmpty() }

    fun invokeEndpoint(imageBytes: ByteArray): InferenceResult {
        val base = baseUrl()
            ?: return InferenceResult(
                status = "error",
                error = "$ENV_INFERENCE_HTTP_URL is not set",
            )

        val invocationsUri = try {
            val normalized = base.trimEnd('/')
            URI.create("$normalized/invocations")
        } catch (e: Exception) {
            return InferenceResult(
                status = "error",
                error = "Invalid $ENV_INFERENCE_HTTP_URL: ${e.message}",
            )
        }

        val contentType = detectContentType(imageBytes)
        val startTime = System.currentTimeMillis()

        return try {
            val secret = System.getenv(ENV_INFERENCE_HTTP_SECRET)?.trim()?.takeIf { it.isNotEmpty() }

            val reqBuilder = HttpRequest.newBuilder()
                .uri(invocationsUri)
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", contentType)
                .header("Accept", "application/json")

            if (secret != null) {
                reqBuilder.header(HEADER_INFERENCE_SECRET, secret)
            }

            val request = reqBuilder
                .POST(HttpRequest.BodyPublishers.ofByteArray(imageBytes))
                .build()

            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            val elapsed = System.currentTimeMillis() - startTime

            val body = response.body()
            if (response.statusCode() in 200..299) {
                UltralyticsInferenceParser.parse(body, inferenceTimeMs = elapsed)
            } else {
                InferenceResult(
                    status = "error",
                    error = "HTTP ${response.statusCode()}: ${body.take(400)}",
                )
            }
        } catch (e: Exception) {
            println("Error calling HTTP inference: ${e.message}")
            e.printStackTrace()
            InferenceResult(
                status = "error",
                error = "HTTP inference failed: ${e.message}",
            )
        }
    }

    data class OcrResult(
        val success: Boolean,
        val text: String = "",
        val error: String? = null,
    )

    private val ocrMapper = jacksonObjectMapper()

    fun invokeOcrEndpoint(imageBytes: ByteArray): OcrResult {
        val base = baseUrl()
            ?: return OcrResult(success = false, error = "$ENV_INFERENCE_HTTP_URL is not set")

        val ocrUri = try {
            URI.create("${base.trimEnd('/')}/ocr")
        } catch (e: Exception) {
            return OcrResult(success = false, error = "Invalid $ENV_INFERENCE_HTTP_URL: ${e.message}")
        }

        return try {
            val secret = System.getenv(ENV_INFERENCE_HTTP_SECRET)?.trim()?.takeIf { it.isNotEmpty() }
            val contentType = detectContentType(imageBytes)

            val reqBuilder = HttpRequest.newBuilder()
                .uri(ocrUri)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", contentType)
                .header("Accept", "application/json")

            if (secret != null) {
                reqBuilder.header(HEADER_INFERENCE_SECRET, secret)
            }

            val request = reqBuilder
                .POST(HttpRequest.BodyPublishers.ofByteArray(imageBytes))
                .build()

            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            val body = response.body()

            if (response.statusCode() in 200..299) {
                val map: Map<String, Any?> = ocrMapper.readValue(body)
                OcrResult(
                    success = map["success"] as? Boolean ?: false,
                    text = map["text"] as? String ?: "",
                    error = map["error"] as? String,
                )
            } else {
                OcrResult(success = false, error = "HTTP ${response.statusCode()}: ${body.take(400)}")
            }
        } catch (e: Exception) {
            println("Error calling OCR endpoint: ${e.message}")
            OcrResult(success = false, error = "OCR request failed: ${e.message}")
        }
    }

    private fun detectContentType(imageBytes: ByteArray): String = when {
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
}
