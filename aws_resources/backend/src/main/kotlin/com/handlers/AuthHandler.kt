package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent

class AuthHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {
    override fun handleRequest(
        input: APIGatewayProxyRequestEvent,
        context: Context,
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Request: ${input.httpMethod} ${input.path}")
        
        val path = input.path ?: ""
        val method = input.httpMethod ?: ""
        
        return when {
            path == "/login" && method == "POST" -> handleLogin(input, context)
            // Add more routes here as needed
            // path == "/register" && method == "POST" -> handleRegister(input, context)
            // path == "/logout" && method == "POST" -> handleLogout(input, context)
            else -> createErrorResponse(404, "Not Found")
        }
    }
    
    private fun handleLogin(
        input: APIGatewayProxyRequestEvent,
        context: Context
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Handling login request")
        
        // Parse request body if present
        val body = input.body
        
        // TODO: Implement login logic here
        // - Parse credentials from body
        // - Validate credentials
        // - Generate/return token
        
        return APIGatewayProxyResponseEvent()
            .withStatusCode(501)
            .withBody("""{"message": "Login endpoint - Not implemented"}""")
            .withHeaders(mapOf("Content-Type" to "application/json"))
    }
    
    private fun createErrorResponse(
        statusCode: Int,
        message: String
    ): APIGatewayProxyResponseEvent {
        return APIGatewayProxyResponseEvent()
            .withStatusCode(statusCode)
            .withBody("""{"error": "$message"}""")
            .withHeaders(mapOf("Content-Type" to "application/json"))
    }
}