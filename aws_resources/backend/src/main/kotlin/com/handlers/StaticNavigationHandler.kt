package com.handlers
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.LambdaLogger
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sagemakerruntime.SageMakerRuntimeClient
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.ScanRequest
import java.net.URI
import java.util.Base64
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.collections.emptyList



data class LandmarkResult(
    val name: String,
    val floor_number: Int,
    val nearest_node: String
)

data class SearchResponse(
    val results: List<LandmarkResult>
)

data class NavigationStartRequest(
    val destination: Destination,
    val start_location: StartLocation
)

data class Destination(
    val landmark_id: String
)

data class StartLocation(
    val node_id: String
)

data class NavigationInstruction(
    val step: Int,
    val distance_feet: Double,
    val direction: String?,
    val node_id: String,
    val coordinates: Map<String, Double>
)

data class NavigationStartResponse(
    val session_id: String,
    val instructions: List<NavigationInstruction>
)

class StaticNavigationHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val mapper = jacksonObjectMapper()

    override fun handleRequest(
        input: APIGatewayProxyRequestEvent,
        context: Context,
    ): APIGatewayProxyResponseEvent {
        val logger = context.logger
        logger.log("Request: ${input.httpMethod} ${input.path}")

        val path = input.path ?: ""
        val method = input.httpMethod ?: ""

        // /search endpoint (GET)
        if (path == "/search" && method == "GET") {
            val query = input.queryStringParameters?.get("query")
            if (query == null || query.length < 1) {
                return createErrorResponse(400, "Missing or invalid 'query' parameter (min 1 character)")
            }
            val response = handleSearch(query, logger)
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withHeaders(mapOf("Content-Type" to "application/json"))
                .withBody(mapper.writeValueAsString(response))
        }

        // /navigation/start endpoint (POST)
        if (path == "/navigation/start" && method == "POST") {
            val body = input.body
            if (body.isNullOrBlank()) {
                return createErrorResponse(400, "Missing request body")
            }
            val navRequest = try {
                mapper.readValue(body, NavigationStartRequest::class.java)
            } catch (e: Exception) {
                return createErrorResponse(400, "Invalid request body format: ${e.message}")
            }
            if (navRequest.destination.landmark_id.isBlank() || navRequest.start_location.node_id.isBlank()) {
                return createErrorResponse(400, "destination.landmark_id and start_location.node_id are required")
            }
            val response = handleNavigationStart(navRequest, logger)
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withHeaders(mapOf("Content-Type" to "application/json"))
                .withBody(mapper.writeValueAsString(response))
        }

        // Unknown endpoint
        return createErrorResponse(404, "Endpoint not found")
    }

    private fun handleSearch(query: String, logger: LambdaLogger): SearchResponse {
        // Placeholder for search logic
        val response = SearchResponse(
            results = listOf(
                LandmarkResult("Room 226", 2, "r226_door"),
                LandmarkResult("Room 224", 2, "r224_door")
            )
        )
        return response
    }

    private fun handleNavigationStart(request: NavigationStartRequest, logger: LambdaLogger): NavigationStartResponse {
        // Placeholder for navigation start logic
        val response = NavigationStartResponse(
                session_id = "nav_session_abc123",
                instructions = listOf(
                    NavigationInstruction(1, 50.0, "north", "nodeA", mapOf("x_feet" to 0.0, "y_feet" to 0.0)),
                    NavigationInstruction(2, 30.0, "east", "nodeB", mapOf("x_feet" to 50.0, "y_feet" to 0.0))
                )
        )
        return response
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
}