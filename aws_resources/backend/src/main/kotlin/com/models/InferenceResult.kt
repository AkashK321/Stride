package com.models

/**
 * Complete inference result to send back to client via WebSocket
 * 
 * @property status Status of the inference ("success" or "error")
 * @property detections List of detected objects with bounding boxes
 * @property metadata Additional information about the inference
 * @property error Optional error message if status is "error"
 */
data class InferenceResult(
    val status: String,
    val detections: List<BoundingBox> = emptyList(),
    val metadata: Metadata? = null,
    val error: String? = null
)

/**
 * Metadata about the inference request and results
 * 
 * @property imageWidth Original image width in pixels
 * @property imageHeight Original image height in pixels
 * @property inferenceTimeMs Time taken for inference in milliseconds
 * @property detectionCount Number of objects detected
 */
data class Metadata(
    val imageWidth: Int,
    val imageHeight: Int,
    val inferenceTimeMs: Long,
    val detectionCount: Int
)
