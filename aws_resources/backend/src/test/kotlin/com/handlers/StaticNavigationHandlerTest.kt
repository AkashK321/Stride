package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class StaticNavigationHandlerTest {
	private val mockContext = mockk<Context>(relaxed = true)
	private val mockLogger = mockk<LambdaLogger>(relaxed = true)
	private lateinit var handler: StaticNavigationHandler

	@BeforeEach
	fun setUp() {
		every { mockContext.logger } returns mockLogger
		handler = StaticNavigationHandler()
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

	@Test
	fun `navigation start with valid body returns 200 and instructions`() {
		val body = """{"destination":{"landmark_id":"landmark_123"},"start_location":{"node_id":"start_456"}}"""
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/navigation/start"
			this.body = body
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(200, response.statusCode)
		assertTrue(response.body?.contains("nav_session_abc123") == true)
		assertTrue(response.body?.contains("instructions") == true)
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
