package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayV2WebSocketEvent.RequestContext
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.models.LandmarkDetails
import com.models.BoundingBox
import com.models.MapNode
import com.models.NavigationCoordinates
import com.services.DynamoDbTableClient
import com.services.RdsMapClient
import io.mockk.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClientBuilder
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest
import java.util.Base64
import com.models.NavigationInstruction
import com.models.NavigationStepType

class LiveNavigationHandlerTest {

    private val mockContext = mockk<Context>()
    private val mockLogger = mockk<LambdaLogger>(relaxed = true)
    private val mockObjectDetectionHandler = mockk<ObjectDetectionHandler>()
    private val mapper = jacksonObjectMapper()
    private val mockApiGateway = mockk<ApiGatewayManagementApiClient>(relaxed = true)
    
    private lateinit var handler: LiveNavigationHandler

    @BeforeEach
    fun setup() {
        every { mockContext.logger } returns mockLogger

        // Mock API Gateway websocket client creation so tests can inspect outbound payloads.
        mockkStatic(ApiGatewayManagementApiClient::class)
        val mockApiBuilder = mockk<ApiGatewayManagementApiClientBuilder>(relaxed = true)
        every { ApiGatewayManagementApiClient.builder() } returns mockApiBuilder
        every { mockApiBuilder.region(any()) } returns mockApiBuilder
        every { mockApiBuilder.endpointOverride(any()) } returns mockApiBuilder
        every { mockApiBuilder.credentialsProvider(any()) } returns mockApiBuilder
        every { mockApiBuilder.httpClient(any()) } returns mockApiBuilder
        every { mockApiBuilder.build() } returns mockApiGateway
        
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
        every { anyConstructed<RdsMapClient>().getEdgeDistanceFeet(any(), any(), any()) } returns null

        every {
            mockObjectDetectionHandler.detectObjectsFromImage(any(), any(), any())
        } returns emptyList()

        handler = LiveNavigationHandler(mockObjectDetectionHandler)
    }

    @AfterEach
    fun teardown() {
        unmockkAll() // Clean up mocks after every test to prevent cross-contamination
    }

