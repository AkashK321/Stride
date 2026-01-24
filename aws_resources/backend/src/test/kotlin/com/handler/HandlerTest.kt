package com.handler

import com.amazonaws.services.lambda.runtime.ClientContext
import com.amazonaws.services.lambda.runtime.CognitoIdentity
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

class HandlerTest {
    private lateinit var handler: Handler
    private lateinit var mockContext: Context

    @BeforeEach
    fun setUp() {
        handler = Handler()
        // Create a simple mock context using an anonymous object
        mockContext =
            object : Context {
                override fun getAwsRequestId(): String = "test-request-id"

                override fun getLogGroupName(): String = "test-log-group"

                override fun getLogStreamName(): String = "test-log-stream"

                override fun getFunctionName(): String = "test-function"

                override fun getFunctionVersion(): String = "1"

                override fun getInvokedFunctionArn(): String = "arn:aws:lambda:us-east-1:123456789012:function:test"

                override fun getRemainingTimeInMillis(): Int = 30000

                override fun getMemoryLimitInMB(): Int = 512

                override fun getIdentity(): CognitoIdentity? = null

                override fun getClientContext(): ClientContext? = null

                override fun getLogger(): com.amazonaws.services.lambda.runtime.LambdaLogger {
                    return object : com.amazonaws.services.lambda.runtime.LambdaLogger {
                        override fun log(message: String) = println(message)

                        override fun log(message: ByteArray) = println(String(message))
                    }
                }
            }
    }

    @Test
    @DisplayName("Handler should return 200 status code")
    fun `handler returns 200 status code`() {
        // Arrange
        val request =
            APIGatewayProxyRequestEvent().apply {
                path = "/test"
            }

        // Act
        val response = handler.handleRequest(request, mockContext)

        // Assert
        assertEquals(200, response.statusCode)
    }

    @Test
    @DisplayName("Handler should include path in response body")
    fun `handler includes path in response body`() {
        // Arrange
        val testPath = "/api/items"
        val request =
            APIGatewayProxyRequestEvent().apply {
                path = testPath
            }

        // Act
        val response = handler.handleRequest(request, mockContext)

        // Assert
        assertNotNull(response.body)
        assertTrue(response.body!!.contains(testPath))
    }

    @Test
    @DisplayName("Handler should return valid response for root path")
    fun `handler handles root path correctly`() {
        // Arrange
        val request =
            APIGatewayProxyRequestEvent().apply {
                path = "/"
            }

        // Act
        val response = handler.handleRequest(request, mockContext)

        // Assert
        assertEquals(200, response.statusCode)
        assertNotNull(response.body)
        assertTrue(response.body!!.contains("Hello from Kotlin"))
    }

    @Test
    @DisplayName("Handler should handle null path gracefully")
    fun `handler handles null path`() {
        // Arrange
        val request =
            APIGatewayProxyRequestEvent().apply {
                path = null
            }

        // Act
        val response = handler.handleRequest(request, mockContext)

        // Assert
        assertEquals(200, response.statusCode)
        assertNotNull(response.body)
    }

    @Test
    @DisplayName("Handler should return response with body")
    fun `handler returns response with body`() {
        // Arrange
        val request =
            APIGatewayProxyRequestEvent().apply {
                path = "/test"
            }

        // Act
        val response = handler.handleRequest(request, mockContext)

        // Assert
        assertNotNull(response)
        assertNotNull(response.body)
        assertFalse(response.body!!.isEmpty())
    }
}
