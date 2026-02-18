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
	fun `search endpoint with missing landmark returns 400`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/search"
			queryStringParameters = mapOf()
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(400, response.statusCode)
		assertTrue(response.body?.contains("Missing 'landmark' query parameter") == true)
	}

	@Test
	fun `search endpoint with landmark returns 200 and list`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/search"
			queryStringParameters = mapOf("landmark" to "Library")
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(200, response.statusCode)
		assertTrue(response.body?.contains("Landmark 1") == true)
		assertTrue(response.body?.contains("Landmark 2") == true)
	}

	@Test
	fun `navigation start with missing landmarkID returns 400`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/navigation/start"
			queryStringParameters = mapOf()
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(400, response.statusCode)
		assertTrue(response.body?.contains("Missing 'landmarkID' query parameter") == true)
	}

	@Test
	fun `navigation start with landmarkID returns 200 and instructions`() {
		val event = APIGatewayProxyRequestEvent().apply {
			httpMethod = "POST"
			path = "/navigation/start"
			queryStringParameters = mapOf("landmarkID" to "123")
		}
		val response = handler.handleRequest(event, mockContext)
		assertEquals(200, response.statusCode)
		assertTrue(response.body?.contains("Navigation instructions to landmark ID: 123") == true)
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
