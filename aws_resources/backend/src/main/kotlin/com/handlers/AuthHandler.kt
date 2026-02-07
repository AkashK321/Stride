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

            // Normalize inputs (trim whitespace)
            val normalizedUsername = normalizeUsername(loginRequest.username)
            val normalizedPassword = loginRequest.password?.trim()
            
            if (normalizedUsername == null || normalizedPassword.isNullOrEmpty()) {
                return createErrorResponse(400, "Username and password are required")
            }

            // Authenticate with Cognito using USER_PASSWORD_AUTH (matches client configuration)
            val authRequest = InitiateAuthRequest.builder()
                .clientId(clientId)
                .authFlow(AuthFlowType.USER_PASSWORD_AUTH)
                .authParameters(
                    mapOf(
                        "USERNAME" to normalizedUsername,
                        "PASSWORD" to normalizedPassword
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

    // Normalization helper functions (Cognito handles validation)

    private fun normalizeEmail(email: String?): String? {
        return email?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
    }

    private fun normalizePhoneNumber(phone: String?): String? {
        if (phone.isNullOrBlank()) return null
        // Remove common formatting characters, let Cognito validate format
        return phone.trim().replace(Regex("[\\s\\-\\(\\)\\.]"), "").takeIf { it.isNotBlank() }
    }

    private fun normalizeUsername(username: String?): String? {
        return username?.trim()?.takeIf { it.isNotBlank() }
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

            // Normalize inputs (trim whitespace, lowercase email)
            val normalizedUsername = normalizeUsername(registerRequest.username)
            val normalizedEmail = normalizeEmail(registerRequest.email)
            val normalizedPhone = normalizePhoneNumber(registerRequest.phoneNumber)
            val normalizedPassword = registerRequest.password?.trim()
            
            if (normalizedUsername == null || normalizedPassword.isNullOrEmpty() || normalizedEmail == null) {
                return createErrorResponse(400, "Username, password, and email are required")
            }

            // Build user attributes list
            val userAttributes = mutableListOf(
                software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType.builder()
                    .name("email")
                    .value(normalizedEmail)  // Already lowercase and validated
                    .build()
            )
            
            // Add phone number if provided
            normalizedPhone?.let { phone ->
                userAttributes.add(
                    software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType.builder()
                        .name("phone_number")
                        .value(phone)  // Already in E.164 format
                        .build()
                )
            }

            // Create user in Cognito with normalized values
            val createUserRequest = AdminCreateUserRequest.builder()
                .userPoolId(userPoolId)
                .username(normalizedUsername)  // Trimmed and validated
                .userAttributes(userAttributes)
                .messageAction(MessageActionType.SUPPRESS)  // Don't send welcome email
                .build()

            cognitoClient.adminCreateUser(createUserRequest)

            // Set password with trimmed value
            val setPasswordRequest = AdminSetUserPasswordRequest.builder()
                .userPoolId(userPoolId)
                .username(normalizedUsername)
                .password(normalizedPassword)
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
        val email: String?,
        val phoneNumber: String? = null  // Optional
    )
}
