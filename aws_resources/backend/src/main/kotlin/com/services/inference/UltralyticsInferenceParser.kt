package com.services.inference

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.models.BoundingBox
import com.models.InferenceResult
import com.models.Metadata

private val mapper = jacksonObjectMapper()

/**
 * JSON body from HTTP POST /invocations (Ultralytics-compatible format).
 */
internal data class UltralyticsInferenceResponse(
    val success: Boolean,
    val predictions: List<UltralyticsPrediction> = emptyList(),
    val image: UltralyticsImageInfo? = null,
    val error: String? = null,
)

internal data class UltralyticsPrediction(
    @JsonProperty("class") val className: String,
    val confidence: Float,
    val box: UltralyticsBox,
    val text: String? = null,
)

internal data class UltralyticsBox(
    val x1: Int,
    val y1: Int,
    val x2: Int,
    val y2: Int,
)

internal data class UltralyticsImageInfo(
    val width: Int,
    val height: Int,
)

/**
 * Parse Ultralytics-style JSON into [InferenceResult] (HTTP /invocations).
 */
object UltralyticsInferenceParser {
    fun parse(json: String, inferenceTimeMs: Long = 0): InferenceResult {
        val body = mapper.readValue<UltralyticsInferenceResponse>(json)
        if (!body.success) {
            return InferenceResult(
                status = "error",
                error = body.error ?: "Unknown inference error",
            )
        }
        val image = body.image
            ?: return InferenceResult(status = "error", error = "Missing image dimensions in response")

        val detections = body.predictions.map { pred ->
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
                confidence = pred.confidence,
                text = pred.text,
            )
        }

        val metadata = Metadata(
            imageWidth = image.width,
            imageHeight = image.height,
            inferenceTimeMs = inferenceTimeMs,
            detectionCount = detections.size,
        )

        return InferenceResult(
            status = "success",
            detections = detections,
            metadata = metadata,
        )
    }
}
