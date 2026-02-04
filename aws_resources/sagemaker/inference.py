"""
YOLOv11-nano Inference Handler for SageMaker
Receives JPEG images and returns object detection results in Ultralytics format
"""

import os
import json
import io
import traceback
from flask import Flask, request, jsonify
from PIL import Image
import numpy as np
from ultralytics import YOLO

# Initialize Flask app
app = Flask(__name__)

# Global model variable (loaded once on container startup)
model = None

def load_model():
    """Load YOLOv11-nano model on startup"""
    global model
    try:
        print("Loading YOLOv11-nano model...")
        model = YOLO('yolo11n.pt')
        print("Model loaded successfully!")
        return True
    except Exception as e:
        print(f"Error loading model: {str(e)}")
        traceback.print_exc()
        return False

@app.route('/ping', methods=['GET'])
def ping():
    """
    Health check endpoint required by SageMaker
    Returns 200 if the model is loaded and ready
    """
    if model is not None:
        return jsonify({"status": "healthy"}), 200
    else:
        return jsonify({"status": "unhealthy", "error": "Model not loaded"}), 503

@app.route('/invocations', methods=['POST'])
def invocations():
    """
    Inference endpoint required by SageMaker
    Accepts: image/jpeg or application/octet-stream (JPEG bytes)
    Returns: JSON with detection results in Ultralytics format
    """
    try:
        # Check if model is loaded
        if model is None:
            return jsonify({
                "success": False,
                "error": "Model not loaded"
            }), 500

        # Get image data from request
        # Accept JPEG, PNG, or generic binary data
        if request.content_type in ['image/jpeg', 'image/png', 'application/octet-stream']:
            image_bytes = request.data
        else:
            return jsonify({
                "success": False,
                "error": f"Unsupported content type: {request.content_type}. Use image/jpeg, image/png, or application/octet-stream"
            }), 400

        # Validate image data
        if not image_bytes or len(image_bytes) == 0:
            return jsonify({
                "success": False,
                "error": "Empty image data"
            }), 400

        # Load image
        try:
            image = Image.open(io.BytesIO(image_bytes))
            image = image.convert('RGB')  # Ensure RGB format
            image_width, image_height = image.size
        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"Invalid image format: {str(e)}"
            }), 400

        # Run inference
        results = model(image, verbose=False)
        
        # Parse results
        predictions = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                # Get bounding box coordinates (xyxy format)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                # Get class and confidence
                class_id = int(box.cls[0].item())
                class_name = model.names[class_id]
                confidence = float(box.conf[0].item())
                
                # Create prediction object in Ultralytics format
                prediction = {
                    "class": class_name,
                    "confidence": confidence,
                    "box": {
                        "x1": int(x1),
                        "y1": int(y1),
                        "x2": int(x2),
                        "y2": int(y2)
                    }
                }
                predictions.append(prediction)

        # Return response in Ultralytics format
        response = {
            "success": True,
            "predictions": predictions,
            "image": {
                "width": image_width,
                "height": image_height
            }
        }
        
        return jsonify(response), 200

    except Exception as e:
        # Log error and return error response
        error_msg = str(e)
        print(f"Error during inference: {error_msg}")
        traceback.print_exc()
        
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500

# Load model when the app starts
print("Starting inference server...")
if not load_model():
    print("WARNING: Model failed to load!")

if __name__ == '__main__':
    # For local testing
    app.run(host='0.0.0.0', port=8080, debug=True)
