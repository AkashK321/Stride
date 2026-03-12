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
                "NearestNodeID" to "n2",
                "DistanceToNode" to 2.0, // 2 meters from node n2
                "BearingFromNode" to "East",
                "MapCoordinateX" to 12,
                "MapCoordinateY" to 0
            )
        ))

        val mockBuildingStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockBuildingStmt.executeQuery() } returns mockResultSet(listOf(mapOf("BuildingID" to "B1")))

        val mockStartNodeStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockStartNodeStmt.executeQuery() } returns mockResultSet(listOf(mapOf("NodeIDString" to "staircase_main_2S01")))

        val mockGraphStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockGraphStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("StartNodeID" to "staircase_main_2S01", "EndNodeID" to "n1", "DistanceMeters" to 1.0, "IsBidirectional" to true),
            mapOf("StartNodeID" to "n1", "EndNodeID" to "n2", "DistanceMeters" to 10.0, "IsBidirectional" to true),
            mapOf("StartNodeID" to "n2", "EndNodeID" to "n3", "DistanceMeters" to 5.0, "IsBidirectional" to true)
        ))

        val mockNodesStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockNodesStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("NodeIDString" to "staircase_main_2S01", "CoordinateX" to -10, "CoordinateY" to 0),
            mapOf("NodeIDString" to "n1", "CoordinateX" to 0, "CoordinateY" to 0),
            mapOf("NodeIDString" to "n2", "CoordinateX" to 10, "CoordinateY" to 0),
            mapOf("NodeIDString" to "n3", "CoordinateX" to 10, "CoordinateY" to 5)
        ))

        val mockPathEdgesStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockPathEdgesStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("StartNodeID" to "staircase_main_2S01", "EndNodeID" to "n1", "DistanceMeters" to 1.0, "Bearing" to 90.0, "IsBidirectional" to true),
            mapOf("StartNodeID" to "n1", "EndNodeID" to "n2", "DistanceMeters" to 10.0, "Bearing" to 90.0, "IsBidirectional" to true), // 90 = East
            mapOf("StartNodeID" to "n2", "EndNodeID" to "n3", "DistanceMeters" to 5.0, "Bearing" to 0.0, "IsBidirectional" to true)   // 0 = North
        ))

        every { mockConn.prepareStatement(any<String>()) } answers {
            val sql = firstArg<String>()
            when {
                sql.contains("FROM Landmarks") -> mockLandmarkStmt
                sql.contains("BuildingID FROM MapNodes") -> mockBuildingStmt
                sql.contains("NodeIDString FROM MapNodes WHERE NodeIDString") -> mockStartNodeStmt
                sql.contains("FROM MapEdges e") -> mockGraphStmt
                sql.contains("FROM MapNodes WHERE NodeIDString IN") -> mockNodesStmt
                sql.contains("WHERE StartNodeID IN") -> mockPathEdgesStmt
                else -> mockk<PreparedStatement>(relaxed = true)
            }
        }

        val requestBody = """
            {
                "start_location": { "node_id": "staircase_main_2S01" },
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
    fun `handleNavigationStart accepts string node_id (NodeIDString) and returns 200`() {
        val mockLandmarkStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockLandmarkStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf(
                "Name" to "Room 226",
                "NearestNodeID" to "n2",
                "DistanceToNode" to 1.5,
                "BearingFromNode" to "North",
                "MapCoordinateX" to 10,
                "MapCoordinateY" to 5
            )
        ))

        val mockBuildingStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockBuildingStmt.executeQuery() } returns mockResultSet(listOf(mapOf("BuildingID" to "BHEE")))

        val mockStartNodeStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockStartNodeStmt.executeQuery() } returns mockResultSet(listOf(mapOf("NodeIDString" to "staircase_main_2S01")))

        val mockGraphStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockGraphStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("StartNodeID" to "staircase_main_2S01", "EndNodeID" to "n1", "DistanceMeters" to 1.0, "IsBidirectional" to true),
            mapOf("StartNodeID" to "n1", "EndNodeID" to "n2", "DistanceMeters" to 10.0, "IsBidirectional" to true)
        ))

        val mockNodesStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockNodesStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("NodeIDString" to "staircase_main_2S01", "CoordinateX" to -10, "CoordinateY" to 0),
            mapOf("NodeIDString" to "n1", "CoordinateX" to 0, "CoordinateY" to 0),
            mapOf("NodeIDString" to "n2", "CoordinateX" to 10, "CoordinateY" to 0)
        ))

        val mockPathEdgesStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockPathEdgesStmt.executeQuery() } returns mockResultSet(listOf(
            mapOf("StartNodeID" to "staircase_main_2S01", "EndNodeID" to "n1", "DistanceMeters" to 1.0, "Bearing" to 90.0, "IsBidirectional" to true),
            mapOf("StartNodeID" to "n1", "EndNodeID" to "n2", "DistanceMeters" to 10.0, "Bearing" to 90.0, "IsBidirectional" to true)
        ))

        every { mockConn.prepareStatement(any<String>()) } answers {
            val sql = firstArg<String>()
            when {
                sql.contains("FROM Landmarks") -> mockLandmarkStmt
                sql.contains("BuildingID FROM MapNodes") -> mockBuildingStmt
                sql.contains("NodeIDString FROM MapNodes WHERE NodeIDString") -> mockStartNodeStmt
                sql.contains("FROM MapEdges e") -> mockGraphStmt
                sql.contains("FROM MapNodes WHERE NodeIDString IN") -> mockNodesStmt
                sql.contains("WHERE StartNodeID IN") -> mockPathEdgesStmt
                else -> mockk<PreparedStatement>(relaxed = true)
            }
        }

        val requestBody = """
            {
                "start_location": { "node_id": "staircase_main_2S01" },
                "destination": { "landmark_id": "1" }
            }
        """.trimIndent()

        val event = APIGatewayProxyRequestEvent().apply {
            path = "/navigation/start"
            httpMethod = "POST"
            body = requestBody
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(200, response.statusCode)
        assertTrue(response.body?.contains("session_id") == true)
        assertTrue(response.body?.contains("instructions") == true)
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
		assertTrue(response.body?.contains("Query parameter 'query' is required and must be at least 1 character") == true)
	}

	@Test
	fun `search endpoint with valid query returns 200 and results`() {
		// 1. Mock the search SQL query result (JOIN returns LandmarkID, Name, FloorNumber, NearestNodeDisplay)
		val mockSearchStmt = mockk<PreparedStatement>(relaxed = true)
		every { mockSearchStmt.executeQuery() } returns mockResultSet(listOf(
			mapOf(
				"LandmarkID" to 1,
				"Name" to "Room 226",
				"FloorNumber" to 2,
				"NearestNodeDisplay" to "r226_door"
			),
			mapOf(
				"LandmarkID" to 2,
				"Name" to "Room 224",
				"FloorNumber" to 2,
				"NearestNodeDisplay" to "r224_door"
			)
		))

		// 2. Route prepareStatement to our mock when the query is a search
		every { mockConn.prepareStatement(any<String>()) } answers {
			val sql = firstArg<String>()
			if (sql.contains("ILIKE")) mockSearchStmt else mockk<PreparedStatement>(relaxed = true)
		}

		// 3. Trigger the handler
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "GET"
			path = "/search"
			queryStringParameters = mapOf("query" to "Room 2")
		}
		val response = handler.handleRequest(event, mockContext)
        println("Search response: ${response.body}")

		// 4. Assert response payload: landmark_id, name, floor_number, nearest_node (string id)
		assertEquals(200, response.statusCode)
		val body = response.body ?: ""
		assertTrue(body.contains("\"landmark_id\":1"))
		assertTrue(body.contains("\"landmark_id\":2"))
		assertTrue(body.contains("Room 226"))
		assertTrue(body.contains("Room 224"))
		assertTrue(body.contains("\"floor_number\":2"))
		assertTrue(body.contains("\"nearest_node\":\"r226_door\""))
		assertTrue(body.contains("\"nearest_node\":\"r224_door\""))

		// 5. Verify SQL parameters were bound correctly
		verify { mockSearchStmt.setString(1, "%Room 2%") }
		verify { mockSearchStmt.setInt(2, 10) }
	}

	@Test
	fun `search endpoint respects limit query parameter`() {
		val mockSearchStmt = mockk<PreparedStatement>(relaxed = true)
		every { mockSearchStmt.executeQuery() } returns mockResultSet(emptyList())

		every { mockConn.prepareStatement(any<String>()) } answers {
			val sql = firstArg<String>()
			if (sql.contains("ILIKE")) mockSearchStmt else mockk<PreparedStatement>(relaxed = true)
		}

		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "GET"
			path = "/search"
			queryStringParameters = mapOf("query" to "Restroom", "limit" to "3")
		}
		val response = handler.handleRequest(event, mockContext)
		
		assertEquals(200, response.statusCode)
		verify { mockSearchStmt.setString(1, "%Restroom%") }
		verify { mockSearchStmt.setInt(2, 3) } // Limit properly parsed from request
	}

	@Test
	fun `search endpoint defaults invalid limit to 10`() {
		val mockSearchStmt = mockk<PreparedStatement>(relaxed = true)
		every { mockSearchStmt.executeQuery() } returns mockResultSet(emptyList())

		every { mockConn.prepareStatement(any<String>()) } answers {
			val sql = firstArg<String>()
			if (sql.contains("ILIKE")) mockSearchStmt else mockk<PreparedStatement>(relaxed = true)
		}

		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "GET"
			path = "/search"
			queryStringParameters = mapOf("query" to "Restroom", "limit" to "abc")
		}
		val response = handler.handleRequest(event, mockContext)

		assertEquals(200, response.statusCode)
		verify { mockSearchStmt.setString(1, "%Restroom%") }
		verify { mockSearchStmt.setInt(2, 10) }
	}

    @Test
    fun `search endpoint properly formats query for a 'contains' search`() {
        // Setup a basic mock that returns empty results
        val mockSearchStmt = mockk<PreparedStatement>(relaxed = true)
        every { mockSearchStmt.executeQuery() } returns mockResultSet(emptyList())

        // Capture the exact SQL string passed to prepareStatement
        val capturedSql = slot<String>()
        every { mockConn.prepareStatement(capture(capturedSql)) } returns mockSearchStmt
        
        val searchTerm = "Restroom"
        val event = APIGatewayProxyRequestEvent().apply {
            httpMethod = "GET"
            path = "/search"
            queryStringParameters = mapOf("query" to searchTerm)
        }
        handler.handleRequest(event, mockContext)

        // 3. Verify the SQL query uses ILIKE for case-insensitive matching
        assertTrue(
            capturedSql.captured.contains("ILIKE ?"), 
            "The SQL query should use ILIKE for case-insensitive searching"
        )

        // Verify the parameter was wrapped in % wildcards for a 'contains' match
        verify { 
            mockSearchStmt.setString(1, "%$searchTerm%") 
        }
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
