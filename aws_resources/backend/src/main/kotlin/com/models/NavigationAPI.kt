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