#!/usr/bin/env python3
"""
Test SageMaker YOLOv11 Inference via WebSocket
Sends all test images through the full pipeline and saves detection results
"""

import json
import base64
import os
import time
from datetime import datetime
from pathlib import Path
from websocket import create_connection
import argparse

# Configuration
SCRIPT_DIR = Path(__file__).parent.absolute()
TEST_IMAGES_DIR = SCRIPT_DIR / "backend" / "tests" / "integration"
TEST_RESULTS_DIR = SCRIPT_DIR / "test_results"

# List of test images
TEST_IMAGES = [
    "IMG_2825.PNG",
    "IMG_2826.PNG",
    "IMG_2827.PNG",
    "IMG_2828.PNG",
    "IMG_2829.PNG",
    "IMG_2830.PNG",
    "IMG_2831.PNG",
    "IMG_2832.PNG",
    "test.jpg"
]

def load_image_as_base64(image_path):
    """Load image file and encode as base64 string"""
    with open(image_path, "rb") as image_file:
        image_bytes = image_file.read()
        base64_string = base64.b64encode(image_bytes).decode('utf-8')
        return base64_string, len(image_bytes)

def send_image_for_inference(ws, image_name, base64_image):
    """Send image to WebSocket and receive inference results"""
    print(f"  📤 Sending {image_name}...")
    
    # Create payload
    payload = {
        "action": "frame",
        "body": base64_image
    }
    
    # Send and measure time
    start_time = time.time()
    ws.send(json.dumps(payload))
    
    # Wait for response
    response_str = ws.recv()
    end_time = time.time()
    
    total_time_ms = int((end_time - start_time) * 1000)
    
    # Parse JSON response
    try:
        response = json.loads(response_str)
        return response, total_time_ms, None
    except json.JSONDecodeError as e:
        return None, total_time_ms, f"Invalid JSON response: {str(e)}"

def save_result_to_file(image_name, result, total_time_ms, error=None):
    """Save inference result to JSON file"""
    # Create filename (replace extension with _detections.json)
    base_name = Path(image_name).stem
    output_file = TEST_RESULTS_DIR / f"{base_name}_detections.json"
    
    # Prepare output data
    output_data = {
        "image": image_name,
        "timestamp": datetime.now().isoformat(),
        "total_latency_ms": total_time_ms
    }
    
    if error:
        output_data["error"] = error
        output_data["status"] = "failed"
    elif result:
        output_data.update(result)
    
    # Save to file
    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)
    
    print(f"  💾 Saved to: {output_file.name}")
    return output_data

def generate_summary(all_results):
    """Generate summary report from all results"""
    summary = {
        "test_run_timestamp": datetime.now().isoformat(),
        "total_images": len(all_results),
        "successful": 0,
        "failed": 0,
        "total_detections": 0,
        "average_total_latency_ms": 0,
        "average_inference_time_ms": 0,
        "average_detections_per_image": 0,
        "classes_detected": set(),
        "images": []
    }
    
    total_latency = 0
    total_inference_time = 0
    successful_count = 0
    
    for result in all_results:
        image_summary = {
            "name": result["image"],
            "status": result.get("status", "unknown"),
            "total_latency_ms": result.get("total_latency_ms", 0)
        }
        
        if result.get("status") == "success":
            summary["successful"] += 1
            successful_count += 1
            
            detections = result.get("detections", [])
            detection_count = len(detections)
            summary["total_detections"] += detection_count
            
            image_summary["detections"] = detection_count
            image_summary["inference_time_ms"] = result.get("metadata", {}).get("inferenceTimeMs", 0)
            
            total_latency += result.get("total_latency_ms", 0)
            total_inference_time += result.get("metadata", {}).get("inferenceTimeMs", 0)
            
            # Collect unique classes
            classes_found = [d["className"] for d in detections]
            image_summary["classes_found"] = classes_found
            summary["classes_detected"].update(classes_found)
        else:
            summary["failed"] += 1
            image_summary["error"] = result.get("error", "Unknown error")
        
        summary["images"].append(image_summary)
    
    # Calculate averages
    if successful_count > 0:
        summary["average_total_latency_ms"] = int(total_latency / successful_count)
        summary["average_inference_time_ms"] = int(total_inference_time / successful_count)
        summary["average_detections_per_image"] = round(summary["total_detections"] / successful_count, 2)
    
    # Convert set to sorted list
    summary["classes_detected"] = sorted(list(summary["classes_detected"]))
    
    return summary

def print_summary(summary):
    """Print summary to console"""
    print("\n" + "="*60)
    print("📊 TEST SUMMARY")
    print("="*60)
    print(f"Total Images Tested: {summary['total_images']}")
    print(f"Successful: {summary['successful']} ✅")
    print(f"Failed: {summary['failed']} ❌")
    print(f"Total Detections: {summary['total_detections']}")
    print(f"Average Total Latency: {summary['average_total_latency_ms']}ms")
    print(f"Average Inference Time: {summary['average_inference_time_ms']}ms")
    print(f"Average Detections per Image: {summary['average_detections_per_image']}")
    print(f"Classes Detected: {', '.join(summary['classes_detected'])}")
    print("="*60)
    
    # Print individual results
    print("\n📋 Individual Results:")
    for img in summary['images']:
        status_icon = "✅" if img['status'] == 'success' else "❌"
        print(f"\n{status_icon} {img['name']}")
        print(f"   Latency: {img['total_latency_ms']}ms")
        if img['status'] == 'success':
            print(f"   Detections: {img['detections']}")
            print(f"   Inference Time: {img['inference_time_ms']}ms")
            if img.get('classes_found'):
                print(f"   Classes: {', '.join(img['classes_found'])}")
        else:
            print(f"   Error: {img.get('error', 'Unknown')}")

