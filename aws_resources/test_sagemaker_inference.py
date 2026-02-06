#!/usr/bin/env python3
"""
YOLOv11 SageMaker Inference Test Pipeline

One script that does everything:
  1. Finds all images in the given directory (any format/size)
  2. Resizes them to fit within the 32 KB WebSocket frame limit
  3. Sends each image to SageMaker via WebSocket for inference
  4. Saves per-image detection results as JSON
  5. Generates a summary report

Usage:
  python3 test_sagemaker_inference.py --ws-url wss://xxxxx.execute-api.us-east-1.amazonaws.com --images-dir path/to/images

API Gateway WebSocket has a 32 KB per-frame limit. The websocket-client library
sends messages as a single frame, so the full JSON payload must be < 32 KB.
Images are automatically resized to fit this constraint.
"""

import json
import base64
import io
import os
import time
import argparse
from datetime import datetime
from pathlib import Path
from websocket import create_connection

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# ============================================================
# Configuration
# ============================================================
SCRIPT_DIR = Path(__file__).parent.absolute()
TEST_RESULTS_DIR = SCRIPT_DIR / "test_results"

# 32 KB frame limit minus JSON wrapper overhead, divided by base64 expansion (4/3)
# 32,768 - 31 bytes wrapper = 32,737 bytes for base64 / 1.333 = ~24,500 bytes
# Target 23 KB raw for comfortable margin
MAX_RAW_IMAGE_BYTES = 23 * 1024  # 23 KB
MAX_PAYLOAD_BYTES = 32 * 1024     # 32 KB frame limit

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp',
                    '.JPG', '.JPEG', '.PNG', '.BMP', '.GIF', '.WEBP'}


# ============================================================
# Image Processing
# ============================================================
def find_images(directory):
    """Find all image files in directory"""
    directory = Path(directory)
    images = []
    for f in sorted(directory.iterdir()):
        if f.suffix in IMAGE_EXTENSIONS and f.is_file():
            images.append(f)
    return images


def prepare_image(image_path):
    """
    Prepare an image for the WebSocket API.
    If the full JSON payload would exceed 32 KB, resize the image.
    Returns (base64_string, original_size_bytes, was_resized).
    """
    with open(image_path, "rb") as f:
        raw_bytes = f.read()
    original_size = len(raw_bytes)

    # Check if it already fits within the frame limit
    b64 = base64.b64encode(raw_bytes).decode('utf-8')
    payload_size = len(json.dumps({"action": "frame", "body": b64}).encode('utf-8'))

    if payload_size <= MAX_PAYLOAD_BYTES:
        return b64, original_size, False

    # Needs resizing
    if not HAS_PIL:
        raise RuntimeError(
            f"Image {image_path.name} is too large ({payload_size / 1024:.1f} KB payload) "
            f"and Pillow is not installed for resizing. Install with: pip install Pillow"
        )

    img = Image.open(image_path)

    # Convert to RGB if needed (PNG with alpha, palette mode, etc.)
    if img.mode in ('RGBA', 'LA', 'P'):
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    quality = 85
    scale = 1.0

    for _ in range(15):
        if scale < 1.0:
            new_size = (int(img.width * scale), int(img.height * scale))
            resized = img.resize(new_size, Image.Resampling.LANCZOS)
        else:
            resized = img

        buf = io.BytesIO()
        resized.save(buf, 'JPEG', quality=quality, optimize=True)
        jpeg_bytes = buf.getvalue()

        b64 = base64.b64encode(jpeg_bytes).decode('utf-8')
        payload_size = len(json.dumps({"action": "frame", "body": b64}).encode('utf-8'))

        if payload_size <= MAX_PAYLOAD_BYTES:
            return b64, original_size, True

        # Shrink further
        if payload_size > MAX_PAYLOAD_BYTES * 1.5:
            scale *= 0.75
        elif payload_size > MAX_PAYLOAD_BYTES * 1.1:
            quality -= 10
        else:
            quality -= 5

        if quality < 40:
            quality = 40
            scale *= 0.85

    # Best effort - return whatever we got
    return b64, original_size, True


