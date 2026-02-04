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
 */
data class BoundingBox(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val className: String,
    val confidence: Float
)
