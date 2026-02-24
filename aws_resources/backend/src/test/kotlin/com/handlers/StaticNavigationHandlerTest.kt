package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import io.mockk.*
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterEach
import io.mockk.unmockkAll
import org.junit.jupiter.api.Test
import java.sql.Connection
import java.sql.DriverManager
import java.sql.PreparedStatement
import java.sql.ResultSet

class StaticNavigationHandlerTest {
	private val mockContext = mockk<Context>()
    private val mockLogger = mockk<LambdaLogger>(relaxed = true)
    private val mockConn = mockk<Connection>(relaxed = true)

    private val handler = StaticNavigationHandler()

	@BeforeEach
    fun setup() {
        every { mockContext.logger } returns mockLogger

        // Robust way to intercept the database connection globally
        mockkStatic(DriverManager::class)
        every { DriverManager.getConnection(any<String>(), any<String>(), any<String>()) } returns mockConn
    }

	@AfterEach
    fun teardown() {
        unmockkAll() // Clears the static mock after the test
    }

	private fun mockResultSet(data: List<Map<String, Any?>>): ResultSet {
        val rs = mockk<ResultSet>(relaxed = true)
        var index = -1
        every { rs.next() } answers {
            index++
            index < data.size
        }
        every { rs.getInt(any<String>()) } answers {
            val col = firstArg<String>()
            (data[index][col] as? Int) ?: 0
        }
        every { rs.getDouble(any<String>()) } answers {
            val col = firstArg<String>()
            (data[index][col] as? Double) ?: 0.0
        }
        every { rs.getString(any<String>()) } answers {
            val col = firstArg<String>()
            (data[index][col] as? String) ?: ""
        }
        every { rs.getBoolean(any<String>()) } answers {
            val col = firstArg<String>()
            (data[index][col] as? Boolean) ?: false
        }
        every { rs.wasNull() } returns false
        return rs
    }

    @Test
    fun `handleNavigationStart should calculate shortest path using Dijkstra and return instructions`() {
        val mockLandmarkStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockLandmarkStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf(
                "Name" to "Room 205",
                "NearestNodeID" to 2,
                "DistanceToNode" to 2.0, // 2 meters from node 2
                "BearingFromNode" to "East",
                "MapCoordinateX" to 12,
                "MapCoordinateY" to 0
            )
        ))

        val mockBuildingStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockBuildingStmt.executeQuery() } returns mockResultSet(listOf(mapOf("BuildingID" to "B1")))

        val mockGraphStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockGraphStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("StartNodeID" to 1, "EndNodeID" to 2, "DistanceMeters" to 10.0, "IsBidirectional" to true),
            mapOf("StartNodeID" to 2, "EndNodeID" to 3, "DistanceMeters" to 5.0, "IsBidirectional" to true)
        ))

        val mockNodesStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockNodesStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("NodeID" to 1, "CoordinateX" to 0, "CoordinateY" to 0),
            mapOf("NodeID" to 2, "CoordinateX" to 10, "CoordinateY" to 0),
            mapOf("NodeID" to 3, "CoordinateX" to 10, "CoordinateY" to 5)
        ))

        val mockPathEdgesStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockPathEdgesStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("StartNodeID" to 1, "EndNodeID" to 2, "DistanceMeters" to 10.0, "Bearing" to 90.0, "IsBidirectional" to true), // 90 = East
            mapOf("StartNodeID" to 2, "EndNodeID" to 3, "DistanceMeters" to 5.0, "Bearing" to 0.0, "IsBidirectional" to true)   // 0 = North
        ))

        every { mockConn.prepareStatement(any<String>()) } answers {
            val sql = firstArg<String>()
            when {
                sql.contains("FROM Landmarks") -> mockLandmarkStmt
                sql.contains("BuildingID FROM MapNodes") -> mockBuildingStmt
                sql.contains("FROM MapEdges e") -> mockGraphStmt
                sql.contains("FROM MapNodes WHERE NodeID IN") -> mockNodesStmt
                sql.contains("WHERE StartNodeID IN") -> mockPathEdgesStmt
                else -> mockk<PreparedStatement>(relaxed = true)
            }
        }

        val requestBody = """
            {
                "start_location": { "node_id": "1" },
                "destination": { "landmark_id": "2" }
            }
        """.trimIndent()

        val event = APIGatewayProxyRequestEvent().apply {
            path = "/navigation/start"
            httpMethod = "POST"
            body = requestBody
        }

        val response = handler.handleRequest(event, mockContext)
        println("Navigation instructions: ${response.body}")

        assertEquals(200, response.statusCode)

        val responseBody = response.body

        // Assert Step 1: Node 1 to Node 2 (10m = 32.8ft, East)
        assertTrue(responseBody.contains("Head East"))
        assertTrue(responseBody.contains("32.8084"))

        // Assert Step 2: Node 2 to Landmark 2 (5m = 16.4ft, North)
        assertTrue(responseBody.contains("Head East"))
        assertTrue(responseBody.contains("6.56168"))

        // Assert Step 3: Final arrival at Landmark
        assertTrue(responseBody.contains("Room 205"))
        assertTrue(responseBody.contains("arrive"))
    }

	@Test
	fun `search endpoint with missing query returns 400`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "GET"
			path = "/search"
			queryStringParameters = mapOf()
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(400, response.statusCode)
		assertTrue(response.body?.contains("Missing or invalid 'query' parameter") == true)
	}

	@Test
	fun `search endpoint with valid query returns 200 and results`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "GET"
			path = "/search"
			queryStringParameters = mapOf("query" to "Room 2")
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(200, response.statusCode)
		assertTrue(response.body?.contains("Room 226") == true)
		assertTrue(response.body?.contains("Room 224") == true)
		assertTrue(response.body?.contains("results") == true)
	}


	@Test
	fun `navigation start with missing body returns 400`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/navigation/start"
			body = null
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(400, response.statusCode)
		assertTrue(response.body?.contains("Missing request body") == true)
	}

	@Test
	fun `navigation start with invalid body returns 400`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/navigation/start"
			body = "not a json"
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(400, response.statusCode)
		assertTrue(response.body?.contains("Invalid request body format") == true)
	}

	@Test
	fun `navigation start with missing required fields returns 400`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/navigation/start"
			body = """{
                "destination": {
                    "landmark_id": ""
                },
                "start_location": {
                    "node_id": ""
                }
            }"""
		}
		val response = handler.handleRequest(event, mockContext)
        println(response.body)
		assertEquals(400, response.statusCode)
		assertTrue(response.body?.contains("destination.landmark_id and start_location.node_id are required") == true)
	}

	// @Test
	// fun `navigation start with valid body returns 200 and instructions`() {
	// 	val body = """{"destination":{"landmark_id":"landmark_123"},"start_location":{"node_id":"start_456"}}"""
	// 	val event = APIGatewayProxyRequestEvent().apply {
	// 		httpMethod = "POST"
	// 		path = "/navigation/start"
	// 		this.body = body
	// 	}
	// 	val response = handler.handleRequest(event, mockContext)
	// 	assertEquals(200, response.statusCode)
	// 	assertTrue(response.body?.contains("nav_session_abc123") == true)
	// 	assertTrue(response.body?.contains("instructions") == true)
	// }

	@Test
	fun `unknown endpoint returns 404`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "GET"
			path = "/unknown"
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(404, response.statusCode)
		assertTrue(response.body?.contains("Endpoint not found") == true)
	}
}
