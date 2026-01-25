import boto3
import json
import time
import csv
import argparse
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

def benchmark_endpoint(endpoint_name, image_path):
    """
    Sends a single image to a specific SageMaker endpoint and records latency.
    """
    runtime = boto3.client('sagemaker-runtime')
    
    with open(image_path, 'rb') as f:
        image_bytes = f.read()

    start_time = time.time()
    try:
        response = runtime.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType='application/x-image',
            Body=image_bytes
        )
        end_time = time.time()
        
        result = json.loads(response['Body'].read().decode())
        
        return {
            "Model": endpoint_name,
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"),
            "Roundtrip_Latency_ms": (end_time - start_time) * 1000,
            "Inference_Latency_ms": result.get("model_latency_ms", 0),
            "Max_Confidence": result.get("max_confidence", 0),
            "Detections": result.get("detections_count", 0),
            "Status": "Success"
        }
    except Exception as e:
        return {
            "Model": endpoint_name,
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"),
            "Status": f"Error: {str(e)}"
        }

def run_benchmarks(endpoints, image_folder, interval=0.5):
    """
    Main loop: Sends images to all endpoints every X seconds.
    """
    images = [os.path.join(image_folder, f) for f in os.listdir(image_folder) 
              if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    if not images:
        print(f"❌ No images found in {image_folder}")
        return

    results = []
    print(f"🚀 Starting benchmark on {len(endpoints)} endpoints...")
    print(f"📸 Using {len(images)} images with a {interval}s interval.")

    try:
        for i, img in enumerate(images):
            print(f"📦 Processing Frame {i+1}/{len(images)}: {os.path.basename(img)}")
            
            # Use ThreadPoolExecutor to call all endpoints in PARALLEL
            with ThreadPoolExecutor(max_workers=len(endpoints)) as executor:
                futures = [executor.submit(benchmark_endpoint, ep, img) for ep in endpoints]
                
                for future in futures:
                    res = future.result()
                    results.append(res)
                    print(f"   ✅ {res['Model']}: {res.get('Roundtrip_Latency_ms', 0):.2f}ms")

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
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoints", nargs="+", required=True, help="List of SageMaker endpoints to test")
    parser.add_argument("--folder", default="test_images", help="Folder containing test images")
    parser.add_argument("--interval", type=float, default=0.5, help="Interval between frames in seconds")
    
    args = parser.parse_args()
    run_benchmarks(args.endpoints, args.folder, args.interval)
