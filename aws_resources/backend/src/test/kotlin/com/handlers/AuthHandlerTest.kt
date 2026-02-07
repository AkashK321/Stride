package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import io.mockk.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import uk.org.webcompere.systemstubs.jupiter.SystemStubsExtension
import uk.org.webcompere.systemstubs.environment.EnvironmentVariables

@ExtendWith(SystemStubsExtension::class)
class AuthHandlerTest {
    private val mockContext = mockk<Context>(relaxed = true)
    private lateinit var handler: AuthHandler

    @BeforeEach
    fun setUp() {
        // Mock context logger
        every { mockContext.logger } returns mockk(relaxed = true)
        
        // Create handler (it will create its own Cognito client internally)
        handler = AuthHandler()
    }

    @Test
    @DisplayName("Login with missing environment variables returns 500")
    fun `login missing environment returns 500`() {
        // Given - no environment variables set
        val event = createLoginEvent("testuser", "testpass")
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertEquals(500, response.statusCode)
        val responseBody = response.body
        assertNotNull(responseBody)
        assertTrue(responseBody!!.contains("error"))
        assertTrue(responseBody.contains("Server configuration error"))
    }

    @Test
    @DisplayName("Login with invalid JSON returns 400")
    fun `login invalid JSON returns 400`(envVars: EnvironmentVariables) {
        // Given - set environment variables so we can test input validation
        envVars.set("USER_POOL_ID", "test-pool-id")
        envVars.set("USER_POOL_CLIENT_ID", "test-client-id")
        
        val event = APIGatewayProxyRequestEvent().apply {
            httpMethod = "POST"
            path = "/login"
            body = "invalid-json"
        }
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertEquals(400, response.statusCode)
        val responseBody = response.body
        assertNotNull(responseBody)
        assertTrue(responseBody!!.contains("error"))
        assertTrue(responseBody.contains("Invalid request format"))
    }

    @Test
    @DisplayName("Login with missing body returns 400")
    fun `login missing body returns 400`(envVars: EnvironmentVariables) {
        // Given - set environment variables so we can test input validation
        envVars.set("USER_POOL_ID", "test-pool-id")
        envVars.set("USER_POOL_CLIENT_ID", "test-client-id")
        
        val event = APIGatewayProxyRequestEvent().apply {
            httpMethod = "POST"
            path = "/login"
            body = null
        }
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertEquals(400, response.statusCode)
        val responseBody = response.body
        assertNotNull(responseBody)
        assertTrue(responseBody!!.contains("error"))
        assertTrue(responseBody.contains("Request body is required"))
    }

    @Test
    @DisplayName("Login with empty username or password returns 400")
    fun `login empty credentials returns 400`(envVars: EnvironmentVariables) {
        // Given - set environment variables so we can test input validation
        envVars.set("USER_POOL_ID", "test-pool-id")
        envVars.set("USER_POOL_CLIENT_ID", "test-client-id")
        
        val event = APIGatewayProxyRequestEvent().apply {
            httpMethod = "POST"
            path = "/login"
            body = """{"username":"","password":"testpass"}"""
        }
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertEquals(400, response.statusCode)
        val responseBody = response.body
        assertNotNull(responseBody)
        assertTrue(responseBody!!.contains("error"))
        assertTrue(responseBody.contains("Username and password are required"))
    }

    @Test
    @DisplayName("Invalid endpoint returns 404")
    fun `invalid endpoint returns 404`() {
        // Given
        val event = APIGatewayProxyRequestEvent().apply {
            httpMethod = "POST"
            path = "/invalid"
            body = """{"username":"test","password":"test"}"""
        }
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertEquals(404, response.statusCode)
        val responseBody = response.body
        assertNotNull(responseBody)
        assertTrue(responseBody!!.contains("error"))
        assertTrue(responseBody.contains("Not Found"))
    }

    @Test
    @DisplayName("GET request to login returns 404")
    fun `get request to login returns 404`() {
        // Given
        val event = APIGatewayProxyRequestEvent().apply {
            httpMethod = "GET"
            path = "/login"
            body = """{"username":"test","password":"test"}"""
        }
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertEquals(404, response.statusCode)
    }

    @Test
    @DisplayName("Response includes Content-Type header")
    fun `response includes content type header`(envVars: EnvironmentVariables) {
        // Given - set environment variables
        envVars.set("USER_POOL_ID", "test-pool-id")
        envVars.set("USER_POOL_CLIENT_ID", "test-client-id")
        
        val event = createLoginEvent("testuser", "testpass")
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertNotNull(response.headers)
        assertEquals("application/json", response.headers["Content-Type"])
    }

    // Normalization tests (whitespace trimming)

    @Test
    @DisplayName("Login with username having whitespace is trimmed")
    fun `login username with whitespace is trimmed`(envVars: EnvironmentVariables) {
        // Given
        envVars.set("USER_POOL_ID", "test-pool-id")
        envVars.set("USER_POOL_CLIENT_ID", "test-client-id")
        
        val event = createLoginEvent("  testuser  ", "testpass")
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then - should pass normalization (not 400 validation error)
        assertNotEquals(400, response.statusCode)
    }

    @Test
    @DisplayName("Login with password having whitespace is trimmed")
    fun `login password with whitespace is trimmed`(envVars: EnvironmentVariables) {
        // Given
        envVars.set("USER_POOL_ID", "test-pool-id")
        envVars.set("USER_POOL_CLIENT_ID", "test-client-id")
        
        val event = createLoginEvent("testuser", "  testpass  ")
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then - should pass normalization (not 400 validation error)
        assertNotEquals(400, response.statusCode)
    }

    @Test
    @DisplayName("Login with username that is only whitespace returns 400")
    fun `login username only whitespace returns 400`(envVars: EnvironmentVariables) {
        // Given
        envVars.set("USER_POOL_ID", "test-pool-id")
        envVars.set("USER_POOL_CLIENT_ID", "test-client-id")
        
        val event = createLoginEvent("   ", "testpass")
        
        // When
        val response = handler.handleRequest(event, mockContext)
        
        // Then
        assertEquals(400, response.statusCode)
        val responseBody = response.body
        assertNotNull(responseBody)
        assertTrue(responseBody!!.contains("error"))
        assertTrue(responseBody.contains("Username and password are required"))
    }

    // Helper methods
    private fun createLoginEvent(username: String, password: String): APIGatewayProxyRequestEvent {
        return APIGatewayProxyRequestEvent().apply {
            httpMethod = "POST"
            path = "/login"
            body = """{"username":"$username","password":"$password"}"""
        }
    }

    private fun createRegisterEvent(username: String, password: String, email: String): APIGatewayProxyRequestEvent {
        return APIGatewayProxyRequestEvent().apply {
            httpMethod = "POST"
            path = "/register"
            body = """{"username":"$username","password":"$password","email":"$email"}"""
        }
    }
}
