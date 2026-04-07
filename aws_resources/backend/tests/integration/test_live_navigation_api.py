import pytest
from websocket import create_connection
import json
import os
import base64
import math
import time
import requests
from dotenv import load_dotenv

load_dotenv()

@pytest.fixture
def ws_api_url():
    """Get the WS API base URL from environment variable."""
    ws_base = os.getenv("WS_API_URL")
    if not ws_base:
        pytest.skip("WS_API_URL environment variable not set")

    ws_base = ws_base.rstrip("/")
    if ws_base.endswith("/prod"):
        return ws_base
    return f"{ws_base}/prod"

@pytest.fixture
def rest_api_url():
    """Get the REST API base URL from environment variable."""
    rest_base = os.getenv("API_BASE_URL")
    if not rest_base:
        pytest.skip("API_BASE_URL environment variable not set")
        
    rest_base = rest_base.rstrip("/")
    if rest_base.endswith("/prod"):
        return rest_base
    return f"{rest_base}/prod"

@pytest.fixture
def ws_endpoint_healthy(ws_api_url):
    """Quickly probe WS endpoint and skip tests if unavailable."""
    try:
        ws = create_connection(ws_api_url, timeout=8)
        ws.close()
    except Exception as exc:
        pytest.skip(f"WebSocket endpoint unavailable: {exc}")

@pytest.fixture
def dummy_base64_image():
    """Returns a minimal valid base64 string for validation bypass."""
    return base64.b64encode(b"dummy image data").decode("utf-8")

def create_valid_payload(session_id, request_id, accel_y, heading, img_b64, timestamp_ms):
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
        "timestamp_ms": timestamp_ms
    }

def test_live_navigation_missing_fields(ws_api_url, ws_endpoint_healthy, dummy_base64_image):
    """Test validation failures for missing required fields."""
    ws = create_connection(ws_api_url)
    try:
        # Missing focal_length_pixels
        payload = {
            "action": "navigation",
            "session_id": "test_sess_1",
            "request_id": 1,
            "image_base64": dummy_base64_image,
            "heading_degrees": 90.0,
            "accelerometer": {"x": 0, "y": 0, "z": 0},
            "gyroscope": {"x": 0, "y": 0, "z": 0},
            "timestamp_ms": int(time.time() * 1000)
        }
        ws.send(json.dumps(payload))
        response = json.loads(ws.recv())

        # If this hit $default → ObjectDetectionHandler, routing is broken (missing route or wrong API).
        err = response.get("error", "")
        if response.get("status") == "error" and "$default" in err:
            pytest.fail(
                "WebSocket message was handled on the $default route (ObjectDetectionHandler), not "
                "'navigation'. Redeploy the stack so API Gateway defines a 'navigation' route and "
                "RouteSelectionExpression is $request.body.action. "
                f"Full response: {response}"
            )

        assert response.get("type") == "navigation_error", (
            f"Expected navigation_error from LiveNavigationHandler, got: {response}"
        )
        assert "focal_length_pixels" in response.get("error", "")
        print(f"✅ Missing field correctly rejected: {response}")
    finally:
        ws.close()

def create_valid_payload(session_id, request_id, distance_traveled, heading, img_b64, timestamp_ms):
    """Helper to create a valid payload for LiveNavigationHandler."""
    return {
        "action": "navigation",
        "session_id": session_id,
        "request_id": request_id,
        "image_base64": img_b64,
        "focal_length_pixels": 800.0,
        "heading_degrees": heading,
        "distance_traveled": distance_traveled,
        "accelerometer": {"x": 0.0, "y": 0.0, "z": 0.0},
        "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
        "timestamp_ms": timestamp_ms
    }

