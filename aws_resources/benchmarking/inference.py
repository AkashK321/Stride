import os
import json
import torch
import io
import logging
from PIL import Image

# Configure logging for debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# This script runs INSIDE the SageMaker container
# Model weights are PRE-BUNDLED in model.tar.gz and extracted to /opt/ml/model/
# This is the standard approach for production ML deployments - no runtime downloads.

def model_fn(model_dir):
    """
    Loads models from pre-bundled weights in model_dir.
    
    SageMaker extracts model.tar.gz to /opt/ml/model/, so:
    - model_dir = /opt/ml/model
    - Weights are at /opt/ml/model/yolo11n.pt, etc.
    """
    model_type = os.environ.get("MODEL_TYPE", "yolov11-nano")
    logger.info(f"Loading model type: {model_type}")
    logger.info(f"Model directory: {model_dir}")
    logger.info(f"Contents of model_dir: {os.listdir(model_dir)}")
    
    try:
        # 1. YOLO v11 Nano - load from pre-bundled weights
        if model_type == "yolov11-nano":
            from ultralytics import YOLO
            model_path = os.path.join(model_dir, "yolo11n.pt")
            logger.info(f"Loading YOLO v11 Nano from: {model_path}")
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Weights not found at {model_path}")
            return YOLO(model_path)
        
        # 2. YOLO-NAS Small - load from pre-bundled weights or download to /tmp
        elif model_type == "yolo-nas":
            # Set all SuperGradients cache directories to writable /tmp
            os.environ["SG_CHECKPOINTS_DIR"] = "/tmp/sg_checkpoints"
            os.environ["TORCH_HOME"] = "/tmp/torch_home"
            os.makedirs("/tmp/sg_checkpoints", exist_ok=True)
            os.makedirs("/tmp/torch_home", exist_ok=True)
            
            from super_gradients.training import models
            
            local_weights = os.path.join(model_dir, "yolo_nas_s_coco.pth")
            
            if os.path.exists(local_weights):
                # Use pre-bundled weights (preferred)
                logger.info(f"Loading YOLO-NAS from pre-bundled weights: {local_weights}")
                model = models.get("yolo_nas_s", num_classes=80, checkpoint_path=local_weights)
            else:
                # Fallback: download to /tmp (if pre-bundling failed during CDK deploy)
                logger.warning(f"Pre-bundled weights not found, downloading to /tmp...")
                model = models.get("yolo_nas_s", pretrained_weights="coco")
            
            logger.info("YOLO-NAS loaded successfully")
            return model
            
        # 3. YOLO v11 Small - load from pre-bundled weights
        elif model_type == "yolo-realtime":
            from ultralytics import YOLO
            model_path = os.path.join(model_dir, "yolo11s.pt")
            logger.info(f"Loading YOLO v11 Small from: {model_path}")
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Weights not found at {model_path}")
            return YOLO(model_path)
        
        # Default fallback
        else:
            from ultralytics import YOLO
            model_path = os.path.join(model_dir, "yolo11n.pt")
            logger.warning(f"Unknown model type '{model_type}', falling back to yolo11n.pt")
            return YOLO(model_path)
            
    except Exception as e:
        logger.error(f"Failed to load model: {str(e)}")
        raise

def input_fn(request_body, request_content_type):
    if request_content_type == 'application/x-image':
        return Image.open(io.BytesIO(request_body))
    raise ValueError(f"Unsupported content type: {request_content_type}")

def predict_fn(input_data, model):
    """
    Run inference. Both Ultralytics and SuperGradients use similar patterns.
    """
    import time
    start = time.time()
    
    # Check if it's a SuperGradients model (YOLO-NAS)
    if hasattr(model, 'predict') and 'super_gradients' in str(type(model)):
        result = model.predict(input_data)
        inference_time = (time.time() - start) * 1000
        return {"result": result, "inference_ms": inference_time, "model_type": "yolo-nas"}
    else:
        # Ultralytics YOLO
        result = model(input_data)
        inference_time = (time.time() - start) * 1000
        return {"result": result, "inference_ms": inference_time, "model_type": "ultralytics"}

def output_fn(prediction, content_type):
    """
    Extract metrics from model output. Handles both Ultralytics and SuperGradients formats.
    """
    model_type = prediction.get("model_type", "ultralytics")
    result = prediction["result"]
    inference_ms = prediction.get("inference_ms", 0)
    
    # Ultralytics YOLO (v11 Nano and v11 Small/Realtime)
    if model_type == "ultralytics":
        res = result[0]  # Ultralytics returns a list
        output = {
            "model_latency_ms": res.speed.get('inference', inference_ms),
            "detections_count": len(res.boxes),
            "max_confidence": float(res.boxes.conf.max().item()) if len(res.boxes) > 0 else 0.0,
        }
    # SuperGradients YOLO-NAS
    else:
        # YOLO-NAS returns ImagesPredictions, access first image's prediction
        pred = result[0].prediction if hasattr(result, '__getitem__') else result.prediction
        output = {
            "model_latency_ms": inference_ms,
            "detections_count": len(pred.confidence) if hasattr(pred, 'confidence') else 0,
            "max_confidence": float(pred.confidence.max()) if hasattr(pred, 'confidence') and len(pred.confidence) > 0 else 0.0,
        }
    
    return json.dumps(output)
