package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent.RequestContext
import com.models.LandmarkDetails
import com.models.BoundingBox
import com.services.DynamoDbTableClient
import com.services.RdsMapClient
import io.mockk.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.Base64

class LiveNavigationHandlerTest {

    private val mockContext = mockk<Context>()
    private val mockLogger = mockk<LambdaLogger>(relaxed = true)
    
    private lateinit var handler: LiveNavigationHandler

    @BeforeEach
    fun setup() {
        every { mockContext.logger } returns mockLogger
        
        // 1. Mock DynamoDB client to avoid real AWS calls and control the session state
        mockkConstructor(DynamoDbTableClient::class)
        every { anyConstructed<DynamoDbTableClient>().getItemDetails(any()) } returns mapOf(
            "current_x" to "0.0",
            "current_y" to "0.0",
            "last_updated_ms" to "1670000000000",
            "destLandmarkId" to "1"
        )
        every { anyConstructed<DynamoDbTableClient>().putItem(any()) } just Runs

        // 2. Mock RDS Map client to avoid Postgres connections during unit tests
        mockkConstructor(RdsMapClient::class)
        val mockConn = mockk<java.sql.Connection>(relaxed = true)
        
        every { anyConstructed<RdsMapClient>().getDbConnection() } returns mockConn
        every { anyConstructed<RdsMapClient>().getClosestMapNode(any(), any(), any()) } returns mapOf("NodeID" to "1")
        
        val mockLandmark = mockk<LandmarkDetails>(relaxed = true)
        every { mockLandmark.nearestNodeId } returns "2"
        every { anyConstructed<RdsMapClient>().getLandmark(any(), any()) } returns mockLandmark
        
        every { anyConstructed<RdsMapClient>().getBuildingIdForNode(any(), any()) } returns "B1"
        // Return a mock path to prevent the pathNodes.isEmpty() Exception from throwing
        every { anyConstructed<RdsMapClient>().calculateShortestPath(any(), any(), any(), any()) } returns Pair(listOf("1", "2"), 10.0)
        every { anyConstructed<RdsMapClient>().buildInstructions(any(), any(), any()) } returns emptyList()

        handler = LiveNavigationHandler()
    }

    @AfterEach
    fun teardown() {
        unmockkAll() // Clean up mocks after every test to prevent cross-contamination
    }

    // --- Helper for Private Method Testing ---
    
    private fun invokeFuseLocationWithLandmarks(
        pdrX: Double,
        pdrY: Double,
        headingDegrees: Double,
        detectedObjects: List<DetectedObject>,
        logger: LambdaLogger
    ): Pair<Double, Double> {
        val method = LiveNavigationHandler::class.java.getDeclaredMethod(
            "fuseLocationWithLandmarks",
            Double::class.java,
            Double::class.java,
            Double::class.java,
            List::class.java,
            LambdaLogger::class.java
        )
        method.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        return method.invoke(handler, pdrX, pdrY, headingDegrees, detectedObjects, logger) as Pair<Double, Double>
    }

    // --- CV Localization Fusion Tests ---

    @Test
    fun `fuseLocationWithLandmarks should return PDR coordinates when no objects are detected`() {
        val result = invokeFuseLocationWithLandmarks(10.0, 20.0, 90.0, emptyList(), mockLogger)
        assertEquals(Pair(10.0, 20.0), result)
    }

    @Test
    fun `fuseLocationWithLandmarks should return PDR coordinates when object is beyond 15ft threshold`() {
        val detectedObj = DetectedObject(
            obj = BoundingBox(0, 0, 10, 10, "door", 0.9f),
            distanceMeters = 5.0 // 5.0 meters is ~16.4 ft (Exceeds 15ft threshold)
        )
        val result = invokeFuseLocationWithLandmarks(10.0, 20.0, 90.0, listOf(detectedObj), mockLogger)
        assertEquals(Pair(10.0, 20.0), result)
        verify { mockLogger.log(match<String> { it.contains("exceeds 15 ft threshold") }) }
    }

    @Test
    fun `fuseLocationWithLandmarks should return PDR coordinates when landmark is not in RDS`() {
        val detectedObj = DetectedObject(
            obj = BoundingBox(0, 0, 10, 10, "unknown_landmark", 0.9f),
            distanceMeters = 2.0 // ~6.5 ft, well within threshold
        )
        val result = invokeFuseLocationWithLandmarks(10.0, 20.0, 90.0, listOf(detectedObj), mockLogger)
        assertEquals(Pair(10.0, 20.0), result)
        verify { mockLogger.log(match<String> { it.contains("not found in RDS database") }) }
    }