def test_live_navigation_stationary(ws_api_url, rest_api_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that if distance_traveled is 0.0, location does not change and progress is calculated."""
    try:
        start_resp = requests.post(f"{rest_api_url}/navigation/start", json={
            "start_location": {"node_id": "staircase_main_2S01"},
            "destination": {"landmark_id": "10001"}
        }, timeout=10)
        start_resp.raise_for_status()
    except Exception as e:
        pytest.skip(f"Could not initialize navigation session via REST API. Error: {e}")

    session_id = start_resp.json().get("session_id")
    ws = create_connection(ws_api_url)
    try:
        client_time_ms = int(time.time() * 1000)
        # Pass 0.0 for distance
        payload = create_valid_payload(session_id, 1, distance_traveled=0.0, heading=0.0, img_b64=dummy_base64_image, timestamp_ms=client_time_ms)
        ws.send(json.dumps(payload))
        response = json.loads(ws.recv())

        estimated_pos = response.get("estimated_position", {})
        estimated_x = estimated_pos.get("coordinates", {}).get("x_feet", -1.0)
        estimated_y = estimated_pos.get("coordinates", {}).get("y_feet", -1.0)
        
        assert response.get("type") == "navigation_update"
        assert "progress" in response, "Response must include distance to next node (progress)"
        assert estimated_x == 0.0, "Stationary X should remain 0.0"
        assert estimated_y == 0.0, "Stationary Y should remain 0.0"
        print("✅ Stationary PDR correctly calculated as 0 movement and progress returned.")
    finally:
        ws.close()

def test_live_navigation_moving_and_state_persistence(ws_api_url, rest_api_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that pedometer distance updates coordinates along the snapped map axes."""
    start_payload = {
        "start_location": {"node_id": "staircase_main_2S01"},
        "destination": {"landmark_id": "10001"}
    }
    
    try:
        start_resp = requests.post(f"{rest_api_url}/navigation/start", json=start_payload, timeout=10)
        start_resp.raise_for_status()
    except Exception as e:
        pytest.skip(f"Could not initialize session. Error: {e}")

    session_id = start_resp.json().get("session_id")
    ws = create_connection(ws_api_url)
    try:
        # --- FRAME 1: Moving (Distance = 10 ft, Raw Heading = 39 deg) ---
        # 39 deg will snap to 51 deg (0 * 90 + 51)
        client_time_ms = int(time.time() * 1000)
        payload1 = create_valid_payload(session_id, 1, distance_traveled=10.0, heading=39.0, img_b64=dummy_base64_image, timestamp_ms=client_time_ms)
        
        ws.send(json.dumps(payload1))
        response1 = json.loads(ws.recv())
        
        est_pos1 = response1.get("estimated_position", {})
        estimated_x1 = est_pos1.get("coordinates", {}).get("x_feet", 0.0)
        estimated_y1 = est_pos1.get("coordinates", {}).get("y_feet", 0.0)
        instructions1 = response1.get("remaining_instructions", [])

        assert response1.get("type") == "navigation_update"
        assert "progress" in response1, "Response must include progress field"
        
        # New behavior: the instruction list should always be populated even if no major recalculation occurred
        assert len(instructions1) > 0, "Instructions list should be returned unchanged if staying on path"
        
        # Verify X and Y moved mathematically according to snapped offset (sin(51) and cos(51))
        assert estimated_x1 > 0.0, "X should have increased"
        assert estimated_y1 > 0.0, "Y should have increased"
        print(f"✅ Frame 1 (Moving): estimated_x={estimated_x1}ft, estimated_y={estimated_y1}ft")

        # --- FRAME 2: Moving backwards ---
        client_time_ms2 = int(time.time() * 1000)
        payload2 = create_valid_payload(session_id, 2, distance_traveled=5.0, heading=219.0, img_b64=dummy_base64_image, timestamp_ms=client_time_ms2)
        
        ws.send(json.dumps(payload2))
        response2 = json.loads(ws.recv())
        
        est_pos2 = response2.get("estimated_position", {})
        estimated_x2 = est_pos2.get("coordinates", {}).get("x_feet", 0.0)
        estimated_y2 = est_pos2.get("coordinates", {}).get("y_feet", 0.0)

        # Validate state persistence (subtracting distance)
        assert estimated_x2 < estimated_x1, f"Expected X to decrease, got {estimated_x2}"
        assert estimated_y2 < estimated_y1, f"Expected Y to decrease, got {estimated_y2}"
        
        print("✅ Session persistence successfully restored cross-lambda state with updated pedometer math.")
        
    finally:
        ws.close()

def test_live_navigation_path_recalculation(ws_api_url, rest_api_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that moving off the known path triggers a recalculation yielding new instructions."""
    
    # Start the Session using the Static Navigation Handler (REST API)
    try:
        # Start at node staircase_main_2S01, dest landmark 1.
        start_resp = requests.post(f"{rest_api_url}/navigation/start", json={
            "start_location": {"node_id": "staircase_main_2S01"},
            "destination": {"landmark_id": "10001"} 
        }, timeout=10)
        start_resp.raise_for_status()
    except Exception as e:
        pytest.skip(f"Could not initialize navigation session via REST API. Error: {e}")

    session_id = start_resp.json().get("session_id")
    assert session_id is not None
    
    ws = create_connection(ws_api_url)
    try:
        time.sleep(5.0)
        client_time_ms = int(time.time() * 1000)
        
        # Send a frame moving the user heavily South (heading 180) to force them off the path
        payload = create_valid_payload(
            session_id, 
            request_id=1, 
            distance_traveled=20, 
            heading=120.0, 
            img_b64=dummy_base64_image, 
            timestamp_ms=client_time_ms
        )
        
        ws.send(json.dumps(payload))
        response = json.loads(ws.recv())
        print(f"Received response after moving off-path: {response}")
        
        assert response.get("type") == "navigation_update"
        
        est_pos = response.get("estimated_position", {})
        node_id = est_pos.get("node_id")
        
        if node_id == "unknown":
             pytest.skip("Test database not seeded. Nearest node returned 'unknown'.")

        # Verify the user actually moved to a different node
        assert node_id != "staircase_main_2S01", f"Failed to move off initial node. Closest node is still {node_id}"
        
        # Verify that new instructions are returned after recalculation
        instructions = response.get("remaining_instructions", [])
        assert len(instructions) > 0, "Expected path recalculation to return new instruction steps"
        print(f"✅ Path recalculation correctly triggered off-path. Node: {node_id}, New Instructions Count: {len(instructions)}")
        
    finally:
        ws.close()