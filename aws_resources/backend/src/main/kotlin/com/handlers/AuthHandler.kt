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
import software.amazon.awssdk.regions.Region
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue

class AuthHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val cognitoClient = CognitoIdentityProviderClient.builder()
        .region(Region.of(System.getenv("AWS_REGION") ?: "us-east-1"))
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
            // Log full error details for debugging (includes Request ID)
            context.logger.log("ERROR: Cognito authentication failed: ${e.message}")
            
            val errorCode = e.awsErrorDetails()?.errorCode()
            val userFriendlyMessage = parseCognitoError(e)
            
            // Map error codes to appropriate HTTP status codes
            val statusCode = when (errorCode) {
                "NotAuthorizedException", "UserNotFoundException" -> 401
                "UserNotConfirmedException" -> 403
                "TooManyRequestsException", "LimitExceededException" -> 429
                else -> 401
            }
            
            return createErrorResponse(statusCode, userFriendlyMessage)
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

    /**
     * Parses and sanitizes Cognito error messages to make them user-friendly.
     * Removes sensitive information like Request IDs, Service names, and Status Codes.
     * 
     * @param exception The CognitoIdentityProviderException to parse
     * @return A sanitized, user-friendly error message
     */
    private fun parseCognitoError(exception: CognitoIdentityProviderException): String {
        // Try to get the error code/type from the exception
        // awsErrorDetails() may return null, so we handle that gracefully
        val errorDetails = try {
            exception.awsErrorDetails()
        } catch (e: Exception) {
            null
        }
        
        val errorCode = errorDetails?.errorCode()
        val errorMessage = errorDetails?.errorMessage()
        val rawMessage = exception.message
        
        // First, try to extract error code from the raw message if awsErrorDetails is not available
        val extractedErrorCode = errorCode ?: extractErrorCodeFromMessage(rawMessage)
        
        // Use error code to map to user-friendly messages
        val userFriendlyMessage = when (extractedErrorCode) {
            "NotAuthorizedException" -> "Invalid username or password"
            "UserNotFoundException" -> "User not found"
            "UserNotConfirmedException" -> "User account is not confirmed"
            "UsernameExistsException" -> "Username already exists"
            "AliasExistsException" -> "An account with this email or phone number already exists"
            "InvalidPasswordException" -> "Password does not meet requirements"
            "InvalidParameterException" -> {
                // Try to extract meaningful part from error message
                sanitizeErrorMessage(errorMessage ?: rawMessage ?: "Invalid parameter provided")
            }
            "TooManyRequestsException" -> "Too many requests. Please try again later"
            "LimitExceededException" -> "Account limit exceeded. Please try again later"
            "CodeMismatchException" -> "Invalid verification code"
            "ExpiredCodeException" -> "Verification code has expired"
            "InvalidUserPoolConfigurationException" -> "Server configuration error"
            else -> {
                // For unknown errors, try to extract meaningful part from message
                val message = errorMessage ?: rawMessage ?: "An error occurred"
                sanitizeErrorMessage(message)
            }
        }
        
        return userFriendlyMessage
    }
    
    /**
     * Extracts the error code from a Cognito error message.
     * Cognito messages often contain the exception type in the message.
     * Also handles cases where the message contains human-readable text that maps to exceptions.
     * 
     * @param message The error message to parse
     * @return The extracted error code, or null if not found
     */
    private fun extractErrorCodeFromMessage(message: String?): String? {
        if (message.isNullOrBlank()) return null
        
        // First, try to find explicit exception names in the message
        val exceptionPatterns = listOf(
            "NotAuthorizedException",
            "UserNotFoundException",
            "UserNotConfirmedException",
            "UsernameExistsException",
            "AliasExistsException",
            "InvalidPasswordException",
            "InvalidParameterException",
            "TooManyRequestsException",
            "LimitExceededException",
            "CodeMismatchException",
            "ExpiredCodeException",
            "InvalidUserPoolConfigurationException"
        )
        
        val explicitException = exceptionPatterns.firstOrNull { 
            message.contains(it, ignoreCase = true) 
        }
        if (explicitException != null) return explicitException
        
        // If no explicit exception found, try to infer from message content
        val messageLower = message.lowercase()
        return when {
            messageLower.contains("user account already exists") || 
            messageLower.contains("username already exists") || 
            messageLower.contains("already exists") -> "UsernameExistsException"
            messageLower.contains("invalid password") || 
            messageLower.contains("password does not meet") -> "InvalidPasswordException"
            messageLower.contains("user not found") -> "UserNotFoundException"
            messageLower.contains("not authorized") || 
            messageLower.contains("invalid credentials") -> "NotAuthorizedException"
            messageLower.contains("not confirmed") -> "UserNotConfirmedException"
            messageLower.contains("too many requests") -> "TooManyRequestsException"
            messageLower.contains("limit exceeded") -> "LimitExceededException"
            else -> null
        }
    }

    /**
     * Sanitizes error messages by removing sensitive information.
     * Removes patterns like:
     * - (Service: CognitoIdentityProvider, Status Code: 400, Request ID: xxx)
     * - Request IDs
     * - Service names
     * - Status codes
     * 
     * @param message The raw error message
     * @return A sanitized error message
     */
    private fun sanitizeErrorMessage(message: String?): String {
        if (message.isNullOrBlank()) {
            return "An error occurred"
        }
        
        // Remove patterns like: (Service: ..., Status Code: ..., Request ID: ...)
        var sanitized = message.replace(
            Regex("\\(Service:[^)]+\\)"),
            ""
        ).trim()
        
        // Remove standalone Request ID patterns
        sanitized = sanitized.replace(
            Regex("Request ID: [a-f0-9-]+", RegexOption.IGNORE_CASE),
            ""
        ).trim()
        
        // Remove Status Code patterns
        sanitized = sanitized.replace(
            Regex("Status Code: \\d+", RegexOption.IGNORE_CASE),
            ""
        ).trim()
        
        // Remove Service: patterns
        sanitized = sanitized.replace(
            Regex("Service: [^,]+", RegexOption.IGNORE_CASE),
            ""
        ).trim()
        
        // Clean up multiple spaces and trailing punctuation
        sanitized = sanitized.replace(Regex("\\s+"), " ")
            .replace(Regex("^[,;:\\s]+"), "")
            .replace(Regex("[,;:\\s]+$"), "")
            .trim()
        
        // If we've removed everything, return a generic message
        if (sanitized.isBlank()) {
            return "An error occurred"
        }
        
        // Capitalize first letter if needed
        return sanitized.replaceFirstChar { 
            if (it.isLowerCase()) it.titlecase() else it.toString() 
        }
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
            // Log full error details for debugging (includes Request ID)
            context.logger.log("ERROR: Cognito registration failed: ${e.message}")
            
            val errorCode = e.awsErrorDetails()?.errorCode()
            val userFriendlyMessage = parseCognitoError(e)
            
            // Map error codes to appropriate HTTP status codes
            val statusCode = when (errorCode) {
                "UsernameExistsException", "AliasExistsException" -> 409
                "InvalidPasswordException", "InvalidParameterException" -> 400
                "TooManyRequestsException", "LimitExceededException" -> 429
                "InvalidUserPoolConfigurationException" -> 500
                else -> 400
            }
            
            return createErrorResponse(statusCode, userFriendlyMessage)
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