    private fun assertStrictInstructionSchema(instruction: Map<String, Any?>) {
        val expectedInstructionKeys = setOf(
            "step",
            "step_type",
            "distance_feet",
            "direction",
            "start_node_id",
            "end_node_id",
            "node_id",
            "coordinates",
            "heading_degrees",
            "turn_intent"
        )
        assertEquals(expectedInstructionKeys, instruction.keys)

        val coordinates = instruction["coordinates"] as? Map<*, *>
        assertNotNull(coordinates, "instructions[].coordinates must be present")
        assertEquals(setOf("x", "y"), coordinates!!.keys.map { it.toString() }.toSet())

        // Strict contract must not emit legacy coordinate aliases.
        assertFalse(instruction.containsKey("x"))
        assertFalse(instruction.containsKey("y"))
        assertFalse(instruction.containsKey("coordinate_x"))
        assertFalse(instruction.containsKey("coordinate_y"))
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
         * Distance is 10 ft -> 10 coordinate units (stored coords are feet).
         * CV Estimate X: 100 - (10 * sin(0)) = 100
         * CV Estimate Y: 0 + (10 * cos(0)) = 10
         * Alpha calc: maxAlpha(0.9) * (1 - (10ft / 15ft)) = 0.9 * 0.3333 = 0.30
         * Fused X: (0.3 * 100) + (0.7 * 120) = 30 + 84 = 114.0
         * Fused Y: (0.3 * 10) + (0.7 * 120) = 3 + 84 = 87.0
         */
        val result = invokeFuseLocationWithLandmarks(120.0, 120.0, 0.0, listOf(detectedObj), mockLogger)
        
        // Asserting with a delta to handle floating point imprecision
        assertEquals(114.0, result.first, 0.01)
        assertEquals(87.0, result.second, 0.01)
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
                "distance_traveled": 2.5
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
                "distance_traveled": 2.5
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
                "distance_traveled": 2.5,
                "request_id": 1,
                "accelerometer": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gps": {"latitude": 40.0, "longitude": -86.0},
                "timestamp_ms": 1670000000000
            }"""
        }

        val response = handler.handleRequest(event, mockContext)

        assertEquals(200, response.statusCode)
        assertEquals("OK", response.body)
        verify {
            mockObjectDetectionHandler.detectObjectsFromImage(validBase64, mockLogger, 800.0)
        }
    }

    @Test
    fun `handleRequest should return remaining instructions when closest node is on the original path`() {
        // 1. Setup mock session data with an existing path
        val mockSessionData = mapOf(
            "current_x" to "0.0",
            "current_y" to "0.0",
            "last_updated_ms" to "1670000000000",
            "destLandmarkId" to "1",
            "path" to "node1,node2,node3,node4" // Original path
        )
        every { anyConstructed<DynamoDbTableClient>().getItemDetails(any()) } returns mockSessionData

        // 2. Setup the closest node to be "node2". 
        // This means the user has progressed past "node1" and the remaining path should be "node2", "node3", "node4".
        every { anyConstructed<RdsMapClient>().getClosestMapNode(any(), any(), any()) } returns mapOf("NodeID" to "node2")

        val mockLandmark = mockk<LandmarkDetails>(relaxed = true)
        every { anyConstructed<RdsMapClient>().getLandmark(any(), any()) } returns mockLandmark

        // Mock buildInstructions to return a dummy instruction so the handler doesn't fail
        val mockInstruction = mockk<NavigationInstruction>(relaxed = true)
        every { anyConstructed<RdsMapClient>().buildInstructions(any(), any(), any()) } returns listOf(mockInstruction)

        // 3. Construct a valid payload to trigger the handler
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
                "distance_traveled": 1.5,
                "accelerometer": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gps": {"latitude": 40.0, "longitude": -86.0},
                "timestamp_ms": 1670000000000
            }"""
        }

        // 4. Execute the handler
        val response = handler.handleRequest(event, mockContext)

        // Verify it was a successful request
        assertEquals(200, response.statusCode)

        // 5. Verify that buildInstructions was called specifically with the truncated list
        verify {
            anyConstructed<RdsMapClient>().buildInstructions(
                any(),
                listOf("node2", "node3", "node4"), // <--- Expected remaining path
                any()
            )
        }
    }

    @Test
    fun `handleRequest should reset currentStep to 0 when path is recalculated`() {
        // 1. Setup mock session data indicating the user is mid-navigation (Step 5)
        val mockSessionData = mapOf(
            "current_x" to "0.0",
            "current_y" to "0.0",
            "currentStep" to "5", 
            "last_updated_ms" to "1670000000000",
            "destLandmarkId" to "1",
            "path" to "node1,node2,node3" // Original path
        )
        every { anyConstructed<DynamoDbTableClient>().getItemDetails(any()) } returns mockSessionData

        // 2. Force the localized node to be OFF the original path to trigger recalculation
        every { anyConstructed<RdsMapClient>().getClosestMapNode(any(), any(), any()) } returns mapOf("NodeID" to "node99")
        every { anyConstructed<RdsMapClient>().getBuildingIdForNode(any(), any()) } returns "B1"

        val mockLandmark = mockk<LandmarkDetails>(relaxed = true)
        every { mockLandmark.nearestNodeId } returns "destNode"
        every { anyConstructed<RdsMapClient>().getLandmark(any(), any()) } returns mockLandmark

        // Mock the new path being generated
        every { anyConstructed<RdsMapClient>().calculateShortestPath(any(), any(), any(), any()) } returns Pair(listOf("node99", "destNode"), 15.0)
        every { anyConstructed<RdsMapClient>().buildInstructions(any(), any(), any()) } returns emptyList()

        // Capture the map passed to DynamoDB putItem so we can inspect it
        val putItemSlot = slot<Map<String, Any>>()
        every { anyConstructed<DynamoDbTableClient>().putItem(capture(putItemSlot)) } just Runs

        // 3. Construct a valid payload
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
                "distance_traveled": 1.5,
                "accelerometer": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gps": {"latitude": 40.0, "longitude": -86.0},
                "timestamp_ms": 1670000000000
            }"""
        }

        // 4. Execute the handler
        val response = handler.handleRequest(event, mockContext)

        // Verify it was a successful request
        assertEquals(200, response.statusCode)

        // 5. Verify currentStep was correctly reset to 0 in the DynamoDB state
        val savedState = putItemSlot.captured
        assertEquals(0, savedState["currentStep"], "currentStep should be reset to 0 upon path recalculation")
        
        // Ensure the new path was actually saved, confirming recalculation occurred
        assertEquals("node99,destNode", savedState["path"])
    }

    @Test
    fun `handleRequest should use logical current node for session tracking when on path`() {
        // 1. Setup mock session data indicating user is on Step 1 (which corresponds to 'node2')
        val mockSessionData = mapOf(
            "current_x" to "0.0",
            "current_y" to "0.0",
            "currentStep" to "1",
            "last_updated_ms" to "1670000000000",
            "destLandmarkId" to "1",
            "path" to "node1,node2,node3,node4"
        )
        every { anyConstructed<DynamoDbTableClient>().getItemDetails(any()) } returns mockSessionData

        // 2. Mock a scenario where the sensor drifts and detects "node99" as the closest physical node,
        // but not far enough to trigger an off-path recalculation in this specific mock execution.
        every { anyConstructed<RdsMapClient>().getClosestMapNode(any(), any(), any()) } returns mapOf("NodeID" to "node2")
        every { anyConstructed<RdsMapClient>().getNode("node3", any()) } returns MapNode("node3", 500, 500) // Next node is far away (> 2ft)

        val putItemSlot = slot<Map<String, Any>>()
        every { anyConstructed<DynamoDbTableClient>().putItem(capture(putItemSlot)) } just Runs

        // 3. Construct a valid payload with distance_traveled
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
                "distance_traveled": 5.0,
                "request_id": 1,
                "accelerometer": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "timestamp_ms": 1670000000000
            }"""
        }

        // 4. Execute the handler
        val response = handler.handleRequest(event, mockContext)

        assertEquals(200, response.statusCode)

        // 5. Verify the state saved to the DB used the logical path index (node2), NOT a physical drift node
        val savedState = putItemSlot.captured
        assertEquals("node2", savedState["currentNodeId"], "Session should lock to logical node of current step (index 1 = node2)")
    }

    @Test
    fun `handleRequest should emit strict instruction schema on path recalculation`() {
        val mockSessionData = mapOf(
            "current_x" to "0.0",
            "current_y" to "0.0",
            "currentStep" to "3",
            "last_updated_ms" to "1670000000000",
            "destLandmarkId" to "1",
            "path" to "node1,node2,node3"
        )
        every { anyConstructed<DynamoDbTableClient>().getItemDetails(any()) } returns mockSessionData

        every { anyConstructed<RdsMapClient>().getClosestMapNode(any(), any(), any()) } returns mapOf("NodeID" to "node99")
        every { anyConstructed<RdsMapClient>().getBuildingIdForNode(any(), any()) } returns "B1"

        val mockLandmark = mockk<LandmarkDetails>(relaxed = true)
        every { mockLandmark.nearestNodeId } returns "destNode"
        every { anyConstructed<RdsMapClient>().getLandmark(any(), any()) } returns mockLandmark
        every { anyConstructed<RdsMapClient>().calculateShortestPath(any(), any(), any(), any()) } returns Pair(listOf("node99", "destNode"), 15.0)

        val strictInstructions = listOf(
            NavigationInstruction(
                step = 1,
                step_type = NavigationStepType.segment,
                distance_feet = 12.0,
                direction = "Head East",
                start_node_id = "node99",
                end_node_id = "destNode",
                node_id = "node99",
                coordinates = NavigationCoordinates(x = 10.0, y = 20.0),
                heading_degrees = 90.0,
                turn_intent = null
            ),
            NavigationInstruction(
                step = 2,
                step_type = NavigationStepType.arrival,
                distance_feet = 0.0,
                direction = "Arrived, destination on your right",
                start_node_id = "destNode",
                end_node_id = "destNode",
                node_id = "Room 205",
                coordinates = NavigationCoordinates(x = 15.0, y = 20.0),
                heading_degrees = null,
                turn_intent = null
            )
        )
        every { anyConstructed<RdsMapClient>().buildInstructions(any(), any(), any()) } returns strictInstructions

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
                "request_id": 77,
                "accelerometer": {"x": 0.0, "y": 1.5, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "timestamp_ms": 1670000000001
            }"""
        }

        val response = handler.handleRequest(event, mockContext)
        assertEquals(200, response.statusCode)

        val apiSlot = slot<PostToConnectionRequest>()
        verify(exactly = 1) { mockApiGateway.postToConnection(capture(apiSlot)) }
        val resultJson = apiSlot.captured.data().asUtf8String()
        val payload = mapper.readValue<Map<String, Any?>>(resultJson)

        assertEquals("navigation_update", payload["type"])
        assertEquals("session123", payload["session_id"])
        assertEquals(0, (payload["current_step"] as Number).toInt())
        assertFalse(payload.containsKey("instructions"))

        @Suppress("UNCHECKED_CAST")
        val remainingInstructions = payload["remaining_instructions"] as List<Map<String, Any?>>
        assertEquals(strictInstructions.size, remainingInstructions.size)
        remainingInstructions.forEach { assertStrictInstructionSchema(it) }
    }
    @Test
    fun `handleRequest should subtract traversed distance from strict instructions`() {
        val mockSessionData = mapOf(
            "current_x" to "0.0",
            "current_y" to "0.0",
            "currentStep" to "0",
            "last_updated_ms" to "1670000000000",
            "destLandmarkId" to "1",
            "path" to "node1,node2,node3"
        )
        every { anyConstructed<DynamoDbTableClient>().getItemDetails(any()) } returns mockSessionData

        every { anyConstructed<RdsMapClient>().getClosestMapNode(any(), any(), any()) } returns mapOf("NodeID" to "node1")
        every { anyConstructed<RdsMapClient>().getNode("node2", any()) } returns MapNode("node2", 10, 0)
        every { anyConstructed<RdsMapClient>().getEdgeDistanceFeet(any(), "node1", "node2") } returns 30.0

        val mockLandmark = mockk<LandmarkDetails>(relaxed = true)
        every { anyConstructed<RdsMapClient>().getLandmark(any(), any()) } returns mockLandmark

        val strictInstructions = listOf(
            NavigationInstruction(
                step = 1,
                step_type = NavigationStepType.segment,
                distance_feet = 60.0,
                direction = "Head East",
                start_node_id = "node1",
                end_node_id = "node3",
                node_id = "node1",
                coordinates = NavigationCoordinates(x = 10.0, y = 20.0),
                heading_degrees = 90.0,
                turn_intent = "right"
            ),
            NavigationInstruction(
                step = 2,
                step_type = NavigationStepType.arrival,
                distance_feet = 0.0,
                direction = "Arrived, destination on your right",
                start_node_id = "node3",
                end_node_id = "node3",
                node_id = "Room 205",
                coordinates = NavigationCoordinates(x = 15.0, y = 20.0),
                heading_degrees = null,
                turn_intent = null
            )
        )
        every { anyConstructed<RdsMapClient>().buildInstructions(any(), any(), any()) } returns strictInstructions

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
                "distance_traveled": 0.0,
                "request_id": 88,
                "accelerometer": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
                "timestamp_ms": 1670000000001
            }"""
        }

        val response = handler.handleRequest(event, mockContext)
        assertEquals(200, response.statusCode)

        val apiSlot = slot<PostToConnectionRequest>()
        verify(exactly = 1) { mockApiGateway.postToConnection(capture(apiSlot)) }
        val resultJson = apiSlot.captured.data().asUtf8String()
        val payload = mapper.readValue<Map<String, Any?>>(resultJson)

        @Suppress("UNCHECKED_CAST")
        val remainingInstructions = payload["remaining_instructions"] as List<Map<String, Any?>>
        val firstDistance = (remainingInstructions.first()["distance_feet"] as Number).toDouble()
        assertEquals(31.0, firstDistance, 0.001)
    }
}