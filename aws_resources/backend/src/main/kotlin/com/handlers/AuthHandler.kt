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
import software.amazon.awssdk.services.cognitoidentityprovider.model.ChangePasswordRequest as CognitoChangePasswordRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.CognitoIdentityProviderException
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminCreateUserRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminSetUserPasswordRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminDeleteUserRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminGetUserRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.MessageActionType
import software.amazon.awssdk.services.cognitoidentityprovider.model.ListUsersRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserNotFoundException
import software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType
import software.amazon.awssdk.services.cognitoidentityprovider.model.NotAuthorizedException
import software.amazon.awssdk.regions.Region
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue

class AuthHandler(
    private val cognitoClient: CognitoIdentityProviderClient = defaultCognitoClient()
) : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {
    private val mapper = jacksonObjectMapper()

    override fun handleRequest(
        input: APIGatewayProxyRequestEvent,
        context: Context,
    ): APIGatewayProxyResponseEvent {
        // High-level request logging for CloudWatch
        context.logger.log("AuthHandler: incoming request")
        context.logger.log("HTTP Method: ${input.httpMethod}")
        context.logger.log("Path: ${input.path}")
        context.logger.log("Request payload (sanitized): ${sanitizePayloadForLogging(input.body)}")

        val path = input.path ?: ""
        val method = input.httpMethod ?: ""

        val response = when {
            path == "/login" && method == "POST" -> handleLogin(input, context)
            path == "/refresh" && method == "POST" -> handleRefresh(input, context)
            path == "/register" && method == "POST" -> handleRegister(input, context)
            path == "/register/check-username" && method == "GET" -> handleCheckUsername(input, context)
            path == "/register/check-email" && method == "GET" -> handleCheckEmail(input, context)
            path == "/password/change" && method == "POST" -> handleChangePassword(input, context)
            else -> createErrorResponse(404, "Not Found")
        }

        // Log response status for CloudWatch visibility
        context.logger.log("AuthHandler: response statusCode=${response.statusCode}")

        return response
    }

    /**
     * Sanitizes request bodies before logging so that secrets (passwords) are never written
     * to CloudWatch in plaintext. Any JSON field whose name contains \"password\" will be
     * replaced with a fixed mask of 8 asterisks.
     */
    private fun sanitizePayloadForLogging(rawBody: String?): String {
        if (rawBody.isNullOrBlank()) {
            return "null"
        }

        return try {
            val node = mapper.readTree(rawBody)

            fun sanitizeNode(n: com.fasterxml.jackson.databind.JsonNode) {
                if (n.isObject) {
                    val obj = n as com.fasterxml.jackson.databind.node.ObjectNode
                    val fieldNames = obj.fieldNames()
                    while (fieldNames.hasNext()) {
                        val fieldName = fieldNames.next()
                        val child = obj.get(fieldName)
                        if (fieldName.contains("password", ignoreCase = true) && child.isTextual) {
                            obj.put(fieldName, "********")
                        } else if (child.isObject || child.isArray) {
                            sanitizeNode(child)
                        }
                    }
                } else if (n.isArray) {
                    n.forEach { child -> sanitizeNode(child) }
                }
            }

            sanitizeNode(node)
            mapper.writeValueAsString(node)
        } catch (_: Exception) {
            // Fallback: best-effort masking of common password fields in a non-JSON payload
            rawBody
                .replace(Regex("(\"password\"\\s*:\\s*\")[^\"]*(\")", RegexOption.IGNORE_CASE), "$1********$2")
                .replace(Regex("(\"passwordConfirm\"\\s*:\\s*\")[^\"]*(\")", RegexOption.IGNORE_CASE), "$1********$2")
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

            context.logger.log("Parsed login request username=${loginRequest.username}")

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

    private fun handleRefresh(
        input: APIGatewayProxyRequestEvent,
        context: Context
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Handling refresh request")
        try {
            val clientId = System.getenv("USER_POOL_CLIENT_ID")
            if (clientId.isNullOrEmpty()) {
                context.logger.log("ERROR: Missing USER_POOL_CLIENT_ID environment variable")
                return createErrorResponse(500, "Server configuration error")
            }

            val body = input.body ?: return createErrorResponse(400, "Request body is required")
            val refreshRequest = try {
                mapper.readValue<RefreshTokenRequest>(body)
            } catch (e: Exception) {
                context.logger.log("ERROR: Failed to parse refresh body: ${e.message}")
                return createErrorResponse(400, "Invalid request format. Expected JSON with refreshToken")
            }

            val refreshToken = refreshRequest.refreshToken?.trim()
            if (refreshToken.isNullOrEmpty()) {
                return createErrorResponse(400, "refreshToken is required")
            }

            val authRequest = InitiateAuthRequest.builder()
                .clientId(clientId)
                .authFlow(AuthFlowType.REFRESH_TOKEN_AUTH)
                .authParameters(mapOf("REFRESH_TOKEN" to refreshToken))
                .build()

            val authResponse = cognitoClient.initiateAuth(authRequest)
            val authResult = authResponse.authenticationResult()
                ?: return createErrorResponse(401, "Unable to refresh session")

            val responseBody = mapper.writeValueAsString(
                mapOf(
                    "accessToken" to authResult.accessToken(),
                    "idToken" to authResult.idToken(),
                    "refreshToken" to (authResult.refreshToken() ?: refreshToken),
                    "expiresIn" to authResult.expiresIn(),
                    "tokenType" to authResult.tokenType()
                )
            )
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withBody(responseBody)
                .withHeaders(mapOf("Content-Type" to "application/json"))
        } catch (e: NotAuthorizedException) {
            context.logger.log("ERROR: Refresh rejected by Cognito: ${e.message}")
            return createErrorResponse(401, "Invalid or expired refresh token")
        } catch (e: CognitoIdentityProviderException) {
            context.logger.log("ERROR: Cognito refresh failed: ${e.message}")
            val statusCode = when (e.awsErrorDetails()?.errorCode()) {
                "InvalidParameterException" -> 400
                "TooManyRequestsException", "LimitExceededException" -> 429
                else -> 401
            }
            return createErrorResponse(statusCode, parseCognitoError(e))
        } catch (e: Exception) {
            context.logger.log("ERROR: Unexpected error during refresh: ${e.message}")
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

    private fun createJsonResponse(
        statusCode: Int,
        body: Map<String, Any>
    ): APIGatewayProxyResponseEvent {
        return APIGatewayProxyResponseEvent()
            .withStatusCode(statusCode)
            .withBody(mapper.writeValueAsString(body))
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
            "AliasExistsException" -> "An account with this email already exists"
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

    private fun normalizeUsername(username: String?): String? {
        return username?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun isEmailFormatValid(email: String): Boolean {
        val emailRegex = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$")
        return emailRegex.matches(email)
    }

    /**
     * Checks if an email address already exists in the Cognito user pool.
     * Uses ListUsers API with email filter to check for existing users.
     * 
     * @param userPoolId The Cognito user pool ID
     * @param email The email address to check (should already be normalized/lowercase)
     * @param context Lambda context for logging
     * @return true if email exists, false otherwise
     */
    private fun checkEmailExists(
        userPoolId: String,
        email: String,
        context: Context,
        suppressErrors: Boolean = true
    ): Boolean {
        return try {
            val listUsersRequest = ListUsersRequest.builder()
                .userPoolId(userPoolId)
                .filter("email = \"${email}\"")
                .limit(1)
                .build()
            
            val response = cognitoClient.listUsers(listUsersRequest)
            val exists = response.users().isNotEmpty()
            
            if (exists) {
                context.logger.log("Email already exists: $email")
            }
            
            exists
        } catch (e: Exception) {
            if (!suppressErrors) {
                throw e
            }
            // Log error but don't fail registration - let Cognito handle it
            // This prevents the check from blocking registration if there's an API issue
            context.logger.log("WARNING: Failed to check email existence: ${e.message}")
            false
        }
    }

    private fun handleCheckUsername(
        input: APIGatewayProxyRequestEvent,
        context: Context
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Handling username availability check request")

        try {
            val userPoolId = System.getenv("USER_POOL_ID")
            if (userPoolId.isNullOrEmpty()) {
                context.logger.log("ERROR: Missing USER_POOL_ID environment variable")
                return createErrorResponse(500, "Server configuration error")
            }

            val usernameParam = input.queryStringParameters?.get("username")
            val normalizedUsername = normalizeUsername(usernameParam)
                ?: return createErrorResponse(400, "username query parameter is required")

            if (normalizedUsername.length > 64) {
                return createErrorResponse(400, "username must be 64 characters or less")
            }

            return try {
                val getUserRequest = AdminGetUserRequest.builder()
                    .userPoolId(userPoolId)
                    .username(normalizedUsername)
                    .build()
                cognitoClient.adminGetUser(getUserRequest)

                createJsonResponse(
                    200,
                    mapOf(
                        "available" to false,
                        "username" to normalizedUsername
                    )
                )
            } catch (_: UserNotFoundException) {
                createJsonResponse(
                    200,
                    mapOf(
                        "available" to true,
                        "username" to normalizedUsername
                    )
                )
            }
        } catch (e: CognitoIdentityProviderException) {
            context.logger.log("ERROR: Username availability check failed: ${e.message}")
            return createErrorResponse(500, "Unable to check username availability")
        } catch (e: Exception) {
            context.logger.log("ERROR: Unexpected error during username availability check: ${e.message}")
            return createErrorResponse(500, "Internal server error")
        }
    }

    private fun handleCheckEmail(
        input: APIGatewayProxyRequestEvent,
        context: Context
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Handling email availability check request")

        try {
            val userPoolId = System.getenv("USER_POOL_ID")
            if (userPoolId.isNullOrEmpty()) {
                context.logger.log("ERROR: Missing USER_POOL_ID environment variable")
                return createErrorResponse(500, "Server configuration error")
            }

            val emailParam = input.queryStringParameters?.get("email")
            val normalizedEmail = normalizeEmail(emailParam)
                ?: return createErrorResponse(400, "email query parameter is required")

            if (!isEmailFormatValid(normalizedEmail)) {
                return createErrorResponse(400, "Invalid email format")
            }

            val exists = checkEmailExists(
                userPoolId = userPoolId,
                email = normalizedEmail,
                context = context,
                suppressErrors = false
            )

            return createJsonResponse(
                200,
                mapOf(
                    "available" to !exists,
                    "email" to normalizedEmail
                )
            )
        } catch (e: CognitoIdentityProviderException) {
            context.logger.log("ERROR: Email availability check failed: ${e.message}")
            return createErrorResponse(500, "Unable to check email availability")
        } catch (e: Exception) {
            context.logger.log("ERROR: Unexpected error during email availability check: ${e.message}")
            return createErrorResponse(500, "Internal server error")
        }
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
                return createErrorResponse(400, "Invalid request format. Expected JSON with username, password, passwordConfirm, email, firstName, and lastName")
            }

            // Normalize inputs (trim whitespace, lowercase email)
            val normalizedUsername = normalizeUsername(registerRequest.username)
            val normalizedEmail = normalizeEmail(registerRequest.email)
            val normalizedPassword = registerRequest.password?.trim()
            val normalizedPasswordConfirm = registerRequest.passwordConfirm?.trim()
            val normalizedFirstName = registerRequest.firstName?.trim()?.takeIf { it.isNotBlank() }
            val normalizedLastName = registerRequest.lastName?.trim()?.takeIf { it.isNotBlank() }
            
            // Validate required fields
            if (normalizedUsername == null || normalizedPassword.isNullOrEmpty() || normalizedPasswordConfirm.isNullOrEmpty() ||
                normalizedFirstName == null || normalizedLastName == null) {
                return createErrorResponse(400, "Username, password, passwordConfirm, firstName, and lastName are required")
            }

            if (normalizedEmail == null) {
                return createErrorResponse(400, "Email is required")
            }
            
            // Validate password confirmation
            if (normalizedPassword != normalizedPasswordConfirm) {
                return createErrorResponse(400, "Passwords do not match")
            }
            
            // Length sanity checks (prevent abuse before Cognito validation)
            if (normalizedUsername.length > 64) {
                return createErrorResponse(400, "Username must be 64 characters or less")
            }

            if (normalizedFirstName.length > 64) {
                return createErrorResponse(400, "First name must be 64 characters or less")
            }

            if (normalizedLastName.length > 64) {
                return createErrorResponse(400, "Last name must be 64 characters or less")
            }

            val emailExists = checkEmailExists(userPoolId, normalizedEmail, context)
            if (emailExists) {
                return createErrorResponse(409, "An account with this email already exists")
            }

            // Build user attributes list and include the required email attribute.
            val userAttributes = mutableListOf(
                software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType.builder()
                    .name("given_name")
                    .value(normalizedFirstName)  // First name
                    .build(),
                software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType.builder()
                    .name("family_name")
                    .value(normalizedLastName)  // Last name
                    .build(),
                AttributeType.builder()
                    .name("email")
                    .value(normalizedEmail)  // Already lowercase and validated
                    .build()
            )

            // Create user in Cognito with normalized values
            val createUserRequest = AdminCreateUserRequest.builder()
                .userPoolId(userPoolId)
                .username(normalizedUsername)  // Trimmed and validated
                .userAttributes(userAttributes)
                .messageAction(MessageActionType.SUPPRESS)  // Don't send welcome email
                .build()

            cognitoClient.adminCreateUser(createUserRequest)
            
            // Track if user was created successfully for cleanup on failure
            var userCreated = true

            try {
                // Set password with trimmed value
                val setPasswordRequest = AdminSetUserPasswordRequest.builder()
                    .userPoolId(userPoolId)
                    .username(normalizedUsername)
                    .password(normalizedPassword)
                    .permanent(true)
                    .build()

                cognitoClient.adminSetUserPassword(setPasswordRequest)
            } catch (e: CognitoIdentityProviderException) {
                // If password setting fails, clean up the orphaned user
                if (userCreated) {
                    try {
                        context.logger.log("Password setting failed, cleaning up orphaned user: ${normalizedUsername}")
                        val deleteUserRequest = AdminDeleteUserRequest.builder()
                            .userPoolId(userPoolId)
                            .username(normalizedUsername)
                            .build()
                        cognitoClient.adminDeleteUser(deleteUserRequest)
                    } catch (deleteError: Exception) {
                        context.logger.log("ERROR: Failed to cleanup orphaned user: ${deleteError.message}")
                        // Log but don't fail - the original error is more important
                    }
                }
                // Re-throw to be handled by outer catch block
                throw e
            }

            // Success - return username for client reference
            val responseBody = mapper.writeValueAsString(
                mapOf(
                    "message" to "User registered successfully",
                    "username" to normalizedUsername
                )
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

    private fun handleChangePassword(
        input: APIGatewayProxyRequestEvent,
        context: Context,
    ): APIGatewayProxyResponseEvent {
        context.logger.log("Handling change password request")

        try {
            val body = input.body ?: return createErrorResponse(400, "Request body is required")
            val authorizationHeader = getAuthorizationHeader(input)
                ?: return createErrorResponse(401, "Authorization header is required")
            val accessToken = extractBearerToken(authorizationHeader)
                ?: return createErrorResponse(401, "Authorization header must use Bearer token")

            val request = try {
                mapper.readValue<ChangePasswordRequest>(body)
            } catch (e: Exception) {
                context.logger.log("ERROR: Failed to parse request body: ${e.message}")
                return createErrorResponse(
                    400,
                    "Invalid request format. Expected JSON with currentPassword, newPassword, and newPasswordConfirm"
                )
            }

            val currentPassword = request.currentPassword?.trim()
            val newPassword = request.newPassword?.trim()
            val newPasswordConfirm = request.newPasswordConfirm?.trim()

            if (currentPassword.isNullOrEmpty() || newPassword.isNullOrEmpty() || newPasswordConfirm.isNullOrEmpty()) {
                return createErrorResponse(400, "Current password, new password, and password confirmation are required")
            }

            if (newPassword != newPasswordConfirm) {
                return createErrorResponse(400, "Passwords do not match")
            }

            if (newPassword == currentPassword) {
                return createErrorResponse(400, "New password must be different from current password")
            }

            val changePasswordRequest = CognitoChangePasswordRequest.builder()
                .accessToken(accessToken)
                .previousPassword(currentPassword)
                .proposedPassword(newPassword)
                .build()

            cognitoClient.changePassword(changePasswordRequest)

            val responseBody = mapper.writeValueAsString(
                mapOf("message" to "Password changed successfully")
            )
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withBody(responseBody)
                .withHeaders(mapOf("Content-Type" to "application/json"))
        } catch (e: CognitoIdentityProviderException) {
            context.logger.log("ERROR: Cognito password change failed: ${e.message}")

            val errorCode = e.awsErrorDetails()?.errorCode()
            val normalizedMessage = "${e.awsErrorDetails()?.errorMessage() ?: e.message ?: ""}".lowercase()
            val userFriendlyMessage = parseCognitoError(e)

            val statusCode: Int
            val message: String

            when (errorCode) {
                "InvalidPasswordException" -> {
                    statusCode = 400
                    message = userFriendlyMessage
                }
                "TooManyRequestsException", "LimitExceededException" -> {
                    statusCode = 429
                    message = userFriendlyMessage
                }
                "NotAuthorizedException" -> {
                    val tokenError = normalizedMessage.contains("token") ||
                        normalizedMessage.contains("expired") ||
                        normalizedMessage.contains("invalid access token") ||
                        normalizedMessage.contains("access token")
                    if (tokenError) {
                        statusCode = 401
                        message = "Invalid or expired access token"
                    } else {
                        statusCode = 400
                        message = "Current password is incorrect"
                    }
                }
                else -> {
                    statusCode = 400
                    message = userFriendlyMessage
                }
            }

            return createErrorResponse(statusCode, message)
        } catch (e: Exception) {
            context.logger.log("ERROR: Unexpected error during password change: ${e.message}")
            e.printStackTrace()
            return createErrorResponse(500, "Internal server error")
        }
    }

    private fun getAuthorizationHeader(input: APIGatewayProxyRequestEvent): String? {
        return input.headers
            ?.entries
            ?.firstOrNull { it.key.equals("Authorization", ignoreCase = true) }
            ?.value
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    }

    private fun extractBearerToken(authorizationHeader: String): String? {
        if (!authorizationHeader.startsWith("Bearer ", ignoreCase = true)) {
            return null
        }

        return authorizationHeader
            .substringAfter(" ", "")
            .trim()
            .takeIf { it.isNotEmpty() }
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
        val passwordConfirm: String?,
        val email: String?,
        val firstName: String?,
        val lastName: String?
    )

    // Data class for change password request
    private data class ChangePasswordRequest(
        val currentPassword: String?,
        val newPassword: String?,
        val newPasswordConfirm: String?,
    )

    private data class RefreshTokenRequest(
        val refreshToken: String?
    )

    companion object {
        private fun defaultCognitoClient(): CognitoIdentityProviderClient {
            return CognitoIdentityProviderClient.builder()
                .region(Region.of(System.getenv("AWS_REGION") ?: "us-east-1"))
                .httpClient(UrlConnectionHttpClient.builder().build())
                .build()
        }
    }
}
