# GitHub Actions Workflow Architecture

## Overview

This project uses **separate, independent workflows** for different concerns:

1. **PR Validation** - Fast CI checks on pull requests (no deployment)
2. **Backend + Infrastructure** - Runs on every push, deploys to AWS
3. **Frontend Tests** - Runs on push events for fast development feedback
4. **SageMaker Docker Image** - Runs only when inference code changes

---

## Workflow Independence

### ✅ Workflows Do NOT Interfere With Each Other

- Each workflow has its own job
- They don't call each other
- They can run independently
- No risk of conflicts or duplicate deployments

---

## Workflow Details

### 1. PR Validation

**File:**
- `.github/workflows/pr-validation.yaml`

**Trigger:** Pull request events (opened, synchronize, reopened) when files in `aws_resources/**`, `frontend/**`, or `.github/workflows/**` change

**What it does:**
```
Pull Request Event
    ↓
pr-validation.yaml
    ├─ Backend Build (if aws_resources/** changed)
    │   └─ Builds Kotlin JAR
    ├─ Backend Unit Tests (if aws_resources/** changed)
    │   └─ Runs JUnit tests, publishes results
    ├─ Frontend Static Analysis (if frontend/** changed)
    │   ├─ TypeScript type-check (tsc --noEmit)
    │   └─ ESLint (expo lint)
    └─ Frontend Unit Tests (if frontend/** changed)
        └─ Runs Jest tests with coverage, publishes results
```

**Key Point:** This workflow provides fast feedback on PRs without any deployment. All validation runs in parallel for quick results.

---

### 2. Frontend Tests (Push Events)

**File:**
- `.github/workflows/frontend-tests.yaml`

**Trigger:** Push events to any branch when files in `frontend/**` or `.github/workflows/**` change

**What it does:**
```
Push Event (to any branch)
    ↓
frontend-tests.yaml
    ├─ Install dependencies (npm ci)
    ├─ Run unit tests (Jest with coverage)
    └─ Publish test results
```

**Key Point:** Provides fast feedback during development. PR validation is handled separately by `pr-validation.yaml`.

---

### 3. Backend Build & Infrastructure Deploy

**Files:**
- `.github/workflows/backend-build.yaml`
- `.github/workflows/infrastructure-deploy.yaml`

**Trigger:** Every push to any branch

**What it does:**
```
Push code
    ↓
backend-build.yaml
    ├─ Builds Kotlin backend (JAR)
    ├─ Runs unit tests
    └─ Calls infrastructure-deploy.yaml
        ↓
infrastructure-deploy.yaml
    ├─ Deploys CDK stack
    ├─ Creates/updates Lambda
    ├─ Creates/updates API Gateway
    ├─ Creates/updates WebSocket API
    └─ Creates/updates SageMaker Endpoint (references Docker image)
```

**Key Point:** This workflow does NOT build the Docker image. It only references the image that already exists in ECR.

---

### 4. SageMaker Docker Image Build

**File:**
- `.github/workflows/build-sagemaker-image.yaml`

**Trigger:**
- Manual (workflow_dispatch) - for first build
- Automatic when files change in `aws_resources/sagemaker/**`

**What it does:**
```
Trigger (manual or file change)
    ↓
build-sagemaker-image.yaml
    ├─ Builds Docker image (CUDA + YOLOv11)
    ├─ Pushes to ECR
    └─ STOPS HERE (no deployment)
```

**Key Point:** This workflow ONLY builds and pushes the Docker image. It does NOT deploy anything.

---

## How They Work Together

### Initial Setup (ONE TIME)

```bash
# Step 1: Build Docker image FIRST (manual trigger)
# Go to GitHub Actions → Build and Push SageMaker Docker Image → Run workflow
# Wait ~10-15 minutes
# Result: Docker image in ECR

# Step 2: Deploy infrastructure (automatic on push)
git push
# backend-build.yaml → infrastructure-deploy.yaml runs
# CDK creates SageMaker endpoint using Docker image from ECR
# Wait ~10-15 minutes
# Result: Full stack deployed
```

### Normal Development (ONGOING)

```bash
# Scenario A: Backend code changes (most common)
# Edit: ObjectDetectionHandler.kt, models, etc.
git push
# ↓ backend-build.yaml runs (3-5 min)
# ↓ infrastructure-deploy.yaml runs (10-15 min)
# ✅ Backend updated, infrastructure updated
# ℹ️ Docker image unchanged (still uses existing image in ECR)

# Scenario B: Inference code changes (occasional)
# Edit: sagemaker/inference.py
git push
# ↓ build-sagemaker-image.yaml runs (10-15 min) - AUTOMATIC
# ✅ New Docker image in ECR
# ℹ️ Need to redeploy CDK to use new image? See below

# Scenario C: Both changed (rare)
# Edit both backend and inference code
git push
# ↓ BOTH workflows run in parallel
# ↓ build-sagemaker-image.yaml (builds Docker)
# ↓ backend-build.yaml → infrastructure-deploy.yaml (deploys stack)
# ✅ Both updated
```

---

## Important: SageMaker Endpoint Updates

### When Docker Image Changes

