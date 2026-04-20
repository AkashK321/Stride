package com.models

data class NavigationStartResponse(
    val session_id: String,
    val instructions: List<NavigationInstruction>
)

data class NavigationStartRequest(
    val destination: Destination,
    val start_location: StartLocation
)

data class SearchResponse(
    val results: List<LandmarkResult>
)

data class Destination(
    val landmark_id: String
)

data class StartLocation(
    val node_id: String
)

data class LiveNavigationRequest(
    val session_id: String,
    val request_id: String,
    val timestamp_ms: Long,
    val image_base64: String,
    val focal_length_pixels: Double,
    val heading_degrees: Double,
    val distance_traveled: Double,
    val gps: Map<String, Double>
)