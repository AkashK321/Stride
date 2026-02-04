#!/usr/bin/env python3
"""
Debug WebSocket connection and payload
"""
import json
import base64
import sys

# Read the image
image_path = "backend/tests/integration/resized/IMG_2825.jpg"
with open(image_path, "rb") as f:
    image_bytes = f.read()
    base64_image = base64.b64encode(image_bytes).decode('utf-8')

# Create payload
payload = {
    "action": "frame",
    "body": base64_image
}

payload_json = json.dumps(payload)
payload_size = len(payload_json.encode('utf-8'))

print("="*60)
print("PAYLOAD DIAGNOSTICS")
print("="*60)
print(f"Image size: {len(image_bytes):,} bytes")
print(f"Base64 size: {len(base64_image):,} bytes")
print(f"Payload JSON size: {payload_size:,} bytes ({payload_size/1024:.2f} KB)")
print(f"API Gateway WebSocket limit: 128 KB")
print(f"Within limit: {'✅ YES' if payload_size < 128*1024 else '❌ NO'}")
print()
print("Payload structure:")
print(f"  - action: '{payload['action']}'")
print(f"  - body: <base64 string of {len(base64_image)} chars>")
print()
print("First 200 chars of payload JSON:")
print(payload_json[:200])
print("...")
print()
print("Route selection expression: $request.body.action")
print(f"Expected to match: 'frame'")
print(f"Actual value: '{payload['action']}'")
print(f"Match: {'✅ YES' if payload['action'] == 'frame' else '❌ NO'}")
print("="*60)