# ============================================================
# WebSocket / Inference
# ============================================================
def send_image_for_inference(ws, image_name, base64_image):
    """Send image to WebSocket and receive inference results"""
    payload = json.dumps({"action": "frame", "body": base64_image})
    payload_kb = len(payload.encode('utf-8')) / 1024

    start_time = time.time()
    ws.send(payload)
    response_str = ws.recv()
    total_time_ms = int((time.time() - start_time) * 1000)

    # Check for empty response (frame limit exceeded or connection issue)
    if not response_str or len(response_str) == 0:
        return None, total_time_ms, (
            f"Empty response (payload was {payload_kb:.1f} KB). "
            f"Likely exceeded 32 KB WebSocket frame limit."
        )

    try:
        response = json.loads(response_str)
        return response, total_time_ms, None
    except json.JSONDecodeError as e:
        return None, total_time_ms, f"Invalid JSON response: {str(e)}"


def save_result(image_name, result, total_time_ms, original_kb, resized, error=None):
    """Save inference result to JSON file"""
    base_name = Path(image_name).stem
    output_file = TEST_RESULTS_DIR / f"{base_name}_detections.json"

    output_data = {
        "image": image_name,
        "timestamp": datetime.now().isoformat(),
        "total_latency_ms": total_time_ms,
        "original_size_kb": round(original_kb, 1),
        "was_resized": resized,
    }

    if error:
        output_data["error"] = error
        output_data["status"] = "failed"
    elif result:
        output_data.update(result)

    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)

    return output_data


# ============================================================
# Summary / Reporting
# ============================================================
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
            "total_latency_ms": result.get("total_latency_ms", 0),
            "was_resized": result.get("was_resized", False),
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

            classes_found = [d["className"] for d in detections]
            image_summary["classes_found"] = classes_found
            summary["classes_detected"].update(classes_found)
        else:
            summary["failed"] += 1
            image_summary["error"] = result.get("error", "Unknown error")

        summary["images"].append(image_summary)

    if successful_count > 0:
        summary["average_total_latency_ms"] = int(total_latency / successful_count)
        summary["average_inference_time_ms"] = int(total_inference_time / successful_count)
        summary["average_detections_per_image"] = round(summary["total_detections"] / successful_count, 2)

    summary["classes_detected"] = sorted(list(summary["classes_detected"]))
    return summary


def print_summary(summary):
    """Print summary to console"""
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Total Images Tested:  {summary['total_images']}")
    print(f"Successful:           {summary['successful']}")
    print(f"Failed:               {summary['failed']}")
    print(f"Total Detections:     {summary['total_detections']}")
    print(f"Avg Total Latency:    {summary['average_total_latency_ms']}ms")
    print(f"Avg Inference Time:   {summary['average_inference_time_ms']}ms")
    print(f"Avg Detections/Image: {summary['average_detections_per_image']}")
    print(f"Classes Detected:     {', '.join(summary['classes_detected']) or 'none'}")
    print("=" * 60)

    print("\nIndividual Results:")
    for img in summary['images']:
        status = "OK" if img['status'] == 'success' else "FAIL"
        resized_tag = " (resized)" if img.get("was_resized") else ""
        print(f"\n  [{status}] {img['name']}{resized_tag}")
        print(f"        Latency: {img['total_latency_ms']}ms")
        if img['status'] == 'success':
            print(f"        Detections: {img['detections']}")
            print(f"        Inference: {img['inference_time_ms']}ms")
            if img.get('classes_found'):
                print(f"        Classes: {', '.join(img['classes_found'])}")
        else:
            print(f"        Error: {img.get('error', 'Unknown')}")


