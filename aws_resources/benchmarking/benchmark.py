import boto3
import json
import time
import csv
import argparse
import os
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from PIL import Image

# SageMaker real-time endpoint max payload size is 6 MB
MAX_PAYLOAD_SIZE_MB = 6
MAX_PAYLOAD_SIZE_BYTES = MAX_PAYLOAD_SIZE_MB * 1024 * 1024

def compress_image(image_path, max_size=1280, quality=85):
    """
    Resize and compress an image to fit within SageMaker's payload limit.
    Returns the compressed image bytes and metadata for debugging.
    
    Args:
        image_path: Path to the original image
        max_size: Maximum dimension (width or height) for resizing
        quality: JPEG quality (1-100)
    
    Returns:
        tuple: (compressed_bytes, metadata_dict)
    """
    # Get original file size
    original_size_bytes = os.path.getsize(image_path)
    original_size_mb = original_size_bytes / (1024 * 1024)
    
    # Open and get original dimensions
    img = Image.open(image_path)
    original_width, original_height = img.size
    original_mode = img.mode
    
    # Convert to RGB if necessary (for JPEG compression)
    if img.mode in ('RGBA', 'P', 'LA'):
        img = img.convert('RGB')
    
    # Calculate new dimensions while preserving aspect ratio
    ratio = min(max_size / original_width, max_size / original_height)
    if ratio < 1:  # Only resize if image is larger than max_size
        new_width = int(original_width * ratio)
        new_height = int(original_height * ratio)
        img = img.resize((new_width, new_height), Image.LANCZOS)
    else:
        new_width, new_height = original_width, original_height
    
    # Compress to JPEG in memory
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=quality, optimize=True)
    compressed_bytes = buffer.getvalue()
    compressed_size_bytes = len(compressed_bytes)
    compressed_size_mb = compressed_size_bytes / (1024 * 1024)
    
    # If still too large, reduce quality iteratively
    current_quality = quality
    while compressed_size_bytes > MAX_PAYLOAD_SIZE_BYTES and current_quality > 20:
        current_quality -= 10
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=current_quality, optimize=True)
        compressed_bytes = buffer.getvalue()
        compressed_size_bytes = len(compressed_bytes)
        compressed_size_mb = compressed_size_bytes / (1024 * 1024)
    
    metadata = {
        "original_path": image_path,
        "original_size_mb": round(original_size_mb, 2),
        "original_dimensions": f"{original_width}x{original_height}",
        "original_mode": original_mode,
        "compressed_size_mb": round(compressed_size_mb, 2),
        "compressed_dimensions": f"{new_width}x{new_height}",
        "final_quality": current_quality,
        "compression_ratio": round(original_size_bytes / compressed_size_bytes, 2) if compressed_size_bytes > 0 else 0,
        "under_limit": compressed_size_bytes < MAX_PAYLOAD_SIZE_BYTES
    }
    
    return compressed_bytes, metadata


