package com.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.LambdaLogger
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.models.BoundingBox
import com.models.LandmarkDetails
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
    private val mockObjectDetectionHandler = mockk<ObjectDetectionHandler>()

    private lateinit var handler: LiveNavigationHandler

    @BeforeEach
    fun setup() {
        every { mockContext.logger } returns mockLogger

        mockkConstructor(DynamoDbTableClient::class)
        every { anyConstructed<DynamoDbTableClient>().getItemDetails(any()) } returns mapOf(
            "current_x" to "0.0",
            "current_y" to "0.0",
            "last_updated_ms" to "1670000000000",
            "destLandmarkId" to "1",
            "currentStep" to "0",
            "path" to "node1,node2",
        )
        every { anyConstructed<DynamoDbTableClient>().putItem(any()) } just Runs

        mockkConstructor(RdsMapClient::class)
        val mockConn = mockk<java.sql.Connection>(relaxed = true)
        every { anyConstructed<RdsMapClient>().getDbConnection() } returns mockConn
        every { anyConstructed<RdsMapClient>().getClosestMapNode(any(), any(), any()) } returns mapOf(
            "NodeID" to "node1",
            "BuildingID" to "B1",
        )
        val mockLandmark = mockk<LandmarkDetails>(relaxed = true)
        every { mockLandmark.nearestNodeId } returns "node2"
        every { anyConstructed<RdsMapClient>().getLandmark(any(), any()) } returns mockLandmark
        every { anyConstructed<RdsMapClient>().getNode(any(), any()) } returns null
        every { anyConstructed<RdsMapClient>().buildInstructions(any(), any(), any()) } returns emptyList()

        every {
            mockObjectDetectionHandler.detectObjectsFromImage(any(), any(), any())
        } returns listOf(
            DetectedObject(
                obj = BoundingBox(0, 0, 10, 10, "door", 0.9f),
                distanceMeters = 30.0, // ignored because > 15ft threshold
            ),
        )

        handler = LiveNavigationHandler(mockObjectDetectionHandler)
    }

    @AfterEach
    fun teardown() {
        unmockkAll()
    }

    private fun multipartRequest(metadataJson: String, imageBytes: ByteArray): APIGatewayProxyRequestEvent {
        val boundary = "stride-test-boundary"
        val body = buildString {
            append("--$boundary\r\n")
            append("Content-Disposition: form-data; name=\"metadata\"\r\n")
            append("Content-Type: application/json\r\n\r\n")
            append(metadataJson)
            append("\r\n")
            append("--$boundary\r\n")
            append("Content-Disposition: form-data; name=\"image\"; filename=\"frame.jpg\"\r\n")
            append("Content-Type: image/jpeg\r\n\r\n")
            append(String(imageBytes, Charsets.ISO_8859_1))
            append("\r\n")
            append("--$boundary--\r\n")
        }
        return APIGatewayProxyRequestEvent()
            .withIsBase64Encoded(true)
            .withBody(Base64.getEncoder().encodeToString(body.toByteArray(Charsets.ISO_8859_1)))
            .withHeaders(mapOf("Content-Type" to "multipart/form-data; boundary=$boundary"))
    }

    @Test
    fun `handleRequest returns 400 when content type is missing`() {
        val response = handler.handleRequest(APIGatewayProxyRequestEvent(), mockContext)
        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest returns 400 when metadata is invalid json`() {
        val event = multipartRequest("{bad-json", "img".toByteArray())
        val response = handler.handleRequest(event, mockContext)
        assertEquals(400, response.statusCode)
    }

    @Test
    fun `handleRequest processes valid multipart request`() {
        val metadata = """
            {
              "session_id": "session123",
              "focal_length_pixels": 800.0,
              "heading_degrees": 90.0,
              "distance_traveled": 2.0,
              "request_id": 1,
              "timestamp_ms": 1670000000000,
              "gps": {"latitude": 40.0, "longitude": -86.0}
            }
        """.trimIndent()
        val event = multipartRequest(metadata, "dummy_image".toByteArray())
        val response = handler.handleRequest(event, mockContext)

        assertEquals(200, response.statusCode)
        verify { mockObjectDetectionHandler.detectObjectsFromImage(any(), mockLogger, 800.0) }
    }
}
