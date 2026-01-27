import base64
import os
import websocket
import json
import sys

# CONFIGURATION
WS_URL = "wss://yu7vqmtlqb.execute-api.us-east-1.amazonaws.com/prod"
IMAGE_PATH = "test.jpg"

# STATE TRACKING
current_step = 0
failed_tests = 0

def on_message(ws, message):
    global current_step, failed_tests
    current_step += 1
    
    print(f"\n📩 RESPONSE #{current_step} RECEIVED: {message}")

    # --- ASSERTION LOGIC ---
    if current_step == 1:
        # TEST CASE 1: Expect Failure (Bad Data)
        if "false" in message:
            print("✅ TEST 1 PASSED: API correctly identified bad data.")
        else:
            print("❌ TEST 1 FAILED: API accepted bad data!")
            failed_tests += 1

    elif current_step == 2:
        # TEST CASE 2: Expect Success (Real JPEG)
        if "true" in message:
            print("✅ TEST 2 PASSED: API correctly identified real JPEG.")
        else:
            print("❌ TEST 2 FAILED: API rejected valid JPEG!")
            failed_tests += 1
        
        # End of tests
        ws.close()

def on_error(ws, error):
    print(f"❌ CONNECTION ERROR: {error}")
    sys.exit(1)

def on_close(ws, close_status_code, close_msg):
    print("\n-----------------------------------")
    if failed_tests == 0 and current_step == 2:
        print("🎉 ALL INTEGRATION TESTS PASSED")
        sys.exit(0) # Success Exit Code
    else:
        print(f"💀 TESTS FAILED. Failures: {failed_tests}")
        sys.exit(1) # Failure Exit Code

def on_open(ws):
    print("-----------------------------------")
    print("🚀 STARTING INTEGRATION TESTS")
    print("-----------------------------------")
    
    # --- TEST 1: SEND GARBAGE DATA ---
    print("\n[Step 1] Sending Invalid Data...")
    payload_fake = {
        "action": "frame",
        "body": "simulated_base64_image_data_xyz_INVALID"
    }
    ws.send(json.dumps(payload_fake))

    # --- TEST 2: SEND REAL JPEG ---
    print("[Step 2] Sending Valid JPEG...")
    if not os.path.exists(IMAGE_PATH):
        print(f"❌ FATAL: Could not find {IMAGE_PATH}")
        ws.close()
        sys.exit(1)
    
    with open(IMAGE_PATH, "rb") as image_file:
        binary_data = image_file.read()
        base64_string = base64.b64encode(binary_data).decode('utf-8')
    
    payload_real = {
        "action": "frame",
        "body": base64_string
    }
    ws.send(json.dumps(payload_real))

if __name__ == "__main__":
    # websocket.enableTrace(True) 
    
    ws = websocket.WebSocketApp(WS_URL,
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.run_forever()