If you update the inference code and push a new Docker image:

1. **New image pushed to ECR** ✅ (automatic)
2. **SageMaker endpoint still uses OLD image** ⚠️

**Why?** SageMaker endpoint doesn't automatically update when ECR image changes.

**Solution:** Update the endpoint:

**Option A: Redeploy CDK (Recommended)**
```bash
# After Docker build completes, trigger CDK deploy
git commit --allow-empty -m "Trigger CDK redeploy for new Docker image"
git push
```

**Option B: Update Endpoint Manually**
```bash
# Force endpoint update
aws sagemaker update-endpoint \
  --endpoint-name stride-yolov11-nano-endpoint \
  --endpoint-config-name stride-yolov11-nano-config
```

**Option C: Delete and Recreate (for major changes)**
```bash
# Delete endpoint
aws sagemaker delete-endpoint --endpoint-name stride-yolov11-nano-endpoint

# Push to trigger CDK redeploy
git push
```

---

## Workflow Triggers Summary

| Workflow | Manual | Auto on Push | Auto on PR | Files Watched |
|----------|--------|--------------|------------|---------------|
| pr-validation.yaml | ❌ | ❌ | ✅ | `aws_resources/**`, `frontend/**`, `.github/workflows/**` |
| frontend-tests.yaml | ❌ | ✅ | ❌ | `frontend/**`, `.github/workflows/**` |
| backend-build.yaml | ✅ | ✅ | ❌ | All files |
| infrastructure-deploy.yaml | ✅ | ✅ (via backend-build) | ❌ | - |
| build-sagemaker-image.yaml | ✅ | ✅ | ❌ | `sagemaker/**` only |

---

## Best Practices for Team

### For Frontend Developers
```bash
# Normal workflow - push and get fast feedback
git add frontend/
git commit -m "Add new component"
git push
# ✅ Frontend tests run automatically on push

# Create PR
gh pr create
# ✅ PR validation runs: TypeScript check, ESLint, unit tests
```

### For Backend Developers
```bash
# Normal workflow - just push
git add backend/src/
git commit -m "Update Lambda handler"
git push
# ✅ Backend builds and deploys automatically
```

### For ML/Inference Developers
```bash
# Update inference code
git add aws_resources/sagemaker/
git commit -m "Improve detection accuracy"
git push
# ✅ Docker image builds automatically

# Then trigger CDK redeploy to use new image
git commit --allow-empty -m "Deploy new inference model"
git push
```

### For Infrastructure Changes
```bash
# Update CDK stack
git add aws_resources/cdk/
git commit -m "Add new SageMaker configuration"
git push
# ✅ Infrastructure updates automatically
```

---

## Common Questions

### Q: What's the difference between frontend-tests.yaml and pr-validation.yaml?
**A:** 
- `frontend-tests.yaml` runs on **push events** for fast feedback during development
- `pr-validation.yaml` runs on **pull request events** and includes both static analysis (TypeScript/ESLint) and unit tests
- Both workflows can run the same tests, but PR validation is more comprehensive

### Q: Will Docker build slow down my backend deployments?
**A:** No! Docker build only runs when `sagemaker/` files change. Regular backend pushes skip it entirely.

### Q: What if I only want to build Docker without deploying?
**A:** Perfect! Just update files in `sagemaker/` and push. The build workflow runs independently.

### Q: Can I test Docker changes without affecting production?
**A:** Yes! Use feature branches:
```bash
git checkout -b feature/better-inference
# Edit sagemaker/inference.py
git push
# Creates separate test stack with new Docker image
```

### Q: What if Docker build fails?
**A:** Backend deployment continues normally. Fix Docker build and re-run manually.

---

## Monitoring Workflows

### View All Workflow Runs
```bash
# Via GitHub UI
# Go to: https://github.com/<your-org>/Stride-2/actions

# Via CLI
gh run list
```

### Check Specific Workflow
```bash
# Docker build status
gh run list --workflow=build-sagemaker-image.yaml

# Infrastructure deploy status  
gh run list --workflow=infrastructure-deploy.yaml
```

---

## Troubleshooting

### Problem: SageMaker endpoint won't start
**Check:**
1. Did Docker build succeed?
2. Is image in ECR?
3. Check CloudWatch logs

```bash
# Verify image exists
aws ecr describe-images --repository-name stride-yolov11-inference

# Check endpoint status
aws sagemaker describe-endpoint --endpoint-name stride-yolov11-nano-endpoint
```

### Problem: Endpoint uses old inference code
**Solution:** Endpoint doesn't auto-update. Redeploy:
```bash
git commit --allow-empty -m "Force CDK redeploy"
git push
```

---

## Summary

✅ **PR validation workflow** - Fast CI checks without deployment  
✅ **Frontend testing** - Separate workflows for push (dev feedback) and PR (validation)  
✅ **Backend + Infrastructure** - Automated deployment on push  
✅ **Docker builds only when needed** - SageMaker image builds independently  
✅ **No interference between workflows** - Each runs independently  
✅ **Fast feedback** - Parallel execution for quick results  

**Result:** Clean separation of concerns with comprehensive CI/CD coverage!
