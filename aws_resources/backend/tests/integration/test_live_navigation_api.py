import pytest
from websocket import create_connection
import json
import os
import base64
import uuid
import math
from dotenv import load_dotenv

load_dotenv()

@pytest.fixture
def api_base_url():
    """Get the WS API base URL from environment variable."""
    ws_base = os.getenv("WS_API_URL")
    if not ws_base:
        pytest.skip("WS_API_URL environment variable not set")

    ws_base = ws_base.rstrip("/")
    if ws_base.endswith("/prod"):
        return ws_base
    return f"{ws_base}/prod"

@pytest.fixture
def ws_endpoint_healthy(api_base_url):
    """Quickly probe WS endpoint and skip tests if unavailable."""
    try:
        ws = create_connection(api_base_url, timeout=8)
        ws.close()
    except Exception as exc:
        pytest.skip(f"WebSocket endpoint unavailable: {exc}")

@pytest.fixture
def dummy_base64_image():
    """Returns a minimal valid base64 string for validation bypass."""
    return base64.b64encode(b"dummy image data").decode("utf-8")

def create_valid_payload(session_id, request_id, accel_y, heading, img_b64):
    """Helper to create a valid payload for LiveNavigationHandler."""
    # API Gateway routes WebSocket requests using the 'action' key by default
    return {
        "action": "navigation",
        "session_id": session_id,
        "request_id": request_id,
        "image_base64": img_b64,
        "focal_length_pixels": 800.0,
        "heading_degrees": heading,
        "accelerometer": {"x": 0.0, "y": accel_y, "z": 0.0},
        "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
        "timestamp_ms": 1670000000000
    }

def test_live_navigation_missing_fields(api_base_url, ws_endpoint_healthy, dummy_base64_image):
    """Test validation failures for missing required fields."""
    ws = create_connection(api_base_url)
    try:
        # Missing focal_length_pixels
        payload = {
            "action": "navigation",
            "session_id": "test_sess_1",
            "request_id": 1,
            "image_base64": dummy_base64_image,
            "heading_degrees": 90.0,
            "accelerometer": {"x": 0, "y": 0, "z": 0},
            "gyroscope": {"x": 0, "y": 0, "z": 0}
        }
        ws.send(json.dumps(payload))
        response = json.loads(ws.recv())
        
        assert response.get("type") == "navigation_error"
        assert "focal_length_pixels" in response.get("error", "")
        print(f"✅ Missing field correctly rejected: {response}")
    finally:
        ws.close()

def test_live_navigation_stationary(api_base_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that if y-acceleration < 1.2 (heuristic threshold), location does not change."""
    ws = create_connection(api_base_url)
    # Use UUID to guarantee we do not hit existing session data in DynamoDB
    session_id = str(uuid.uuid4())
    
    try:
        payload = create_valid_payload(session_id, 1, accel_y=1.0, heading=0.0, img_b64=dummy_base64_image)
        ws.send(json.dumps(payload))
        response = json.loads(ws.recv())
        print(f"Received response for stationary test: {response}")

        estimated_x = response.get("estimated_position", {}).get("coordinates", {}).get("x_feet")
        estimated_y = response.get("estimated_position", {}).get("coordinates", {}).get("y_feet")
        
        assert response.get("type") == "navigation_update"
        assert estimated_x == 0.0, "Stationary X should remain 0.0"
        assert estimated_y == 0.0, "Stationary Y should remain 0.0"
        assert response.get("request_id") == 1
        print("✅ Stationary PDR correctly calculated as 0 movement")
    finally:
        ws.close()

def test_live_navigation_moving_and_state_persistence(api_base_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that PDR math updates location correctly and state is preserved across frames."""
    ws = create_connection(api_base_url)
    session_id = str(uuid.uuid4())
    
    # Expected Step Size based on PDR logic in LiveNavigationHandler.kt:
    # stepSizeMeters = 0.762
    # stepSizePixels = 0.762 * 3.28084 * 10 ≈ 24.9999
    expected_step = 0.762 * 3.28084 * 10
    
    try:
        # --- FRAME 1: Heading 90 (East), yAccel 1.5 (Moving) ---
        # Math: sin(90)=1, cos(90)=0 -> x += step, y -= 0
        payload1 = create_valid_payload(session_id, 1, accel_y=1.5, heading=90.0, img_b64=dummy_base64_image)
        ws.send(json.dumps(payload1))
        response1 = json.loads(ws.recv())
        print(f"Received response for Frame 1: {response1}")
        estimated_x1 = response1.get("estimated_position", {}).get("coordinates", {}).get("x_feet")
        estimated_y1 = response1.get("estimated_position", {}).get("coordinates", {}).get("y_feet")
        
        assert response1.get("type") == "navigation_update"
        # math.isclose handles minor floating-point errors
        assert math.isclose(estimated_x1, expected_step, abs_tol=0.1)
        assert math.isclose(estimated_y1, 0.0, abs_tol=0.1)
        print(f"✅ Frame 1 (Moving East): estimated_x={estimated_x1}, estimated_y={estimated_y1}")

        # --- FRAME 2: Heading 180 (South), yAccel 1.5 (Moving) ---
        # Math: sin(180)=0, cos(180)=-1 -> x += 0, y -= step * (-1) -> y += step
        payload2 = create_valid_payload(session_id, 2, accel_y=1.5, heading=180.0, img_b64=dummy_base64_image)
        ws.send(json.dumps(payload2))
        response2 = json.loads(ws.recv())
        print(f"Received response for Frame 2: {response2}")
        
        assert response2.get("type") == "navigation_update"

        estimated_x2 = response2.get("estimated_position", {}).get("coordinates", {}).get("x_feet")
        estimated_y2 = response2.get("estimated_position", {}).get("coordinates", {}).get("y_feet")
        
        # Validate state persistence: X should stay exactly what it was from Frame 1
        assert math.isclose(estimated_x2, expected_step, abs_tol=0.1)
        
        # Y should now have updated based on heading
        assert math.isclose(estimated_y2, expected_step, abs_tol=0.1)
        print(f"✅ Frame 2 (Moving South): estimated_x={estimated_x2}, estimated_y={estimated_y2}")
        print("✅ Session persistence from DynamoDB successfully restored state.")
        
    finally:
        ws.close()