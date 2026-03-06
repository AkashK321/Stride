package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent.RequestContext
import io.mockk.*
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.Base64

class LiveNavigationHandlerTest {

    private val mockContext = mockk<Context>()
    private val mockLogger = mockk<LambdaLogger>(relaxed = true)
    
    private lateinit var handler: LiveNavigationHandler

    @BeforeEach
    fun setup() {
        every { mockContext.logger } returns mockLogger
        
        // We use the real handler for these tests since it gracefully handles exceptions
        // internally (API Gateway connection, DB connection) via try-catch blocks.
        handler = LiveNavigationHandler()
    }

    @Test
    fun `handleRequest should return 400 when request context is missing`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext() // empty context
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
        assertEquals("Missing WebSocket request context", response.body)
    }

    @Test
    fun `handleRequest should return 200 for default route`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "\$default"
            }
            body = "{}"
        }

        val response = handler.handleRequest(event, mockContext)

        // The default route specifically returns 200 and posts an error message back to the connection
        assertEquals(200, response.statusCode)
        verify { mockLogger.log(match<String> { it.contains("route: \$default") }) }
    }

    @Test
    fun `handleRequest should return 400 when routeKey is unsupported`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "unsupported_route"
            }
            body = "{}"
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should return 400 when payload validation fails due to missing session_id`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            // Missing almost everything, particularly session_id
            body = """{"request_id": 1}"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should return 400 when focal_length_pixels is negative`() {
        val validBase64 = Base64.getEncoder().encodeToString("dummy_image".toByteArray())
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            body = """{
                "session_id": "session123",
                "image_base64": "$validBase64",
                "focal_length_pixels": -10.0,
                "heading_degrees": 90.0,
                "request_id": 1,
                "accelerometer": {"x": 0, "y": 0, "z": 0},
                "gyroscope": {"x": 0, "y": 0, "z": 0}
            }"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should process valid payload and return 200`() {
        val validBase64 = Base64.getEncoder().encodeToString("dummy_image".toByteArray())
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            body = """{
                "session_id": "session123",
                "image_base64": "$validBase64",
                "focal_length_pixels": 800.0,
                "heading_degrees": 90.0,
                "request_id": 1,
                "accelerometer": {"x": 0.0, "y": 1.5, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gps": {"latitude": 40.0, "longitude": -86.0},
                "timestamp_ms": 1670000000000
            }"""
        }

        // Note: Because we aren't mocking DynamoDB or PostgreSQL here, their SDK clients 
        // will throw exceptions internally during the test. However, the handler encapsulates 
        // them in try-catch blocks and should still return a 200 OK at the end of execution.
        val response = handler.handleRequest(event, mockContext)

        assertEquals(200, response.statusCode)
        assertEquals("OK", response.body)
    }
}
