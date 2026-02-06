#!/usr/bin/env python3
"""
Resize large test images to fit within API Gateway WebSocket limits

IMPORTANT: API Gateway WebSocket has a 32 KB per-frame limit!
The websocket-client library sends messages as a single frame, so the
ENTIRE JSON payload ({"action":"frame","body":"<base64>"}) must be < 32 KB.

Budget:
  32,768 bytes  (32 KB frame limit)
  -    31 bytes  (JSON wrapper: {"action":"frame","body":"..."})
  = 32,737 bytes for base64 string
  / 1.3333       (base64 overhead: 4 bytes per 3 raw bytes)
  = ~24,500 bytes max raw image size

We target 23 KB raw to leave comfortable margin.
"""

from PIL import Image
from pathlib import Path
import base64
import json
import os

# Configuration
SCRIPT_DIR = Path(__file__).parent.absolute()
TEST_IMAGES_DIR = SCRIPT_DIR / "backend" / "tests" / "integration"
RESIZED_DIR = TEST_IMAGES_DIR / "resized"

# Target: 23 KB raw image -> ~30.7 KB base64 -> ~30.7 KB JSON payload (under 32 KB frame limit)
TARGET_SIZE_KB = 23

def get_image_size_kb(image_path):
    """Get image size in KB"""
    return os.path.getsize(image_path) / 1024

def resize_image_to_target_size(input_path, output_path, target_kb=75):
    """Resize image to approximately target KB while maintaining aspect ratio"""
    img = Image.open(input_path)
    
    # Convert to RGB if needed (for PNG with alpha)
    if img.mode in ('RGBA', 'LA', 'P'):
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
        img = background
    
    # Start with a quality estimate
    quality = 85
    scale = 1.0
    
    # Binary search for the right size
    for attempt in range(10):
        # Resize
        if scale < 1.0:
            new_size = (int(img.width * scale), int(img.height * scale))
            resized = img.resize(new_size, Image.Resampling.LANCZOS)
        else:
            resized = img
        
        # Save to temp and check size
        resized.save(output_path, 'JPEG', quality=quality, optimize=True)
        current_kb = get_image_size_kb(output_path)
        
        if current_kb <= target_kb:
            print(f"  ✅ Final size: {current_kb:.1f} KB (quality={quality}, scale={scale:.2f})")
            return True
        
        # Adjust parameters
        if current_kb > target_kb * 1.5:
            # Way too big, reduce scale
            scale *= 0.8
        elif current_kb > target_kb * 1.1:
            # A bit too big, reduce quality
            quality -= 10
        else:
            # Close enough
            quality -= 5
        
        if quality < 50:
            quality = 50
            scale *= 0.9
    
    print(f"  ⚠️  Final size: {current_kb:.1f} KB (best effort)")
    return True

def main():
    # Create output directory
    RESIZED_DIR.mkdir(exist_ok=True)
    
    print("="*60)
    print("🖼️  Resizing Test Images for WebSocket")
    print("="*60)
    print(f"Input directory: {TEST_IMAGES_DIR}")
    print(f"Output directory: {RESIZED_DIR}")
    print(f"Target size: ~{TARGET_SIZE_KB} KB per image")
    print("="*60)
    print()
    
    # List of PNG images to resize
    png_images = [
        "IMG_2825.PNG",
        "IMG_2826.PNG",
        "IMG_2827.PNG",
        "IMG_2828.PNG",
        "IMG_2829.PNG",
        "IMG_2830.PNG",
        "IMG_2831.PNG",
        "IMG_2832.PNG"
    ]
    
    resized_count = 0
    
    for img_name in png_images:
        input_path = TEST_IMAGES_DIR / img_name
        
        if not input_path.exists():
            print(f"⏭️  Skipping {img_name} (not found)")
            continue
        
        original_kb = get_image_size_kb(input_path)
        
        # Convert PNG to JPG filename
        output_name = img_name.replace('.PNG', '.jpg').replace('.png', '.jpg')
        output_path = RESIZED_DIR / output_name
        
        print(f"📸 {img_name}")
        print(f"  Original: {original_kb:.1f} KB")
        
        if resize_image_to_target_size(input_path, output_path, TARGET_SIZE_KB):
            resized_count += 1
            
            # Verify full payload size (this is what actually hits the 32 KB frame limit)
            with open(output_path, 'rb') as f:
                raw_bytes = f.read()
            b64_str = base64.b64encode(raw_bytes).decode('utf-8')
            payload = json.dumps({"action": "frame", "body": b64_str})
            payload_kb = len(payload.encode('utf-8')) / 1024
            under_limit = "OK" if payload_kb < 32 else "OVER LIMIT!"
            print(f"  Base64 size: {len(b64_str) / 1024:.1f} KB")
            print(f"  Full JSON payload: {payload_kb:.1f} KB [{under_limit}]")
        
        print()
    
    # Also copy the small test.jpg
    small_test = TEST_IMAGES_DIR / "test.jpg"
    if small_test.exists():
        import shutil
        shutil.copy(small_test, RESIZED_DIR / "test.jpg")
        print(f"📋 Copied test.jpg ({get_image_size_kb(small_test):.1f} KB)")
        resized_count += 1
    
    print("="*60)
    print(f"✅ Resized {resized_count} images")
    print(f"📁 Output: {RESIZED_DIR}")
    print("="*60)
    print()
    print("Next step: Test with resized images:")
    print(f"  python3 test_sagemaker_inference.py --ws-url <YOUR_WS_URL> --images-dir {RESIZED_DIR}")

if __name__ == "__main__":
    main()
