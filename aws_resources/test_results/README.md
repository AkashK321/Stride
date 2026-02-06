# Test Results Directory

This directory contains inference results from testing the YOLOv11 SageMaker endpoint.

## Files

### Individual Detection Results
Each test image gets its own JSON file with detection results:
- `IMG_2825_detections.json`
- `IMG_2826_detections.json`
- `IMG_2827_detections.json`
- `IMG_2828_detections.json`
- `IMG_2829_detections.json`
- `IMG_2830_detections.json`
- `IMG_2831_detections.json`
- `IMG_2832_detections.json`
- `test_detections.json`

### Summary Report
- `summary.json` - Aggregated statistics from all test runs

## Running Tests

From the `aws_resources` directory:

```bash
# Using environment variable
export WS_API_URL="wss://your-api-id.execute-api.us-east-1.amazonaws.com"
python test_sagemaker_inference.py

# Or pass URL directly
python test_sagemaker_inference.py --ws-url "wss://your-api-id.execute-api.us-east-1.amazonaws.com/prod"
```

## Output Format

### Individual Detection File Example
```json
{
  "image": "IMG_2825.PNG",
  "timestamp": "2026-02-04T18:30:45.123456",
  "total_latency_ms": 234,
  "status": "success",
  "detections": [
    {
      "x": 150,
      "y": 200,
      "width": 180,
      "height": 320,
      "className": "person",
      "confidence": 0.94
    }
  ],
  "metadata": {
    "imageWidth": 1920,
    "imageHeight": 1080,
    "inferenceTimeMs": 125,
    "detectionCount": 1
  }
}
```

### Summary File Example
```json
{
  "test_run_timestamp": "2026-02-04T18:30:00.000000",
  "total_images": 9,
  "successful": 9,
  "failed": 0,
  "total_detections": 47,
  "average_total_latency_ms": 256,
  "average_inference_time_ms": 132,
  "average_detections_per_image": 5.2,
  "classes_detected": ["person", "chair", "table", "laptop", "bottle"],
  "images": [
    {
      "name": "IMG_2825.PNG",
      "status": "success",
      "total_latency_ms": 234,
      "detections": 5,
      "inference_time_ms": 128,
      "classes_found": ["person", "chair"]
    }
  ]
}
```

## Metrics Explained

- **total_latency_ms**: End-to-end time from sending image to receiving response (includes network, Lambda cold start, SageMaker inference)
- **inferenceTimeMs**: Time spent in SageMaker endpoint only (pure model inference time)
- **detectionCount**: Number of objects detected in the image
- **confidence**: Confidence score between 0.0 and 1.0

## Bounding Box Coordinates

All coordinates are in pixels relative to the original image:
- **x**: Top-left X coordinate
- **y**: Top-left Y coordinate
- **width**: Bounding box width
- **height**: Bounding box height

To draw a box: `(x, y)` to `(x+width, y+height)`

## COCO Classes

YOLOv11-nano is trained on the COCO dataset with 80 object classes including:
- person, bicycle, car, motorcycle, airplane, bus, train, truck, boat
- traffic light, fire hydrant, stop sign, parking meter, bench
- bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe
- backpack, umbrella, handbag, tie, suitcase, frisbee, skis, snowboard
- sports ball, kite, baseball bat, baseball glove, skateboard, surfboard
- tennis racket, bottle, wine glass, cup, fork, knife, spoon, bowl
- banana, apple, sandwich, orange, broccoli, carrot, hot dog, pizza
- donut, cake, chair, couch, potted plant, bed, dining table, toilet
- tv, laptop, mouse, remote, keyboard, cell phone, microwave, oven
- toaster, sink, refrigerator, book, clock, vase, scissors, teddy bear
- hair drier, toothbrush

Full list: https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/datasets/coco.yaml
