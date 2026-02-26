import cv2
import os
from pathlib import Path

input_dir = "images_in/"
output_dir = "images_pixelated/"

os.makedirs(output_dir, exist_ok=True)

for img_path in Path(input_dir).glob("*.[jp][pn]g"):
    img = cv2.imread(str(img_path))
    
    # Resize to 360x360
    resized = cv2.resize(img, (360, 360), interpolation=cv2.INTER_LINEAR)
    
    # Save with 50% JPEG quality (0-100 scale)
    cv2.imwrite(str(Path(output_dir) / img_path.stem) + ".jpg", resized, 
                [cv2.IMWRITE_JPEG_QUALITY, 50])

print("Done!")