package com.models

/**
 * Represents a single object detection with bounding box
 * 
 * @property x Top-left X coordinate in pixels
 * @property y Top-left Y coordinate in pixels
 * @property width Bounding box width in pixels
 * @property height Bounding box height in pixels
 * @property className Detected object class name (e.g., "person", "car")
 * @property confidence Confidence score between 0.0 and 1.0
 * @property text OCR-extracted text for sign detections (e.g., room number "242"), null for non-sign classes
 */
data class BoundingBox(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val className: String,
    val confidence: Float,
    val text: String? = null
)
