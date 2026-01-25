import os
import json
import torch
import io
from PIL import Image
import numpy as np

# This script runs INSIDE the SageMaker container
# We no longer need the install() function because we are providing a requirements.txt
# which SageMaker installs automatically during the deployment/boot phase.

def model_fn(model_dir):
    """
    Loads the ACTUAL models requested.
    """
    model_type = os.environ.get("MODEL_TYPE", "yolov11-nano")
    
    # 1. ACTUAL YOLO v11 Nano (Official Ultralytics)
    if model_type == "yolov11-nano":
        from ultralytics import YOLO
        return YOLO('yolo11n.pt') 
    
    # 2. ACTUAL YOLO-NAS Small (Official Deci AI / SuperGradients)
    elif model_type == "yolo-nas":
        from super_gradients.training import models
        return models.get("yolo_nas_s", pretrained_weights="coco")
        
    # 3. ACTUAL YOLO v11 Small (Standard Real-time model)
    elif model_type == "yolo-realtime":
        from ultralytics import YOLO
        return YOLO('yolo11s.pt')
    
    from ultralytics import YOLO
    return YOLO('yolo11n.pt')

def input_fn(request_body, request_content_type):
    if request_content_type == 'application/x-image':
        return Image.open(io.BytesIO(request_body))
    raise ValueError(f"Unsupported content type: {request_content_type}")

def predict_fn(input_data, model):
    if hasattr(model, 'predict'):
        return model.predict(input_data)
    else:
        return model(input_data)

def output_fn(prediction, content_type):
    if isinstance(prediction, list):
        result = prediction[0]
        output = {
            "model_latency_ms": result.speed.get('inference', 0),
            "detections_count": len(result.boxes),
            "max_confidence": float(result.boxes.conf.max()) if len(result.boxes) > 0 else 0.0,
        }
    else:
        result = prediction.prediction
        output = {
            "model_latency_ms": 0,
            "detections_count": len(result.bboxes_scores),
            "max_confidence": float(result.bboxes_scores.max()) if len(result.bboxes_scores) > 0 else 0.0,
        }
    
    return json.dumps(output)
