package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent.RequestContext
import io.mockk.*
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.ScanRequest
import software.amazon.awssdk.services.dynamodb.model.ScanResponse
import software.amazon.awssdk.services.sagemakerruntime.SageMakerRuntimeClient
import com.models.InferenceResult
import com.models.BoundingBox
import com.services.DynamoDbTableClient
import java.util.Base64

class ObjectDetectionHandlerTest {

    // Mocks for dependencies
    private val mockSageMaker = mockk<SageMakerRuntimeClient>()
    private val mockHeightDdb = mockk<DynamoDbTableClient>()
    private val mockFeatureDdb = mockk<DynamoDbTableClient>()
    private val mockApiGateway = mockk<ApiGatewayManagementApiClient>(relaxed = true)
    private val mockContext = mockk<Context>()
    private val mockLogger = mockk<LambdaLogger>(relaxed = true)

    private lateinit var handler: ObjectDetectionHandler

    @BeforeEach
    fun setup() {
        // 1. Reset Internal Cache
        ObjectDetectionHandler.isCacheLoaded = false
        ObjectDetectionHandler.classHeightMap.clear()

        every { mockContext.logger } returns mockLogger

        // 2. Create the real handler instance with mocked dependencies
        val realHandler = ObjectDetectionHandler(
            heightTableClient = mockHeightDdb,
            featureFlagsTableClient = mockFeatureDdb,
            sagemakerClient = mockSageMaker,
            apiGatewayFactory = { _ -> mockApiGateway }
        )

        // 3. SPY on the handler to allow mocking private methods
        handler = spyk(realHandler, recordPrivateCalls = true)
    }

    @Test
    fun `handleRequest should calculate distance and post to api gateway`() {
        val ddbHeightItems = listOf(
            mapOf("class_name" to "person", "avg_height_meters" to "1.7")
        )

        every { mockHeightDdb.scanAll() } returns ddbHeightItems
        every { mockFeatureDdb.getStringItem(itemName = "enable_sagemaker_inference", attributeName = "feature_name") } returns true

        // 2. MOCK THE PRIVATE getDetections FUNCTION
        // This bypasses the actual logic (and the TODO/SageMaker call) entirely
        val fakeDetections = listOf(
            BoundingBox(
                x = 320,
                y = 320,
                width = 200,
                height = 640,
                className = "person",
                confidence = 0.95f
            )
        )
        
        // Mock the public getDetections function which accepts a single ByteArray
        every { handler.getDetections(false, any<ByteArray>(), mockLogger) } returns fakeDetections

        // 3. Create Input Event
        val imageBytes = "fake_image_bytes".toByteArray()
        val base64Image = Base64.getEncoder().encodeToString(imageBytes)
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
            }
            body = """{"action":"frame", "body":"$base64Image"}"""
        }

        // --- WHEN ---
        handler.handleRequest(event, mockContext)

        // --- THEN ---
        
        // Verify API Gateway Post was called
        val apiSlot = slot<PostToConnectionRequest>()
        verify { mockApiGateway.postToConnection(capture(apiSlot)) }
        
        val resultJson = apiSlot.captured.data().asUtf8String()
        println("Result: $resultJson")

        // Distance Formula: (RealHeight(1.7) * Focal(800)) / PixelHeight(640) = 2.125
        assertTrue(resultJson.contains("2.125"), "Expected distance 2.125 not found in response")
    }
}