# ============================================================
# Main
# ============================================================
def main():
    parser = argparse.ArgumentParser(
        description='Test YOLOv11 SageMaker inference via WebSocket. '
                    'Automatically resizes images to fit the 32 KB frame limit.'
    )
    parser.add_argument('--ws-url', type=str,
                        help='WebSocket URL (or set WS_API_URL env var)')
    parser.add_argument('--images-dir', type=str,
                        default='backend/tests/integration',
                        help='Directory containing test images (default: backend/tests/integration)')
    args = parser.parse_args()

    # WebSocket URL
    ws_url = args.ws_url or os.getenv("WS_API_URL")
    if not ws_url:
        print("Error: WebSocket URL not provided.")
        print("  Use --ws-url or set WS_API_URL environment variable")
        return 1

    if not ws_url.endswith("/prod"):
        ws_url = ws_url.rstrip("/") + "/prod"

    # Find images
    images_dir = Path(args.images_dir)
    if not images_dir.is_absolute():
        images_dir = SCRIPT_DIR / images_dir

    image_files = find_images(images_dir)
    if not image_files:
        print(f"Error: No images found in {images_dir}")
        return 1

    # Print header
    print("=" * 60)
    print("YOLOv11 SageMaker Inference Test")
    print("=" * 60)
    print(f"WebSocket URL:  {ws_url}")
    print(f"Images Dir:     {images_dir}")
    print(f"Results Dir:    {TEST_RESULTS_DIR}")
    print(f"Images Found:   {len(image_files)}")
    print(f"Frame Limit:    32 KB (images auto-resized if needed)")
    if not HAS_PIL:
        print("WARNING: Pillow not installed. Large images cannot be resized.")
        print("         Install with: pip install Pillow")
    print("=" * 60)

    TEST_RESULTS_DIR.mkdir(exist_ok=True)

    # Connect
    print(f"\nConnecting to WebSocket...")
    try:
        ws = create_connection(ws_url, timeout=60)
        print("Connected successfully!")
    except Exception as e:
        print(f"Failed to connect: {str(e)}")
        return 1

    all_results = []

    try:
        for i, image_path in enumerate(image_files, 1):
            image_name = image_path.name
            print(f"\n[{i}/{len(image_files)}] {image_name}")

            # Prepare image (resize if needed)
            try:
                base64_image, original_size, was_resized = prepare_image(image_path)
                original_kb = original_size / 1024
                payload_kb = len(json.dumps({"action": "frame", "body": base64_image}).encode('utf-8')) / 1024

                if was_resized:
                    print(f"  Resized: {original_kb:.1f} KB -> payload {payload_kb:.1f} KB")
                else:
                    print(f"  Size: {original_kb:.1f} KB (payload {payload_kb:.1f} KB)")

            except Exception as e:
                print(f"  Failed to prepare image: {str(e)}")
                result_data = save_result(image_name, None, 0, 0, False, error=str(e))
                all_results.append(result_data)
                continue

            # Send for inference
            try:
                result, total_time_ms, error = send_image_for_inference(ws, image_name, base64_image)

                if error:
                    print(f"  FAIL: {error}")
                    result_data = save_result(image_name, result, total_time_ms, original_kb, was_resized, error)
                elif result and result.get("status") == "success":
                    detection_count = len(result.get("detections", []))
                    inference_time = result.get("metadata", {}).get("inferenceTimeMs", 0)
                    print(f"  OK: {detection_count} detections in {total_time_ms}ms (inference: {inference_time}ms)")
                    result_data = save_result(image_name, result, total_time_ms, original_kb, was_resized)
                else:
                    error_msg = result.get("error", "Unknown error") if result else "No response"
                    print(f"  FAIL: {error_msg}")
                    result_data = save_result(image_name, result, total_time_ms, original_kb, was_resized, error_msg)

                all_results.append(result_data)

            except Exception as e:
                print(f"  Exception: {str(e)}")
                result_data = save_result(image_name, None, 0, original_kb, was_resized, error=str(e))
                all_results.append(result_data)

            # Small delay between requests
            if i < len(image_files):
                time.sleep(0.5)

    finally:
        ws.close()
        print("\nConnection closed")

    # Summary
    summary = generate_summary(all_results)

    summary_file = TEST_RESULTS_DIR / "summary.json"
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)

    print_summary(summary)

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
    print(f"Results: {TEST_RESULTS_DIR}")
    print(f"  {len(image_files)} detection files + summary.json")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    exit(main())
