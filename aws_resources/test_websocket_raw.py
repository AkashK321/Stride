#!/usr/bin/env python3
"""
Raw WebSocket test with detailed logging
"""
import websocket
import json
import base64
import time

# Enable WebSocket debug
websocket.enableTrace(True)

# Configuration
WS_URL = "wss://fxmw0n3ncf.execute-api.us-east-1.amazonaws.com/prod"
IMAGE_PATH = "backend/tests/integration/resized/IMG_2825.jpg"

def test_connection():
    print("\n" + "="*60)
    print("RAW WEBSOCKET TEST")
    print("="*60)
    
    # Load image
    with open(IMAGE_PATH, "rb") as f:
        image_bytes = f.read()
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
    
    print(f"Image size: {len(image_bytes)} bytes")
    print(f"Base64 size: {len(base64_image)} bytes")
    
    # Create payload
    payload = {
        "action": "frame",
        "body": base64_image
    }
    payload_json = json.dumps(payload)
    print(f"Payload size: {len(payload_json)} bytes ({len(payload_json)/1024:.2f} KB)")
    
    # Connect
    print(f"\nConnecting to: {WS_URL}")
    ws = websocket.WebSocket()
    ws.connect(WS_URL, timeout=30)
    print("✅ Connected!")
    
    # Send message
    print("\nSending message...")
    start = time.time()
    ws.send(payload_json)
    print(f"✅ Sent {len(payload_json)} bytes")
    
    # Receive response
    print("\nWaiting for response (30s timeout)...")
    ws.settimeout(30)
    
    try:
        response = ws.recv()
        elapsed = (time.time() - start) * 1000
        
        print(f"\n✅ Received response in {elapsed:.0f}ms")
        print(f"Response type: {type(response)}")
        print(f"Response length: {len(response) if response else 0} bytes")
        
        if response:
            print(f"\nRaw response (first 500 chars):\n{response[:500]}")
            
            try:
                result = json.loads(response)
                print(f"\n📊 Parsed JSON:")
                print(json.dumps(result, indent=2))
            except json.JSONDecodeError as e:
                print(f"\n❌ Failed to parse JSON: {e}")
        else:
            print("\n❌ Empty response received!")
            
    except websocket.WebSocketTimeoutException:
        print(f"\n❌ Timeout after 30s - no response received")
    except Exception as e:
        print(f"\n❌ Error receiving response: {e}")
    finally:
        ws.close()
        print("\n🔌 Connection closed")
    
    print("="*60)

if __name__ == "__main__":
    test_connection()
