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

def test_live_navigation_stationary(ws_api_url, rest_api_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that if y-acceleration < 1.2 (heuristic threshold), location does not change."""
    # 1. Start the Session using the Static Navigation Handler (REST API)
    try:
        start_resp = requests.post(f"{rest_api_url}/navigation/start", json={
            "start_location": {"node_id": "staircase_main_2S01"},
            "destination": {"landmark_id": "1"}
        }, timeout=10)
        start_resp.raise_for_status()
    except Exception as e:
        pytest.skip(f"Could not initialize navigation session via REST API. Error: {e}")

    session_id = start_resp.json().get("session_id")
    assert session_id is not None
    
    ws = create_connection(ws_api_url)
    try:
        client_time_ms = int(time.time() * 1000)
        payload = create_valid_payload(session_id, 1, accel_y=1.0, heading=0.0, img_b64=dummy_base64_image, timestamp_ms=client_time_ms)
        ws.send(json.dumps(payload))
        response = json.loads(ws.recv())

        estimated_pos = response.get("estimated_position", {})
        estimated_x = estimated_pos.get("coordinates", {}).get("x_feet", -1.0)
        estimated_y = estimated_pos.get("coordinates", {}).get("y_feet", -1.0)
        node_id = estimated_pos.get("node_id")
        
        assert response.get("type") == "navigation_update"
        assert estimated_x == 0.0, "Stationary X should remain 0.0"
        assert estimated_y == 0.0, "Stationary Y should remain 0.0"
        
        if node_id == "unknown":
            pytest.skip("Test database not seeded. Nearest node returned 'unknown'.")
            
        assert node_id == "staircase_main_2S01", f"Expected nearest node ID 'staircase_main_2S01', got {node_id}"
        print("✅ Stationary PDR correctly calculated as 0 movement and snapped to correct node")
    finally:
        ws.close()

def test_live_navigation_moving_and_state_persistence(ws_api_url, rest_api_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that session is created via REST and PDR math updates > 5 feet based on time elapsed."""
    
    # 1. Start the Session using the Static Navigation Handler (REST API)
    # Using start node 1 and destination landmark 1 (assumed present from populate_floor_data.py)
    start_payload = {
        "start_location": {"node_id": "staircase_main_2S01"},
        "destination": {"landmark_id": "1"}
    }
    
    try:
        start_resp = requests.post(f"{rest_api_url}/navigation/start", json=start_payload, timeout=10)
        start_resp.raise_for_status()
    except Exception as e:
        pytest.skip(f"Could not initialize navigation session via REST API. Check DB seeding. Error: {e}")

    session_id = start_resp.json().get("session_id")
    assert session_id is not None, "Did not receive a session_id from /navigation/start"
    
    # 2. Emulate walking by delaying 1.5 seconds.
    time.sleep(1.5)
    
    ws = create_connection(ws_api_url)
    try:
        # --- FRAME 1: Heading 90 (East), Moving, Real Client Time ---
        client_time_ms = int(time.time() * 1000)
        payload1 = create_valid_payload(session_id, 1, accel_y=1.5, heading=90.0, img_b64=dummy_base64_image, timestamp_ms=client_time_ms)
        
        ws.send(json.dumps(payload1))
        response1 = json.loads(ws.recv())
        print(f"Received response for Frame 1: {response1}")
        
        est_pos1 = response1.get("estimated_position", {})
        estimated_x1 = est_pos1.get("coordinates", {}).get("x_feet", 0.0)
        estimated_y1 = est_pos1.get("coordinates", {}).get("y_feet", 0.0)
        node_id1 = est_pos1.get("node_id")
        instructions1 = response1.get("remaining_instructions", [])

        assert response1.get("type") == "navigation_update"
        assert len(instructions1) == 0, "Closest node should be on path so no new instructions should be recieved"
        
        # Verify X moved at least 5 feet in 1.5+ seconds
        assert estimated_x1 > 5.0, f"Expected X to move > 5 feet, got {estimated_x1}"
        assert math.isclose(estimated_y1, 0.0, abs_tol=0.1)
        
        if node_id1 == "unknown":
            pytest.skip("Test database not seeded. Nearest node returned 'unknown'.")
            
        # At X=6.88 feet, Y=0 feet, the closest node is still Node 1 at (0,0) (node 31 is at 27ft)
        assert node_id1 == "staircase_main_2S01", f"Expected nearest node ID 'staircase_main_2S01' near x={estimated_x1}ft, y={estimated_y1}ft, got {node_id1}"
        print(f"✅ Frame 1 (Moving East): estimated_x={estimated_x1}ft, estimated_y={estimated_y1}ft, node={node_id1}")

        # FRAME 2: Heading 270 (West), Moving 
        time.sleep(5)
        client_time_ms2 = int(time.time() * 1000)
        payload2 = create_valid_payload(session_id, 2, accel_y=1.5, heading=270.0, img_b64=dummy_base64_image, timestamp_ms=client_time_ms2)
        
        ws.send(json.dumps(payload2))
        response2 = json.loads(ws.recv())
        print(f"Received response for Frame 2: {response2}")
        
        assert response2.get("type") == "navigation_update"

        est_pos2 = response2.get("estimated_position", {})
        estimated_x2 = est_pos2.get("coordinates", {}).get("x_feet", 0.0)
        estimated_y2 = est_pos2.get("coordinates", {}).get("y_feet", 0.0)
        node_id2 = est_pos2.get("node_id")
        instructions2 = response2.get("remaining_instructions", [])

        # Validate state persistence
        assert estimated_x2 < estimated_x1, f"Expected X to decrease, got {estimated_x2}"
        assert math.isclose(estimated_y2, 0.0, abs_tol=0.1)
        assert len(instructions2) == 0, "Closest node should be on path so no new instructions should be recieved"
        
        # At X=~20.6 ft, Y=~8.7 ft, the closest node is node 30 at (206.43444566227677, 87.49999999999996).
        assert node_id2 == "stair_west_corner", f"Expected nearest node ID 'stair_west_corner' near x={estimated_x2}ft, y={estimated_y2}ft, got {node_id2}"
        
        print(f"✅ Frame 2 (Moving South): estimated_x={estimated_x2}ft, estimated_y={estimated_y2}ft, node={node_id2}")
        print("✅ Session persistence successfully restored cross-lambda state initialized by the static API.")
        
    finally:
        ws.close()


def test_live_navigation_path_recalculation(ws_api_url, rest_api_url, ws_endpoint_healthy, dummy_base64_image):
    """Test that moving off the known path triggers a recalculation yielding new instructions."""
    
    # Start the Session using the Static Navigation Handler (REST API)
    try:
        # Start at node staircase_main_2S01, dest landmark 1.
        start_resp = requests.post(f"{rest_api_url}/navigation/start", json={
            "start_location": {"node_id": "staircase_main_2S01"},
            "destination": {"landmark_id": "1"} 
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
            accel_y=1.5, 
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