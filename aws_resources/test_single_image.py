#!/usr/bin/env python3
"""
Quick test with a single small image to verify the pipeline works
"""

import json
import base64
import os
import time
from pathlib import Path
from websocket import create_connection
import argparse

def test_single_image(ws_url, image_path):
    """Test with a single image"""
    print(f"Testing with: {image_path}")
    
    # Load image
    with open(image_path, "rb") as f:
        image_bytes = f.read()
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
    
    print(f"Image size: {len(image_bytes)} bytes")
    print(f"Base64 size: {len(base64_image)} bytes")
    
    # Ensure URL ends with /prod
    if not ws_url.endswith("/prod"):
        ws_url = ws_url.rstrip("/") + "/prod"
    
    print(f"\nConnecting to: {ws_url}")
    
    try:
        # Connect
        ws = create_connection(ws_url, timeout=60)
        print("✅ Connected!")
        
        # Send payload
        payload = {
            "action": "frame",
            "body": base64_image
        }
        
        print("\nSending image...")
        start_time = time.time()
        ws.send(json.dumps(payload))
        
        # Receive response
        print("Waiting for response...")
        response = ws.recv()
        latency = (time.time() - start_time) * 1000
        
        print(f"✅ Received response in {latency:.0f}ms")
        print(f"Raw response type: {type(response)}")
        print(f"Raw response length: {len(response)} bytes")
        print(f"Raw response (first 500 chars): {response[:500]}")
        
        # Parse response
        if not response or len(response) == 0:
            print("❌ Empty response received!")
            return
        
        result = json.loads(response)
        print("\n" + "="*60)
        print("RESPONSE:")
        print("="*60)
        print(json.dumps(result, indent=2))
        print("="*60)
        
        # Show detection summary
        if result.get("status") == "success":
            detections = result.get("detections", [])
            print(f"\n✅ SUCCESS! Found {len(detections)} detections")
            for i, det in enumerate(detections, 1):
                print(f"  {i}. {det['className']} - {det['confidence']:.2%} confidence")
        else:
            print(f"\n❌ Error: {result.get('error', 'Unknown error')}")
        
        ws.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--ws-url', required=True, help='WebSocket URL')
    parser.add_argument('--image', default='backend/tests/integration/test.jpg', help='Image path')
    args = parser.parse_args()
    
    script_dir = Path(__file__).parent
    image_path = script_dir / args.image
    
    if not image_path.exists():
        print(f"❌ Image not found: {image_path}")
        exit(1)
    
    test_single_image(args.ws_url, image_path)
