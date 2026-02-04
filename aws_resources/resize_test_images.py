#!/usr/bin/env python3
"""
Resize large test images to fit within API Gateway WebSocket limits
Target: < 100 KB after base64 encoding (so ~75 KB image size)
"""

from PIL import Image
from pathlib import Path
import base64
import os

# Configuration
SCRIPT_DIR = Path(__file__).parent.absolute()
TEST_IMAGES_DIR = SCRIPT_DIR / "backend" / "tests" / "integration"
RESIZED_DIR = TEST_IMAGES_DIR / "resized"

# Target size: ~75 KB raw image = ~100 KB base64 = safe for 128 KB limit
TARGET_SIZE_KB = 75

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
            
            # Verify base64 size
            with open(output_path, 'rb') as f:
                base64_size = len(base64.b64encode(f.read()))
            print(f"  Base64 size: {base64_size / 1024:.1f} KB")
        
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