def main():
    parser = argparse.ArgumentParser(description='Test YOLOv11 SageMaker inference via WebSocket')
    parser.add_argument('--ws-url', type=str, help='WebSocket URL (overrides WS_API_URL env var)')
    args = parser.parse_args()
    
    # Get WebSocket URL
    ws_url = args.ws_url or os.getenv("WS_API_URL")
    if not ws_url:
        print("❌ Error: WebSocket URL not provided.")
        print("   Use --ws-url or set WS_API_URL environment variable")
        return 1
    
    # Ensure URL ends with /prod
    if not ws_url.endswith("/prod"):
        ws_url = ws_url.rstrip("/") + "/prod"
    
    print("="*60)
    print("🧪 YOLOv11 SageMaker Inference Test")
    print("="*60)
    print(f"WebSocket URL: {ws_url}")
    print(f"Test Images Directory: {TEST_IMAGES_DIR}")
    print(f"Results Directory: {TEST_RESULTS_DIR}")
    print(f"Number of Images: {len(TEST_IMAGES)}")
    print("="*60)
    
    # Create results directory if it doesn't exist
    TEST_RESULTS_DIR.mkdir(exist_ok=True)
    
    # Connect to WebSocket
    print(f"\n🔌 Connecting to WebSocket...")
    try:
        ws = create_connection(ws_url, timeout=60)
        print("✅ Connected successfully!")
    except Exception as e:
        print(f"❌ Failed to connect: {str(e)}")
        return 1
    
    all_results = []
    
    try:
        # Process each image
        for i, image_name in enumerate(TEST_IMAGES, 1):
            print(f"\n[{i}/{len(TEST_IMAGES)}] Processing {image_name}...")
            
            image_path = TEST_IMAGES_DIR / image_name
            
            # Check if image exists
            if not image_path.exists():
                print(f"  ⚠️  Image not found: {image_path}")
                result_data = save_result_to_file(
                    image_name, 
                    None, 
                    0, 
                    error=f"Image file not found: {image_path}"
                )
                all_results.append(result_data)
                continue
            
            # Load and encode image
            try:
                base64_image, image_size = load_image_as_base64(image_path)
                print(f"  📸 Loaded image ({image_size} bytes)")
            except Exception as e:
                print(f"  ❌ Failed to load image: {str(e)}")
                result_data = save_result_to_file(
                    image_name, 
                    None, 
                    0, 
                    error=f"Failed to load image: {str(e)}"
                )
                all_results.append(result_data)
                continue
            
            # Send for inference
            try:
                result, total_time_ms, error = send_image_for_inference(ws, image_name, base64_image)
                
                if error:
                    print(f"  ❌ Error: {error}")
                    result_data = save_result_to_file(image_name, result, total_time_ms, error)
                elif result and result.get("status") == "success":
                    detection_count = len(result.get("detections", []))
                    inference_time = result.get("metadata", {}).get("inferenceTimeMs", 0)
                    print(f"  ✅ Success! Found {detection_count} objects")
                    print(f"  ⏱️  Total latency: {total_time_ms}ms (Inference: {inference_time}ms)")
                    result_data = save_result_to_file(image_name, result, total_time_ms)
                else:
                    error_msg = result.get("error", "Unknown error") if result else "No response"
                    print(f"  ❌ Inference failed: {error_msg}")
                    result_data = save_result_to_file(image_name, result, total_time_ms, error_msg)
                
                all_results.append(result_data)
                
            except Exception as e:
                print(f"  ❌ Exception during inference: {str(e)}")
                result_data = save_result_to_file(
                    image_name, 
                    None, 
                    0, 
                    error=f"Exception: {str(e)}"
                )
                all_results.append(result_data)
            
            # Small delay between requests
            if i < len(TEST_IMAGES):
                time.sleep(0.5)
    
    finally:
        # Close WebSocket connection
        ws.close()
        print("\n🔌 Connection closed")
    
    # Generate and save summary
    print("\n📊 Generating summary report...")
    summary = generate_summary(all_results)
    
    summary_file = TEST_RESULTS_DIR / "summary.json"
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"💾 Summary saved to: {summary_file}")
    
    # Print summary to console
    print_summary(summary)
    
    print("\n" + "="*60)
    print("✅ TEST COMPLETE!")
    print("="*60)
    print(f"Results saved in: {TEST_RESULTS_DIR}")
    print(f"- Individual results: {len(TEST_IMAGES)} JSON files")
    print(f"- Summary report: summary.json")
    print("="*60)
    
    return 0

if __name__ == "__main__":
    exit(main())
