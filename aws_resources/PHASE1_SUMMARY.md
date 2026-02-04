# Phase 1: CDK Infrastructure Setup - COMPLETE ✅

## What Was Added to `cdk_stack.py`

### 1. **ECR Repository** ✅
- **Name**: `stride-yolov11-inference`
- **Purpose**: Stores the Docker container image with YOLOv11 model
- **Lifecycle Policy**: Keeps last 5 images (automatic cleanup)
- **Removal Policy**: DESTROY (for dev/testing - change to RETAIN for production)

### 2. **IAM Role for SageMaker** ✅
- **Service Principal**: `sagemaker.amazonaws.com`
- **Permissions**: `AmazonSageMakerFullAccess`
- **Additional**: ECR pull permissions for the inference container

### 3. **SageMaker Model** ✅
- **Name**: `stride-yolov11-nano-model`
- **Container**: Points to ECR image URI (will be populated after Docker build)
- **Mode**: SingleModel
- **Note**: No S3 model data needed - weights are baked into container

### 4. **SageMaker Endpoint Configuration** ✅
- **Name**: `stride-yolov11-nano-config`
- **Instance Type**: `ml.g4dn.xlarge` (GPU instance)
- **Instance Count**: 1
- **Variant Weight**: 100% of traffic to this model

### 5. **SageMaker Endpoint** ✅
- **Name**: `stride-yolov11-nano-endpoint`
- **References**: Endpoint configuration above
- **This is what Lambda will call for inference**

### 6. **Lambda Permissions & Environment** ✅
- **IAM Policy**: `sagemaker:InvokeEndpoint` permission added to `ObjectDetectionHandler`
- **Environment Variables**:
  - `SAGEMAKER_ENDPOINT_NAME = stride-yolov11-nano-endpoint`
  - `AWS_REGION_SAGEMAKER = us-east-1` (dynamically set)

### 7. **CloudFormation Outputs** ✅
Added outputs for easy reference:
- `ECRRepositoryURI` - Where to push Docker image
- `SageMakerEndpointName` - Endpoint name for testing
- `SageMakerEndpointArn` - Full ARN for permissions

---

## Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    AWS Account                          │
│                                                          │
│  ┌──────────────────┐                                   │
│  │   ECR Repository │                                   │
│  │ stride-yolov11-  │  ← Docker image will be pushed here│
│  │    inference     │    (in Phase 2)                   │
│  └──────────────────┘                                   │
│           │                                              │
│           │ (pulls image)                                │
│           ↓                                              │
│  ┌──────────────────────────────────────────┐           │
│  │      SageMaker Model                     │           │
│  │  stride-yolov11-nano-model               │           │
│  │  - Points to ECR image                   │           │
│  │  - Uses SageMaker execution role         │           │
│  └──────────────────────────────────────────┘           │
│           │                                              │
│           ↓                                              │
│  ┌──────────────────────────────────────────┐           │
│  │  SageMaker Endpoint Configuration        │           │
│  │  stride-yolov11-nano-config              │           │
│  │  - Instance: ml.g4dn.xlarge (GPU)        │           │
│  │  - Count: 1                              │           │
│  └──────────────────────────────────────────┘           │
│           │                                              │
│           ↓                                              │
│  ┌──────────────────────────────────────────┐           │
│  │      SageMaker Endpoint                  │           │
│  │  stride-yolov11-nano-endpoint            │           │
│  │  ✨ This is the inference endpoint ✨     │           │
│  └──────────────────────────────────────────┘           │
│           ↑                                              │
│           │ (invokes)                                    │
│  ┌──────────────────────────────────────────┐           │
│  │  Lambda: ObjectDetectionHandler          │           │
│  │  - Has sagemaker:InvokeEndpoint perm     │           │
│  │  - Env var: SAGEMAKER_ENDPOINT_NAME      │           │
│  └──────────────────────────────────────────┘           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## What Happens When You Deploy (Git Push)

### ⚠️ IMPORTANT: Don't Deploy Yet!

The CDK stack will **fail** if deployed now because:
- The ECR repository will be created ✅
- BUT the SageMaker Model references a Docker image that doesn't exist yet ❌
- SageMaker Endpoint creation will fail ❌

### Correct Deployment Order:

1. **First**: Complete Phase 2 (build Docker container)
2. **Then**: Run `./build_and_push.sh` to push image to ECR
3. **Finally**: Git push to deploy CDK stack

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| CDK Stack Updated | ✅ Complete | No syntax errors |
| ECR Repository Defined | ✅ Ready | Will be created on deploy |
| SageMaker Resources Defined | ✅ Ready | Waiting for Docker image |
| Lambda Permissions | ✅ Ready | Can invoke SageMaker |
| Environment Variables | ✅ Ready | Lambda knows endpoint name |

---

## Next Steps

### Phase 2A: Create Docker Container
- [ ] Create `aws_resources/sagemaker/` directory
- [ ] Write Dockerfile
- [ ] Write inference.py (YOLOv11 handler)
- [ ] Write requirements.txt
- [ ] Create build_and_push.sh script

### Phase 2B: Update Kotlin Backend
- [ ] Update build.gradle.kts (add SageMaker SDK)
- [ ] Create data models (BoundingBox, InferenceResult)
- [ ] Create SageMakerClient service
- [ ] Update ObjectDetectionHandler to call SageMaker

---

## Testing the Stack (After Phase 2)

After building the Docker image and deploying:

```bash
# Check CloudFormation outputs
aws cloudformation describe-stacks \
  --stack-name <your-stack-name> \
  --query 'Stacks[0].Outputs'

# Check SageMaker endpoint status
aws sagemaker describe-endpoint \
  --endpoint-name stride-yolov11-nano-endpoint

# Should show: "EndpointStatus": "InService"
```

---

## Resources Created

When deployed, these AWS resources will be created:
1. ECR Repository (immediate)
2. IAM Role for SageMaker (immediate)
3. SageMaker Model (waits for ECR image)
4. SageMaker Endpoint Configuration (depends on model)
5. SageMaker Endpoint (depends on config, takes ~10-15 minutes)

**Estimated Deployment Time**: 10-15 minutes (mostly SageMaker endpoint creation)

---

## Cost Estimate

| Resource | Cost |
|----------|------|
| ECR Storage (~3GB) | ~$0.30/month |
| SageMaker ml.g4dn.xlarge | ~$0.74/hour (~$540/month if running 24/7) |
| Lambda Invocations | ~$0.20/million requests |
| API Gateway WebSocket | ~$1.00/million messages |

**Note**: SageMaker endpoint is the main cost - consider using auto-scaling or serverless inference for production.

---

## Phase 1 Validation

✅ **CDK stack updated successfully**  
✅ **No linter errors**  
✅ **All imports added**  
✅ **SageMaker resources defined**  
✅ **Lambda permissions configured**  
✅ **Environment variables set**  
✅ **CloudFormation outputs added**  

**Phase 1 is COMPLETE and ready for Phase 2!**
