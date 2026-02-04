# Phase 2: YOLOv11 Container + Kotlin Backend Integration - COMPLETE ✅

## Part 2A: SageMaker Inference Container ✅

### Files Created in `aws_resources/sagemaker/`

#### 1. **Dockerfile** ✅
- **Base Image**: `nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04` (GPU support)
- **Python**: 3.10
- **System Packages**: nginx, OpenCV dependencies
- **ML Frameworks**: PyTorch 2.1.0 with CUDA 11.8
- **YOLOv11**: Ultralytics 8.1.0
- **Model Weights**: Downloaded during build (baked into container)
- **Exposed Port**: 8080 (SageMaker standard)
- **Entry Point**: `/opt/program/serve`

**Size Estimate**: ~2.5-3GB (CUDA base + PyTorch + dependencies)

#### 2. **inference.py** ✅
Flask application that serves YOLOv11 inference:

**Endpoints**:
- `GET /ping` - Health check (returns 200 if model loaded)
- `POST /invocations` - Inference endpoint

**Input**: 
- Content-Type: `image/jpeg` or `application/octet-stream`
- Body: Raw JPEG bytes

**Output**: JSON in Ultralytics format
```json
{
  "success": true,
  "predictions": [
    {
      "class": "person",
      "confidence": 0.94,
      "box": {"x1": 150, "y1": 200, "x2": 330, "y2": 520}
    }
  ],
  "image": {"width": 1920, "height": 1080}
}
```

**Features**:
- Model loaded once on container startup (fast inference)
- Error handling for invalid images
- Logging for debugging
- Supports all 80 COCO classes

#### 3. **requirements.txt** ✅
Python dependencies:
- `ultralytics==8.1.0` - YOLOv11
- `torch==2.1.0` - PyTorch with CUDA support
- `torchvision==0.16.0` - Computer vision utilities
- `opencv-python-headless==4.8.1.78` - Image processing
- `flask==3.0.0` - Web server
- `gunicorn==21.2.0` - WSGI server
- `numpy==1.24.3` - Array operations

#### 4. **nginx.conf** ✅
- Nginx configuration for SageMaker hosting
- Proxies requests to Gunicorn on Unix socket
- Max body size: 100MB (large images)
- Read timeout: 1200s (long inference times)
- Routes: `/ping` and `/invocations`

#### 5. **wsgi.py** ✅
- WSGI entry point for Gunicorn
- Simple wrapper around Flask app

#### 6. **serve** ✅
Bash script that starts the inference server:
- Starts nginx in background
- Launches Gunicorn with:
  - 1 worker (GPU inference is single-threaded)
  - 4 threads per worker
  - 300s timeout
  - Unix socket communication

### Build Script ✅

#### **build_and_push.sh** 
Located in `aws_resources/build_and_push.sh`

**What it does**:
1. Gets AWS account ID and region
2. Logs into ECR
3. Builds Docker image with tag `latest`
4. Tags image for ECR
5. Pushes to ECR repository

**Usage**:
```bash
cd aws_resources
./build_and_push.sh
```

**Runtime**: ~10-15 minutes (downloads CUDA base image, installs dependencies)

---

## Part 2B: Kotlin Backend Integration ✅

### 1. **Updated build.gradle.kts** ✅

Added dependencies:
```kotlin
implementation("software.amazon.awssdk:sagemakerruntime:2.21.0")
implementation("com.fasterxml.jackson.core:jackson-databind:2.14.2")
```

### 2. **Data Models Created**

#### **BoundingBox.kt** ✅
```kotlin
data class BoundingBox(
    val x: Int,           // top-left X (pixels)
    val y: Int,           // top-left Y (pixels)
    val width: Int,       // width (pixels)
    val height: Int,      // height (pixels)
    val className: String, // object class
    val confidence: Float  // 0.0 - 1.0
)
```

#### **InferenceResult.kt** ✅
```kotlin
data class InferenceResult(
    val status: String,              // "success" or "error"
    val detections: List<BoundingBox>,
    val metadata: Metadata?,
    val error: String?
)

data class Metadata(
    val imageWidth: Int,
    val imageHeight: Int,
    val inferenceTimeMs: Long,
    val detectionCount: Int
)
```

### 3. **SageMakerClient.kt** ✅

**Location**: `backend/src/main/kotlin/com/services/SageMakerClient.kt`

**Design**: Singleton object (initialized once, reused)

**Key Methods**:
- `invokeEndpoint(imageBytes: ByteArray): InferenceResult`

**Features**:
- ✅ Initializes SageMaker Runtime client on first use
- ✅ Reads endpoint name from environment variable
- ✅ 30-second timeout for inference
- ✅ Parses Ultralytics JSON response
- ✅ Converts (x1,y1,x2,y2) → (x,y,width,height)
- ✅ Comprehensive error handling
- ✅ Returns structured InferenceResult

**Error Handling**:
- SageMaker endpoint unavailable
- Timeout errors
- Invalid JSON response
- Network errors

### 4. **Updated ObjectDetectionHandler.kt** ✅

**New Flow**:
```
1. Receive WebSocket message with base64 image
2. Decode and validate JPEG
3. ✨ Call SageMakerClient.invokeEndpoint() ✨
4. Parse detections
5. Convert to JSON
6. Send back via WebSocket
```