    @Test
    fun `fuseLocationWithLandmarks should apply complementary filter when valid landmark is close`() {
        val mockLandmark = mockk<LandmarkDetails>()
        every { mockLandmark.coordX } returns 100
        every { mockLandmark.coordY } returns 0
        every { anyConstructed<RdsMapClient>().getLandmarkByName("fire_extinguisher", any()) } returns mockLandmark

        val detectedObj = DetectedObject(
            obj = BoundingBox(0, 0, 10, 10, "fire_extinguisher", 0.9f),
            distanceMeters = 3.048 // Exactly 10.0 feet
        )

        /*
         * Setup constraints for math verification:
         * PDR is at (120, 120)
         * Heading is 0.0 (Looking North/Up)
         * Landmark is at (100, 0)
         * Distance is 10 ft -> 100 pixels.
         * CV Estimate X: 100 - (100 * sin(0)) = 100
         * CV Estimate Y: 0 + (100 * cos(0)) = 100
         * Alpha calc: maxAlpha(0.9) * (1 - (10ft / 15ft)) = 0.9 * 0.3333 = 0.30
         * Fused X: (0.3 * 100) + (0.7 * 120) = 30 + 84 = 114.0
         * Fused Y: (0.3 * 100) + (0.7 * 120) = 30 + 84 = 114.0
         */
        val result = invokeFuseLocationWithLandmarks(120.0, 120.0, 0.0, listOf(detectedObj), mockLogger)
        
        // Asserting with a delta to handle floating point imprecision
        assertEquals(114.0, result.first, 0.01)
        assertEquals(114.0, result.second, 0.01)
    }

    @Test
    fun `handleRequest should return 400 when request context is missing`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext() // empty context
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
        assertEquals("Missing WebSocket request context", response.body)
    }

    @Test
    fun `handleRequest should return 200 for default route`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "\$default"
            }
            body = "{}"
        }

        val response = handler.handleRequest(event, mockContext)

        // The default route specifically returns 200 and posts an error message back to the connection
        assertEquals(200, response.statusCode)
        verify { mockLogger.log(match<String> { it.contains("route: \$default") }) }
    }

    @Test
    fun `handleRequest should return 400 when routeKey is unsupported`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "unsupported_route"
            }
            body = "{}"
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should return 400 when payload validation fails due to missing session_id`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            // Missing almost everything, particularly session_id
            body = """{"request_id": 1}"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should return 400 when focal_length_pixels is negative`() {
        val validBase64 = Base64.getEncoder().encodeToString("dummy_image".toByteArray())
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            body = """{
                "session_id": "session123",
                "image_base64": "$validBase64",
                "focal_length_pixels": -10.0,
                "heading_degrees": 90.0,
                "request_id": 1,
                "accelerometer": {"x": 0, "y": 0, "z": 0},
                "gyroscope": {"x": 0, "y": 0, "z": 0}
            }"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should return 400 when image_base64 is invalid`() {
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            body = """{
                "session_id": "session123",
                "image_base64": "not_base64!!!",
                "focal_length_pixels": 800.0,
                "heading_degrees": 90.0,
                "request_id": 1,
                "accelerometer": {"x": 0.0, "y": 1.0, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0}
            }"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should return 400 when request_id is not an integer`() {
        val validBase64 = Base64.getEncoder().encodeToString("dummy_image".toByteArray())
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            body = """{
                "session_id": "session123",
                "image_base64": "$validBase64",
                "focal_length_pixels": 800.0,
                "heading_degrees": 90.0,
                "request_id": 1.5,
                "accelerometer": {"x": 0.0, "y": 1.0, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0}
            }"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest should process valid payload and return 200`() {
        val validBase64 = Base64.getEncoder().encodeToString("dummy_image".toByteArray())
        val event = APIGatewayV2WebSocketEvent().apply {
            requestContext = RequestContext().apply {
                connectionId = "test-conn-id"
                domainName = "test.api"
                stage = "prod"
                routeKey = "navigation"
            }
            body = """{
                "session_id": "session123",
                "image_base64": "$validBase64",
                "focal_length_pixels": 800.0,
                "heading_degrees": 90.0,
                "request_id": 1,
                "accelerometer": {"x": 0.0, "y": 1.5, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gps": {"latitude": 40.0, "longitude": -86.0},
                "timestamp_ms": 1670000000000
            }"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(200, response.statusCode)
        assertEquals("OK", response.body)
    }
}