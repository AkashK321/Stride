package com.models

/**
 * Defines a data class for representing a navigation instruction, 
 * which includes details about the step number, distance to the next node in feet, 
 * direction of movement, node ID, and coordinates of the next node. 
 * This class can be used to store and manage navigation instructions in the application.
 * 
 * @property step The step number in the navigation sequence.
 * @property distance_feet The distance to the next node in feet. 
 * @property direction The direction of movement (e.g., "N", "NE", "E", etc.).
 * @property node_id The ID of the next node in the navigation path.
 * @property coordinates A map containing the X and Y coordinates of the next node (e.g., {"x": 100.0, "y": 200.0}).
 */

data class NavigationInstruction(
    val step: Int,
    val distance_feet: Double,
    val direction: String?,
    val node_id: String,
    val coordinates: Map<String, Double>,
    val heading_degrees: Double?
)