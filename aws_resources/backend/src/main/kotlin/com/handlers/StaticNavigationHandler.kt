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


data class Landmark(
    val landmarkName: String,
    val floorNumber: Int,
    val nearestNode: String
)

class StaticNavigationHandler : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private val mapper = jacksonObjectMapper()

    override fun handleRequest(
        input: APIGatewayProxyRequestEvent,
        context: Context,
    ): APIGatewayProxyResponseEvent {
        var logger = context.logger
        logger.log("Request: ${input.httpMethod} ${input.path}")

        val path = input.path ?: ""
        val method = input.httpMethod ?: ""

        val landmarkID = input.queryStringParameters?.get("landmarkID") ?: ""
        val landmark = input.queryStringParameters?.get("landmark") ?: ""

        var destinationList: List<Landmark>
        var instructions: String

        if (path == "/search" && method == "POST") {
            if (landmark.isEmpty()) {
                return createErrorResponse(400, "Missing 'landmark' query parameter")
            } else {
                destinationList = handleSearch(landmark, logger)
                
            }
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withHeaders(mapOf("Content-Type" to "application/json"))
                .withBody(mapper.writeValueAsString(destinationList))
        } else if (path == "/navigation/start" && method == "POST") {
            if (landmarkID.isEmpty()) {
                return createErrorResponse(400, "Missing 'landmarkID' query parameter")
            } else {
                instructions = handleNavStart(landmarkID, logger)
            }
            return APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withHeaders(mapOf("Content-Type" to "application/json"))
                .withBody(instructions)
        } else {
            return createErrorResponse(404, "Endpoint not found")
        }   
    }

    private fun handleSearch(landmark: String, logger: LambdaLogger): List<Landmark> {
        // Placeholder for search logic
        logger.log("Received search request for landmark: $landmark")
        // In a real implementation, you would query your database or search service here
        return listOf(
            Landmark("Landmark 1", 1, "Node A"),
            Landmark("Landmark 2", 2, "Node B"),
            Landmark("Landmark 3", 3, "Node C")
        )
    }

    private fun handleNavStart(landmarkID: String, logger: LambdaLogger): String {
        // Placeholder for navigation start logic
        logger.log("Received navigation start request for landmark ID: $landmarkID")
        // In a real implementation, you would initiate navigation logic here
        return """{"message": "Navigation instructions to landmark ID: $landmarkID ..."}"""
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