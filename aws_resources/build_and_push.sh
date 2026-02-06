#!/bin/bash

# Build and Push YOLOv11 Inference Container to ECR
# This script must be run BEFORE deploying the CDK stack

set -e  # Exit on error

echo "============================================"
echo "Building YOLOv11 Inference Container"
echo "============================================"

# Get AWS account and region
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}
IMAGE_NAME="stride-yolov11-inference"
TAG="latest"

echo "AWS Account: $ACCOUNT"
echo "AWS Region: $REGION"
echo "Image Name: $IMAGE_NAME"
echo "Tag: $TAG"
echo ""

# ECR repository URI
ECR_URI="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$IMAGE_NAME"

echo "============================================"
echo "Step 1: ECR Login"
echo "============================================"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
echo "✅ ECR login successful"
echo ""

echo "============================================"
echo "Step 2: Building Docker Image"
echo "============================================"
cd sagemaker
docker build -t $IMAGE_NAME:$TAG .
echo "✅ Docker image built successfully"
echo ""

echo "============================================"
echo "Step 3: Tagging Image for ECR"
echo "============================================"
docker tag $IMAGE_NAME:$TAG $ECR_URI:$TAG
echo "✅ Image tagged: $ECR_URI:$TAG"
echo ""

echo "============================================"
echo "Step 4: Pushing to ECR"
echo "============================================"
docker push $ECR_URI:$TAG
echo "✅ Image pushed successfully!"
echo ""

echo "============================================"
echo "✅ BUILD AND PUSH COMPLETE!"
echo "============================================"
echo ""
echo "ECR Image URI: $ECR_URI:$TAG"
echo ""
echo "Next steps:"
echo "1. Verify the image in ECR console"
echo "2. Run 'git add . && git commit -m \"Add YOLOv11 SageMaker integration\"'"
echo "3. Run 'git push' to deploy the CDK stack"
echo ""
echo "The SageMaker endpoint will take ~10-15 minutes to deploy."
echo "============================================"
