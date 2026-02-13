import pytest
from websocket import create_connection
import boto3
import json
import base64
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# # CONFIGURATION
SCRIPT_DIR = Path(__file__).parent.absolute()
# This builds the path: .../backend/tests/integration/test.jpg
IMAGE_PATH = SCRIPT_DIR / "resized/IMG_2828.jpg"

@pytest.fixture
def api_base_url():
    """Get the API base URL from environment variable."""
    url = os.getenv("WS_API_URL") + "/prod"
    # url = URL + "/prod"
    if not url:
        pytest.skip("WS_API_URL environment variable not set")
    # Remove trailing slash if present
    return url.rstrip("/")

@pytest.fixture
def ddb_feature_flag_table():
    """Fixture to access the DynamoDB table for feature flags."""
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    table_name = os.getenv("FEATURE_FLAG_TABLE_NAME", "FeatureFlags")
    return ddb.Table(table_name)

def set_sagemaker_flag(table, enabled: bool):
    """Helper to update the feature flag in DynamoDB."""
    table.put_item(Item={
        'feature_name': 'enable_sagemaker_inference',
        'value': enabled
    })

def test_inference_enabled(api_base_url, ddb_feature_flag_table):
    set_sagemaker_flag(ddb_feature_flag_table, True)
    
    ws = create_connection(api_base_url)
    try:
        with open(IMAGE_PATH, "rb") as f:
            img_str = base64.b64encode(f.read()).decode('utf-8')
        
        ws.send(json.dumps({"action": "frame", "body": img_str}))
        response = json.loads(ws.recv())
        
        assert response.get("valid") is True
        # When enabled, we expect the list to potentially contain detections
        assert "estimatedDistances" in response
        print(f"Inference Enabled Response: {response}")
    finally:
        ws.close()

def test_inference_disabled(api_base_url, ddb_feature_flag_table):
    set_sagemaker_flag(ddb_feature_flag_table, False)

    ws = create_connection(api_base_url)
    try:
        with open(IMAGE_PATH, "rb") as f:
            img_str = base64.b64encode(f.read()).decode('utf-8')
        
        ws.send(json.dumps({"action": "frame", "body": img_str}))
        response = json.loads(ws.recv())
        
        assert response.get("valid") is True
        assert len(response.get("estimatedDistances", [])) == 0
        print(f"Inference Disabled Response: {response}")
    finally:
        ws.close()


def test_dataflow(api_base_url):
    """
    Integration test that validates:
    1. Invalid payloads are rejected with error status.
    2. Valid JPEG payloads return inference results.
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
        
        # Parse JSON response
        try:
            result_1 = json.loads(response_1)
            assert result_1.get("valid") == False, \
                f"Expected error status for bad data, got: {result_1.get('valid')}"
            print("✅ Invalid data correctly rejected")
        except json.JSONDecodeError:
            # Fallback for old response format
            assert "error" in response_1.lower(), \
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

        # Parse JSON response (new format with SageMaker inference)
        try:
            result_2 = json.loads(response_2)
            assert result_2.get("valid") == True, \
                f"Expected success status for valid JPEG, got: {result_2.get('valid')}"
            
            # Validate structure
            assert "estimatedDistances" in result_2, "Response missing 'estimatedDistances' field"
            
            detection_count = len(result_2.get("estimatedDistances", []))
            print(f"✅ Valid JPEG processed successfully")
            print(f"   Detections found: {detection_count}")
            
            if result_2.get("metadata"):
                inference_time = result_2["metadata"].get("inferenceTimeMs", 0)
                print(f"   Inference time: {inference_time}ms")
        except json.JSONDecodeError:
            # Fallback for testing without SageMaker endpoint deployed
            assert "valid" in response_2.lower() or "success" in response_2.lower(), \
                f"Expected success for valid JPEG, got: {response_2}"
            print("⚠️  Note: Received old response format (SageMaker endpoint may not be deployed)")

    finally:
        # Always close connection, even if test fails
        ws.close()
        print("🔌 Connection Closed")