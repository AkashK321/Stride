package com.models

/**
 * Defines a data class for representing a landmark 
 * with its details, including its ID, name, nearest node information, and coordinates. 
 * This class can be used to store and manage landmark data in the application.
 * 
 * @property id The unique identifier for the landmark.
 * @property name The name of the landmark.
 * @property nearestNodeId The ID of the nearest node to the landmark.
 * @property distanceToNode The distance from the nearest node to the landmark.
 * @property bearingFromNode The bearing from the nearest node to the landmark (e.g., "N", "NE", "E", etc.).
 * @property coordX The X coordinate of the landmark in pixels.
 * @property coordY The Y coordinate of the landmark in pixels.
 */

data class LandmarkDetails(
    val id: Int,
    val name: String,
    val nearestNodeId: Int,
    val distanceToNode: Double,
    val bearingFromNode: String,
    val coordX: Int,
    val coordY: Int
)

/**
 * Defines a simplified data class for representing a landmark search result
 */
data class LandmarkResult(
    val name: String,
    val floor_number: Int,
    val nearest_node: String
)