import pytest
from websocket import create_connection
import json
import base64
import os
from pathlib import Path

# # CONFIGURATION
SCRIPT_DIR = Path(__file__).parent.absolute()
# This builds the path: .../backend/tests/integration/test.jpg
IMAGE_PATH = SCRIPT_DIR / "test.jpg"

@pytest.fixture
def api_base_url():
    """Get the API base URL from environment variable."""
    url = os.getenv("WS_API_URL") + "/prod"
    if not url:
        pytest.skip("WS_API_URL environment variable not set")
    # Remove trailing slash if present
    return url.rstrip("/")

def test_dataflow(api_base_url):
    """
    Integration test that validates:
    1. Invalid payloads are rejected.
    2. Valid JPEG payloads are accepted.
    """
    
    # 1. CONNECT (Synchronous)
    print(f"\n🔌 Connecting to {api_base_url}...")
    ws = create_connection(api_base_url)
    
    try:
        # --- TEST CASE 1: SEND GARBAGE DATA ---
        print("🚀 [Step 1] Sending Invalid Data...")
        payload_fake = {
            "action": "frame",
            "body": "simulated_base64_image_data_xyz_INVALID"
        }
        ws.send(json.dumps(payload_fake))
        
        # Wait for response (Blocking)
        response_1 = ws.recv()
        print(f"📩 Received: {response_1}")
        
        # Assertions
        assert "false" in response_1.lower() or "error" in response_1.lower(), \
            f"Expected error response for bad data, got: {response_1}"


        # --- TEST CASE 2: SEND REAL JPEG ---
        print("🚀 [Step 2] Sending Valid JPEG...")
        if not os.path.exists(IMAGE_PATH):
            pytest.fail(f"Test image not found at {IMAGE_PATH}")

        with open(IMAGE_PATH, "rb") as image_file:
            base64_string = base64.b64encode(image_file.read()).decode('utf-8')

        payload_real = {
            "action": "frame",
            "body": base64_string
        }
        ws.send(json.dumps(payload_real))
        
        # Wait for response (Blocking)
        response_2 = ws.recv()
        print(f"📩 Received: {response_2}")

        # Assertions
        assert "true" in response_2.lower() or "valid" in response_2.lower(), \
            f"Expected success for valid JPEG, got: {response_2}"

    finally:
        # Always close connection, even if test fails
        ws.close()
        print("🔌 Connection Closed")