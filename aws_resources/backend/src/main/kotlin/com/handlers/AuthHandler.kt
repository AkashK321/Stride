package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient
import software.amazon.awssdk.services.cognitoidentityprovider.model.InitiateAuthRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.InitiateAuthResponse
import software.amazon.awssdk.services.cognitoidentityprovider.model.AuthFlowType
import software.amazon.awssdk.services.cognitoidentityprovider.model.AuthenticationResultType
import software.amazon.awssdk.services.cognitoidentityprovider.model.CognitoIdentityProviderException
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminCreateUserRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminSetUserPasswordRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.MessageActionType
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue

class AuthHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val cognitoClient = CognitoIdentityProviderClient.builder()
        .httpClient(UrlConnectionHttpClient.builder().build())
        .build()
    private val mapper = jacksonObjectMapper()

    override fun handleRequest(
        input: APIGatewayProxyRequestEvent,
        context: Context,
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Request: ${input.httpMethod} ${input.path}")
        
        val path = input.path ?: ""
        val method = input.httpMethod ?: ""
        
        return when {
            path == "/login" && method == "POST" -> handleLogin(input, context)
            path == "/register" && method == "POST" -> handleRegister(input, context)
            else -> createErrorResponse(404, "Not Found")
        }
    }

    private fun handleLogin(
        input: APIGatewayProxyRequestEvent,
        context: Context
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Handling login request")

        try {
            // Get environment variables
            val userPoolId = System.getenv("USER_POOL_ID")
            val clientId = System.getenv("USER_POOL_CLIENT_ID")
            
            if (userPoolId.isNullOrEmpty() || clientId.isNullOrEmpty()) {
                context.logger.log("ERROR: Missing USER_POOL_ID or USER_POOL_CLIENT_ID environment variables")
                return createErrorResponse(500, "Server configuration error")
            }

            // Parse request body
            val body = input.body ?: return createErrorResponse(400, "Request body is required")

            val loginRequest = try {
                mapper.readValue<LoginRequest>(body)
            } catch (e: Exception) {
                context.logger.log("ERROR: Failed to parse request body: ${e.message}")
                return createErrorResponse(400, "Invalid request format. Expected JSON with username and password")
            }

            if (loginRequest.username.isNullOrEmpty() || loginRequest.password.isNullOrEmpty()) {
                return createErrorResponse(400, "Username and password are required")
            }

            // Authenticate with Cognito using USER_PASSWORD_AUTH (matches client configuration)
            val authRequest = InitiateAuthRequest.builder()  // Changed from AdminInitiateAuthRequest
                .clientId(clientId)
                .authFlow(AuthFlowType.USER_PASSWORD_AUTH)  // Changed to match client config
                .authParameters(
                    mapOf(
                        "USERNAME" to loginRequest.username,
                        "PASSWORD" to loginRequest.password
                    )
                )
                .build()

            val authResponse: InitiateAuthResponse = cognitoClient.initiateAuth(authRequest)
            
            // Check if authentication was successful
            val authResult: AuthenticationResultType? = authResponse.authenticationResult()
        
            if (authResult != null) {
                // Success - return tokens
                val responseBody = mapper.writeValueAsString(
                    mapOf(
                        "accessToken" to authResult.accessToken(),
                        "idToken" to authResult.idToken(),
                        "refreshToken" to authResult.refreshToken(),
                        "expiresIn" to authResult.expiresIn(),
                        "tokenType" to authResult.tokenType()
                    )
                )
                
                return APIGatewayProxyResponseEvent()
                    .withStatusCode(200)
                    .withBody(responseBody)
                    .withHeaders(mapOf("Content-Type" to "application/json"))
            } else {
                // Challenge required (shouldn't happen if Cognito is configured correctly)
                context.logger.log("Authentication challenge required: ${authResponse.challengeName()}")
                return createErrorResponse(401, "Authentication challenge required: ${authResponse.challengeName()}")
            }
            
        } catch (e: CognitoIdentityProviderException) {
            context.logger.log("ERROR: Cognito authentication failed: ${e.message}")
            
            return when {
                e.message?.contains("NotAuthorizedException") == true -> 
                    createErrorResponse(401, "Invalid username or password")
                e.message?.contains("UserNotFoundException") == true -> 
                    createErrorResponse(401, "User not found")
                e.message?.contains("UserNotConfirmedException") == true -> 
                    createErrorResponse(403, "User account is not confirmed")
                else -> 
                    createErrorResponse(401, "Authentication failed: ${e.message}")
            }
        } catch (e: Exception) {
            context.logger.log("ERROR: Unexpected error during login: ${e.message}")
            e.printStackTrace()
            return createErrorResponse(500, "Internal server error")
        }
    }
    
    private fun createErrorResponse(
        statusCode: Int,
        message: String
    ): APIGatewayProxyResponseEvent {
        val errorBody = mapper.writeValueAsString(mapOf("error" to message))
        return APIGatewayProxyResponseEvent()
            .withStatusCode(statusCode)
            .withBody(errorBody)
            .withHeaders(mapOf("Content-Type" to "application/json"))
    }
    
    private fun handleRegister(
        input: APIGatewayProxyRequestEvent,
        context: Context
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Handling register request")

        try {
            // Get environment variables
            val userPoolId = System.getenv("USER_POOL_ID")
            
            if (userPoolId.isNullOrEmpty()) {
                context.logger.log("ERROR: Missing USER_POOL_ID environment variable")
                return createErrorResponse(500, "Server configuration error")
            }

            // Parse request body
            val body = input.body ?: return createErrorResponse(400, "Request body is required")

            val registerRequest = try {
                mapper.readValue<RegisterRequest>(body)
            } catch (e: Exception) {
                context.logger.log("ERROR: Failed to parse request body: ${e.message}")
                return createErrorResponse(400, "Invalid request format. Expected JSON with username, password, and email")
            }

            if (registerRequest.username.isNullOrEmpty() || 
                registerRequest.password.isNullOrEmpty() || 
                registerRequest.email.isNullOrEmpty()) {
                return createErrorResponse(400, "Username, password, and email are required")
            }

            // Create user in Cognito
            val createUserRequest = AdminCreateUserRequest.builder()
                .userPoolId(userPoolId)
                .username(registerRequest.username)
                .userAttributes(
                    listOf(
                        software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType.builder()
                            .name("email")
                            .value(registerRequest.email)
                            .build()
                    )
                )
                .messageAction(MessageActionType.SUPPRESS)  // Don't send welcome email
                .build()

            cognitoClient.adminCreateUser(createUserRequest)

            // Set password as permanent to avoid NEW_PASSWORD_REQUIRED challenge
            val setPasswordRequest = AdminSetUserPasswordRequest.builder()
                .userPoolId(userPoolId)
                .username(registerRequest.username)
                .password(registerRequest.password)
                .permanent(true)
                .build()

            cognitoClient.adminSetUserPassword(setPasswordRequest)

            // Success
            val responseBody = mapper.writeValueAsString(
                mapOf("message" to "User registered successfully")
            )
            
            return APIGatewayProxyResponseEvent()
                .withStatusCode(201)
                .withBody(responseBody)
                .withHeaders(mapOf("Content-Type" to "application/json"))
            
        } catch (e: CognitoIdentityProviderException) {
            context.logger.log("ERROR: Cognito registration failed: ${e.message}")
            
            return when {
                e.message?.contains("UsernameExistsException") == true -> 
                    createErrorResponse(409, "Username already exists")
                e.message?.contains("InvalidPasswordException") == true -> 
                    createErrorResponse(400, "Password does not meet requirements")
                e.message?.contains("InvalidParameterException") == true -> 
                    createErrorResponse(400, "Invalid parameter: ${e.message}")
                else -> 
                    createErrorResponse(400, "Registration failed: ${e.message}")
            }
        } catch (e: Exception) {
            context.logger.log("ERROR: Unexpected error during registration: ${e.message}")
            e.printStackTrace()
            return createErrorResponse(500, "Internal server error")
        }
    }
    
    // Data class for login request
    private data class LoginRequest(
        val username: String?,
        val password: String?
    )
    
    // Data class for register request
    private data class RegisterRequest(
        val username: String?,
        val password: String?,
        val email: String?
    )
}