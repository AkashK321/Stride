package com.models

enum class NavigationStepType {
    segment,
    arrival
}

data class NavigationCoordinates(
    val x: Double,
    val y: Double
)

/**
 * Canonical navigation instruction contract for v2 map responses.
 *
 * - Uses a single coordinate shape (`coordinates.x`, `coordinates.y`) for all instructions.
 * - Exposes explicit step semantics through `step_type` (segment vs arrival).
 * - Exposes explicit turn semantics through `turn_intent` for segment transitions.
 */
data class NavigationInstruction(
    val step: Int,
    val step_type: NavigationStepType,
    val distance_feet: Double,
    val direction: String?,
    val node_id: String,
    val coordinates: NavigationCoordinates,
    val heading_degrees: Double?,
    val turn_intent: String?
)
