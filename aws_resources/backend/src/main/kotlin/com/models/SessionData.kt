package com.models

data class SessionData(
    val previousX: Double,
    val previousY: Double,
    val previousTime: Long,
    val destLandmarkId: String,
    var currentStep: Int,
    val pathNodes: List<String>
)