def benchmark_endpoint(endpoint_name, image_bytes, image_metadata, region='us-east-1', timeout=300):
    """
    Sends a compressed image to a specific SageMaker endpoint and records latency.
    
    Args:
        endpoint_name: SageMaker endpoint name
        image_bytes: Pre-compressed image bytes
        image_metadata: Metadata dict from compress_image()
        region: AWS region
        timeout: Request timeout in seconds (default 300s for cold starts)
    """
    from botocore.config import Config
    config = Config(
        read_timeout=timeout,
        connect_timeout=60,
        retries={'max_attempts': 0}  # Don't retry, we want to see the actual error
    )
    runtime = boto3.client('sagemaker-runtime', region_name=region, config=config)
    
    payload_size_mb = len(image_bytes) / (1024 * 1024)
    
    # Debug: Log payload info
    print(f"      📤 Sending to {endpoint_name}: {payload_size_mb:.2f} MB payload")
    
    if len(image_bytes) > MAX_PAYLOAD_SIZE_BYTES:
        return {
            "Model": endpoint_name,
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"),
            "Original_Size_MB": image_metadata.get("original_size_mb", 0),
            "Payload_Size_MB": round(payload_size_mb, 2),
            "Status": f"Error: Payload too large ({payload_size_mb:.2f} MB > {MAX_PAYLOAD_SIZE_MB} MB limit)"
        }

    start_time = time.time()
    try:
        response = runtime.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType='application/x-image',
            Body=image_bytes
        )
        end_time = time.time()
        
        # Debug: Log response info
        response_body = response['Body'].read().decode()
        print(f"      📥 Response from {endpoint_name}: {len(response_body)} bytes")
        
        result = json.loads(response_body)
        
        return {
            "Model": endpoint_name,
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"),
            "Roundtrip_Latency_ms": (end_time - start_time) * 1000,
            "Inference_Latency_ms": result.get("model_latency_ms", 0),
            "Max_Confidence": result.get("max_confidence", 0),
            "Detections": result.get("detections_count", 0),
            "Original_Size_MB": image_metadata.get("original_size_mb", 0),
            "Payload_Size_MB": round(payload_size_mb, 2),
            "Image_Dimensions": image_metadata.get("compressed_dimensions", "unknown"),
            "Status": "Success"
        }
    except Exception as e:
        error_msg = str(e)
        # Extract more useful error info
        print(f"      ❌ Error from {endpoint_name}: {error_msg[:200]}")
        
        return {
            "Model": endpoint_name,
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"),
            "Original_Size_MB": image_metadata.get("original_size_mb", 0),
            "Payload_Size_MB": round(payload_size_mb, 2),
            "Image_Dimensions": image_metadata.get("compressed_dimensions", "unknown"),
            "Status": f"Error: {error_msg}"
        }

def check_endpoint_health(endpoint_name, region='us-east-1'):
    """
    Check if a SageMaker endpoint is InService.
    Returns True if healthy, False otherwise.
    """
    try:
        sm_client = boto3.client('sagemaker', region_name=region)
        response = sm_client.describe_endpoint(EndpointName=endpoint_name)
        status = response['EndpointStatus']
        return status == 'InService', status
    except Exception as e:
        return False, str(e)

def warm_up_endpoint(endpoint_name, image_bytes, region='us-east-1', num_warmup=3):
    """
    Send warm-up requests to avoid cold start affecting benchmark results.
    AWS best practice: warm up endpoints before measuring latency.
    """
    from botocore.config import Config
    config = Config(read_timeout=300, connect_timeout=60, retries={'max_attempts': 2})
    runtime = boto3.client('sagemaker-runtime', region_name=region, config=config)
    
    print(f"   🔥 Warming up {endpoint_name} with {num_warmup} requests...")
    
    for i in range(num_warmup):
        try:
            response = runtime.invoke_endpoint(
                EndpointName=endpoint_name,
                ContentType='application/x-image',
                Body=image_bytes
            )
            response['Body'].read()  # Consume response
            print(f"      ✓ Warm-up {i+1}/{num_warmup} complete")
        except Exception as e:
            print(f"      ✗ Warm-up {i+1}/{num_warmup} failed: {str(e)[:50]}")
            return False
    return True

