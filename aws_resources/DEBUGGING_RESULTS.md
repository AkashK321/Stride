# WebSocket Empty Response - Root Cause Analysis

## Problem Summary

Resized test images (68KB) were getting empty responses in ~48ms when sent through the WebSocket API, while smaller test images (8KB) worked fine. Lambda logs showed NO invocations for the failed requests.

## Root Cause Found

**Missing $default Route in WebSocket API**

The WebSocket API was configured with:
- Route selection expression: `$request.body.action`
- Only one route defined: `frame`
- **NO $default route to catch unmatched messages**

### What Was Happening

1. Client sends large JSON payload (91KB): `{"action": "frame", "body": "base64..."}`
2. API Gateway tries to parse the JSON to extract the `action` field for routing
3. **Route selection likely fails silently** (possibly due to JSON parsing issues with large payloads)
4. With no $default route, the message is **dropped with no error**
5. Client receives an empty WebSocket frame back (48ms response)
6. Lambda never gets invoked

### Why Small Images Worked

The small test.jpg (8KB) resulted in a much smaller JSON payload (~12KB), which API Gateway could parse successfully, allowing route selection to work.

## Fixes Applied

### 1. Added $default Route (CDK Stack)
```python
ws_api.add_route(
    route_key="$default",
    integration=integrations.WebSocketLambdaIntegration("DefaultIntegration", object_detection_handler)
)
```

**Purpose**: Catches any message that doesn't match the "frame" route, allowing us to see what's failing and respond with an error.

### 2. Enhanced Lambda Logging (ObjectDetectionHandler.kt)

Added detailed logging to track:
- Route key (`frame` vs `$default`)
- Connection ID
- Body size
- JSON parsing steps
- Base64 decoding steps

### 3. Added $default Route Handler

When a message arrives on the $default route, the Lambda now:
- Logs a WARNING with the first 200 chars of the body
- Sends back a descriptive error message to the client
- Returns 200 to acknowledge the message

### 4. Fixed Timeout Mismatch

Changed Lambda timeout from 30s → 29s to match API Gateway's WebSocket integration timeout limit (29s max).

## Testing Plan

1. **Deploy changes**: Build Kotlin backend + deploy CDK stack
2. **Re-test with resized images**: Should now see Lambda invocations
3. **Check logs**: Look for either:
   - Route: `frame` → successful processing
   - Route: `$default` → will show why route selection failed
4. **Client response**: Should now get proper error messages instead of empty responses

## Expected Outcomes After Deploy

### Scenario A: Route Selection Now Works
- Large images route to `frame` successfully
- SageMaker inference runs normally
- Detections returned

### Scenario B: Route Selection Still Fails (but we'll know why)
- Messages route to `$default`
- Lambda logs show: "WARNING: Message received on $default route"
- Client receives error: "Route selection failed. Check that your message has 'action' field."
- We can see the first 200 chars of the payload to diagnose further

## Additional Findings

### Current Infrastructure Status (us-east-1)
- ✅ SageMaker Endpoint: **InService** (`stride-yolov11-nano-endpoint`)
- ✅ ECR Repository: Exists (`stride-yolov11-inference`)
- ✅ Lambda: Configured with correct environment variables
- ✅ API Gateway: `fxmw0n3ncf.execute-api.us-east-1.amazonaws.com`

### WebSocket API Configuration
- **API ID**: fxmw0n3ncf
- **Protocol**: WEBSOCKET
- **Stage**: prod
- **Logging**: INFO level enabled (just activated)
- **Integration Timeout**: 29,000ms
- **Route Selection**: `$request.body.action`

### Payload Analysis
- **Image size**: 68,233 bytes
- **Base64 size**: 90,980 bytes
- **JSON payload size**: 91,011 bytes (88.88 KB)
- **API Gateway limit**: 128 KB
- **Status**: ✅ Within limit

## Next Steps

1. Build Kotlin backend: `./gradlew shadowJar`
2. Deploy CDK stack: `cdk deploy` (or push to trigger CI/CD)
3. Test with resized images
4. Check CloudWatch logs for both Lambda and (optionally) API Gateway execution logs
5. If still failing, we'll have detailed logs showing exactly where it breaks

---

**Date**: 2026-02-04
**Analyzed by**: AI Assistant
**Status**: Ready for deployment