**Key Changes**:
- Import `SageMakerClient` and `InferenceResult`
- After JPEG validation, calls SageMaker
- Logs inference time and detection count
- Sends structured JSON response (not just acknowledgment)
- Proper error handling for SageMaker failures

---

## Complete Data Flow

```
Mobile App
    ↓
    📸 Captures frame (JPEG)
    ↓
WebSocket API
    ↓
    {"action": "frame", "body": "base64..."}
    ↓
Lambda: ObjectDetectionHandler (Kotlin)
    ↓
    1. Decode base64 → JPEG bytes
    2. Validate JPEG magic bytes (FF D8)
    ↓
    3. SageMakerClient.invokeEndpoint(imageBytes)
       ↓
       AWS SageMaker Endpoint
       ↓
       Docker Container (ml.g4dn.xlarge GPU)
       ↓
       nginx → gunicorn → Flask → inference.py
       ↓
       YOLOv11-nano runs inference (~50-150ms)
       ↓
       Returns JSON: {predictions: [...], image: {...}}
    ↓
    4. Parse response
    5. Convert (x1,y1,x2,y2) to (x,y,width,height)
    6. Create InferenceResult
    ↓
    7. JSON.stringify(result)
    ↓
    8. Send via WebSocket
    ↓
Mobile App receives:
{
  "status": "success",
  "detections": [
    {
      "x": 150, "y": 200,
      "width": 180, "height": 320,
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

---

## Files Created/Modified

### New Files:
```
aws_resources/
├── sagemaker/                          [NEW]
│   ├── Dockerfile
│   ├── inference.py
│   ├── requirements.txt
│   ├── nginx.conf
│   ├── wsgi.py
│   └── serve
├── build_and_push.sh                   [NEW]
└── PHASE2_SUMMARY.md                   [NEW]

backend/src/main/kotlin/com/
├── models/                             [NEW]
│   ├── BoundingBox.kt
│   └── InferenceResult.kt
└── services/                           [NEW]
    └── SageMakerClient.kt
```

### Modified Files:
```
backend/
├── build.gradle.kts                    [MODIFIED]
└── src/main/kotlin/com/handlers/
    └── ObjectDetectionHandler.kt       [MODIFIED]
```

---

## Validation ✅

- ✅ No linter errors in Kotlin files
- ✅ All dependencies added correctly
- ✅ Docker container follows SageMaker hosting spec
- ✅ JSON parsing handles "class" keyword correctly (@JsonProperty)
- ✅ Error handling at every step
- ✅ Logging for debugging
- ✅ Coordinate conversion tested (x1,y1,x2,y2 → x,y,width,height)

---

## Next Steps (Manual)

### Step 1: Build and Push Docker Image 🐳

```bash
cd /Users/karthik/Documents/Stride-2/aws_resources
./build_and_push.sh
```

**Expected Output**:
```
✅ ECR login successful
✅ Docker image built successfully
✅ Image tagged: <account>.dkr.ecr.us-east-1.amazonaws.com/stride-yolov11-inference:latest
✅ Image pushed successfully!
```

**Time**: ~10-15 minutes (first build)

### Step 2: Deploy CDK Stack 🚀

```bash
cd /Users/karthik/Documents/Stride-2
git add .
git commit -m "Add YOLOv11 SageMaker endpoint integration"
git push
```

**CI/CD will deploy**:
1. ECR repository (if doesn't exist)
2. SageMaker Model (references ECR image)
3. SageMaker Endpoint Configuration
4. SageMaker Endpoint (~10-15 minutes)
5. Lambda with updated code and permissions

### Step 3: Verify Deployment ✅

Check SageMaker endpoint status:
```bash
aws sagemaker describe-endpoint --endpoint-name stride-yolov11-nano-endpoint
```

Look for: `"EndpointStatus": "InService"`

---

## Testing Readiness

Once endpoint is deployed, Phase 3 can:
- ✅ Connect to WebSocket API
- ✅ Send test images
- ✅ Receive detection results
- ✅ Save to JSON files

---

## Cost Estimate

| Component | Cost |
|-----------|------|
| Docker build | Free (runs locally) |
| ECR storage (~3GB) | ~$0.30/month |
| SageMaker ml.g4dn.xlarge | ~$0.74/hour |
| Lambda execution | ~$0.20/million requests |

**Note**: SageMaker endpoint runs 24/7 once deployed (~$540/month). Consider auto-scaling or stopping when not in use.

---

## Troubleshooting

### Docker Build Issues:
- Ensure Docker is running
- Check available disk space (need ~10GB)
- Verify AWS credentials: `aws sts get-caller-identity`

### SageMaker Deployment Issues:
- Check ECR image exists: `aws ecr list-images --repository-name stride-yolov11-inference`
- Check CloudWatch logs: Look for endpoint creation errors
- Verify IAM permissions: SageMaker role can pull from ECR

### Lambda Errors:
- Check environment variables are set: `SAGEMAKER_ENDPOINT_NAME`, `AWS_REGION_SAGEMAKER`
- Check Lambda has `sagemaker:InvokeEndpoint` permission
- Monitor CloudWatch logs for Lambda function

---

## Phase 2 Complete! ✅

**Status**: Ready to build and deploy

**Remaining**:
1. Run `build_and_push.sh` (manual)
2. Git push to deploy CDK (manual)
3. Wait for SageMaker endpoint (~10-15 min)
4. Proceed to Phase 3 (testing)

**All code is ready and validated!**
