import cv2
import os
from pathlib import Path

input_dir = "images_in/"
output_dir = "images_pixelated/"
SCALE_FACTOR = 0.25  

os.makedirs(output_dir, exist_ok=True)

for img_path in Path(input_dir).glob("*.[jp][pn]g"):
    img = cv2.imread(str(img_path))
    h, w = img.shape[:2]
    
    # Downscale
    small = cv2.resize(img, (int(w * SCALE_FACTOR), int(h * SCALE_FACTOR)), 
                       interpolation=cv2.INTER_LINEAR)

    # Upscale back
    pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    
    cv2.imwrite(str(Path(output_dir) / img_path.name), pixelated)

print("Pixelate completed")