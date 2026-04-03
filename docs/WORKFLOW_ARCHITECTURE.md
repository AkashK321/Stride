# GitHub Actions Workflow Architecture

## Overview

This project uses independent workflows for CI and deploy concerns:

1. **PR Validation**: fast checks on pull requests (no AWS deployment)
2. **Backend + Infrastructure**: push-based backend build and AWS deploy
3. **Frontend Tests**: push-based frontend feedback
4. **Inference Server Tests**: validation for local HTTP inference tooling

---

## Workflow Details

### 1) PR Validation

**File:** `.github/workflows/pr-validation.yaml`  
**Trigger:** pull request events when relevant paths change.

Runs backend build/unit checks, database tests, and frontend checks without deploying infrastructure.

### 2) Frontend Tests

**File:** `.github/workflows/frontend-tests.yaml`  
**Trigger:** push events for frontend-related changes.

Runs frontend test suite for fast feedback during development.

### 3) Backend Build + Infrastructure Deploy

**Files:**
- `.github/workflows/backend-build.yaml`
- `.github/workflows/infrastructure-deploy.yaml`

**Trigger:** pushes to branches (and manual dispatch options where configured).

Flow:
1. Build Kotlin backend JAR.
2. Run backend tests.
3. Deploy infrastructure (`StrideSharedStack` + branch stack) via CDK.
4. Read stack outputs.
5. Populate shared RDS schema/data.
6. Run integration tests.

Object detection inference in deployed environments is HTTP-based via Lambda env (`INFERENCE_HTTP_URL`) when configured.

### 4) Inference Server Tests

**File:** `.github/workflows/inference-server.yaml`  
**Trigger:** changes under `inference_server/`.

Validates the local FastAPI inference server contract and test suite.

---

## Trigger Summary

| Workflow | Manual | Auto on Push | Auto on PR | Notes |
|----------|--------|--------------|------------|-------|
| `pr-validation.yaml` | No | No | Yes | Fast CI validation; no deploy |
| `frontend-tests.yaml` | No | Yes | No | Frontend unit/static checks |
| `backend-build.yaml` | Yes | Yes | No | Builds backend and calls deploy workflow |
| `infrastructure-deploy.yaml` | Yes | Via backend-build | No | Deploys shared + branch stacks |
| `inference-server.yaml` | No | Yes | No | Inference server-only checks |

---

## Notes for Developers

- Backend deploy changes should be validated through `backend-build.yaml` + `infrastructure-deploy.yaml`.
- The repository no longer includes a SageMaker build/deploy workflow.
- Local inference iteration happens through `inference_server/` and HTTP `/invocations` contract tests.

### For Infrastructure Changes
```bash
# Update CDK stack
git add aws_resources/cdk/
git commit -m "Update infrastructure wiring"
git push
# backend-build -> infrastructure-deploy runs automatically
```

---

## Common Questions

### Q: What's the difference between frontend-tests.yaml and pr-validation.yaml?
**A:** 
- `frontend-tests.yaml` runs on **push events** for fast feedback during development
- `pr-validation.yaml` runs on **pull request events** and includes both static analysis (TypeScript/ESLint) and unit tests
- Both workflows can run the same tests, but PR validation is more comprehensive

### Q: How do I track deployment status?
Use GitHub Actions UI or:

```bash
gh run list
gh run list --workflow=infrastructure-deploy.yaml
```

---

## Troubleshooting

### Problem: Inference results are empty in deployed object-detection responses
Check:
1. `INFERENCE_HTTP_URL` is set on the deployed object-detection Lambda.
2. The URL is reachable from Lambda networking.
3. If session gating is enabled, `INFERENCE_HTTP_SECRET` matches the active inference server token.

### Problem: Deploy succeeded but integration tests fail
Check:
1. REST and WebSocket outputs in `cdk-outputs.json`.
2. Shared RDS secret extraction (`RdsSecretArn`) in deploy logs.
3. Test environment variables passed by `integration-tests.yaml`.