def run_benchmarks(endpoints, image_folder, interval=0.5, region='us-east-1', max_size=1280, quality=85, warmup=3):
    """
    Main loop: Sends images to all endpoints every X seconds.
    
    Args:
        endpoints: List of SageMaker endpoint names
        image_folder: Folder containing test images
        interval: Seconds between frames
        region: AWS region
        max_size: Maximum image dimension for resizing (default 1280)
        quality: JPEG compression quality (default 85)
        warmup: Number of warm-up requests per endpoint (default 3)
    """
    images = [os.path.join(image_folder, f) for f in os.listdir(image_folder) 
              if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    if not images:
        print(f"❌ No images found in {image_folder}")
        return

    results = []
    print(f"\n{'='*60}")
    print(f"🚀 BENCHMARK CONFIGURATION")
    print(f"{'='*60}")
    print(f"   Endpoints: {len(endpoints)}")
    for ep in endpoints:
        print(f"      - {ep}")
    print(f"   Images: {len(images)}")
    print(f"   Interval: {interval}s")
    print(f"   Region: {region}")
    print(f"   Max Image Size: {max_size}px")
    print(f"   JPEG Quality: {quality}")
    print(f"   Warm-up Requests: {warmup}")
    print(f"   Payload Limit: {MAX_PAYLOAD_SIZE_MB} MB")
    print(f"{'='*60}\n")

    # Step 1: Check endpoint health
    print(f"🏥 CHECKING ENDPOINT HEALTH...")
    print(f"-" * 60)
    healthy_endpoints = []
    for ep in endpoints:
        healthy, status = check_endpoint_health(ep, region)
        if healthy:
            print(f"   ✅ {ep}: {status}")
            healthy_endpoints.append(ep)
        else:
            print(f"   ❌ {ep}: {status} (skipping)")
    
    if not healthy_endpoints:
        print(f"\n❌ No healthy endpoints found. Exiting.")
        return
    
    print(f"-" * 60)
    print(f"✅ {len(healthy_endpoints)}/{len(endpoints)} endpoints healthy\n")
    endpoints = healthy_endpoints

    # Step 2: Pre-process all images and show compression stats
    print(f"📦 PRE-PROCESSING IMAGES...")
    print(f"-" * 60)
    compressed_images = []
    for img_path in images:
        img_bytes, metadata = compress_image(img_path, max_size=max_size, quality=quality)
        compressed_images.append((img_path, img_bytes, metadata))
        
        status_icon = "✅" if metadata["under_limit"] else "❌"
        print(f"   {status_icon} {os.path.basename(img_path)}")
        print(f"      Original:   {metadata['original_size_mb']:.2f} MB ({metadata['original_dimensions']}, {metadata['original_mode']})")
        print(f"      Compressed: {metadata['compressed_size_mb']:.2f} MB ({metadata['compressed_dimensions']}, Q={metadata['final_quality']})")
        print(f"      Ratio:      {metadata['compression_ratio']}x smaller")
        
        if not metadata["under_limit"]:
            print(f"      ⚠️  WARNING: Still exceeds {MAX_PAYLOAD_SIZE_MB} MB limit!")
    
    print(f"-" * 60)
    print(f"✅ Pre-processing complete.\n")

    # Step 3: Warm up endpoints (AWS best practice)
    if warmup > 0 and compressed_images:
        print(f"🔥 WARMING UP ENDPOINTS...")
        print(f"-" * 60)
        warmup_image = compressed_images[0][1]  # Use first image for warm-up
        for ep in endpoints:
            warm_up_endpoint(ep, warmup_image, region, warmup)
        print(f"-" * 60)
        print(f"✅ Warm-up complete. Starting benchmark...\n")

    try:
        for i, (img_path, img_bytes, img_metadata) in enumerate(compressed_images):
            print(f"📸 Frame {i+1}/{len(compressed_images)}: {os.path.basename(img_path)} ({img_metadata['compressed_size_mb']:.2f} MB)")
            
            # Use ThreadPoolExecutor to call all endpoints in PARALLEL
            with ThreadPoolExecutor(max_workers=len(endpoints)) as executor:
                futures = [executor.submit(benchmark_endpoint, ep, img_bytes, img_metadata, region) for ep in endpoints]
                
                for future in futures:
                    res = future.result()
                    results.append(res)
                    if res.get("Status") == "Success":
                        print(f"   ✅ {res['Model']}: {res.get('Roundtrip_Latency_ms', 0):.2f}ms, {res.get('Detections', 0)} detections, conf={res.get('Max_Confidence', 0):.3f}")
                    else:
                        print(f"   ❌ {res['Model']}: {res.get('Status', 'Unknown error')[:100]}")

            time.sleep(interval)
            
    except KeyboardInterrupt:
        print("\n🛑 Benchmark stopped by user.")

    # Save to CSV
    filename = f"benchmark_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    keys = results[0].keys() if results else []
    
    with open(filename, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(results)
    
    print(f"\n📊 Benchmark Complete! Results saved to: {filename}")
    
    # Calculate and display summary statistics per model
    print("\n" + "="*60)
    print("📈 SUMMARY STATISTICS")
    print("="*60)
    
    # Group results by model
    model_stats = {}
    for r in results:
        if r.get("Status") != "Success":
            continue
        model = r["Model"]
        if model not in model_stats:
            model_stats[model] = {
                "roundtrip": [],
                "inference": [],
                "confidence": [],
                "detections": []
            }
        model_stats[model]["roundtrip"].append(r.get("Roundtrip_Latency_ms", 0))
        model_stats[model]["inference"].append(r.get("Inference_Latency_ms", 0))
        model_stats[model]["confidence"].append(r.get("Max_Confidence", 0))
        model_stats[model]["detections"].append(r.get("Detections", 0))
    
    # Print summary for each model
    summary_data = []
    for model, stats in model_stats.items():
        n = len(stats["roundtrip"])
        avg_roundtrip = sum(stats["roundtrip"]) / n if n > 0 else 0
        avg_inference = sum(stats["inference"]) / n if n > 0 else 0
        avg_confidence = sum(stats["confidence"]) / n if n > 0 else 0
        avg_detections = sum(stats["detections"]) / n if n > 0 else 0
        
        # Min/Max for latency
        min_roundtrip = min(stats["roundtrip"]) if stats["roundtrip"] else 0
        max_roundtrip = max(stats["roundtrip"]) if stats["roundtrip"] else 0
        
        print(f"\n🤖 {model}")
        print(f"   Samples: {n}")
        print(f"   Avg Roundtrip Latency: {avg_roundtrip:.2f} ms (min: {min_roundtrip:.2f}, max: {max_roundtrip:.2f})")
        print(f"   Avg Inference Latency: {avg_inference:.2f} ms")
        print(f"   Avg Max Confidence:    {avg_confidence:.4f} ({avg_confidence*100:.2f}%)")
        print(f"   Avg Detections:        {avg_detections:.1f}")
        
        summary_data.append({
            "Model": model,
            "Samples": n,
            "Avg_Roundtrip_ms": round(avg_roundtrip, 2),
            "Min_Roundtrip_ms": round(min_roundtrip, 2),
            "Max_Roundtrip_ms": round(max_roundtrip, 2),
            "Avg_Inference_ms": round(avg_inference, 2),
            "Avg_Confidence": round(avg_confidence, 4),
            "Avg_Detections": round(avg_detections, 1)
        })
    
    # Save summary to separate CSV
    summary_filename = f"benchmark_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    if summary_data:
        with open(summary_filename, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=summary_data[0].keys())
            writer.writeheader()
            writer.writerows(summary_data)
        print(f"\n📋 Summary saved to: {summary_filename}")
    
    print("\n" + "="*60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark YOLO models on SageMaker endpoints")
    parser.add_argument("--endpoints", nargs="+", required=True, help="List of SageMaker endpoints to test")
    parser.add_argument("--folder", default="test_images", help="Folder containing test images")
    parser.add_argument("--interval", type=float, default=0.5, help="Interval between frames in seconds")
    parser.add_argument("--region", default="us-east-1", help="AWS region (default: us-east-1)")
    parser.add_argument("--max-size", type=int, default=1280, help="Max image dimension for resizing (default: 1280)")
    parser.add_argument("--quality", type=int, default=85, help="JPEG compression quality 1-100 (default: 85)")
    parser.add_argument("--warmup", type=int, default=3, help="Number of warm-up requests per endpoint (default: 3, 0 to disable)")
    
    args = parser.parse_args()
    run_benchmarks(
        endpoints=args.endpoints, 
        image_folder=args.folder, 
        interval=args.interval, 
        region=args.region,
        max_size=args.max_size,
        quality=args.quality,
        warmup=args.warmup
    )
