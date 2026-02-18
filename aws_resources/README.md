# AWS Resources Deployment Guide

This directory contains the CDK app for a two-stack architecture:

- `StrideSharedStack`: persistent shared infrastructure (SageMaker now, RDS later)
- `StrideStack-{branch}`: branch-specific app infrastructure (Lambda/API/Cognito/DynamoDB)

## One-time setup

```bash
cd aws_resources
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

If CDK CLI is missing:

```bash
npm install -g aws-cdk
```

## Stack model

`app.py` always defines both stacks. You must deploy by explicit stack name.

- Shared stack is manual and persistent.
- Branch stacks are CI/CD-managed for feature branches.

Do not run `cdk deploy --all` in CI because it would include shared infra.

## Deploy shared stack (manual)

Use this when creating/updating shared singleton resources.

```bash
cd aws_resources
source .venv/bin/activate
BRANCH_NAME=main cdk -a "python3 app.py" deploy StrideSharedStack --require-approval never
```

Preview changes before deploy:

```bash
BRANCH_NAME=main cdk -a "python3 app.py" diff StrideSharedStack
```

## Deploy main app stack (`StrideStack`)

`main` branch resolves to `StrideStack`.

```bash
cd aws_resources
source .venv/bin/activate
BRANCH_NAME=main cdk -a "python3 app.py" deploy StrideStack --require-approval never
```

## Deploy a branch stack manually (optional)

Branch name must follow:

`<tag>/<issue-number>-<description>`

Example:

```bash
BRANCH_NAME=feature/119-sagemaker-resource-management
STACK_NAME=$(BRANCH_NAME="$BRANCH_NAME" python3 -c "import os; from app import sanitize_branch_name; print(sanitize_branch_name(os.environ['BRANCH_NAME']))")
cdk -a "python3 app.py" deploy "$STACK_NAME" --require-approval never
```

## CI/CD behavior

- Push to feature branch:
  - Deploys only `StrideStack-{branch}`.
- Push to `main`:
  - Deploys `StrideStack`.
- `StrideSharedStack`:
  - Never auto-deployed by CI.
  - Deployed manually only.
- Cleanup workflow:
  - Deletes branch stacks after merge.
  - Explicitly protects `StrideSharedStack` from deletion.

## Verify deployments

List available stacks:

```bash
cdk -a "python3 app.py" ls
```

Synthesize one stack:

```bash
BRANCH_NAME=main cdk -a "python3 app.py" synth StrideSharedStack
```

## Important safety notes

- Do not destroy `StrideSharedStack` from CI/CD.
- Avoid `cdk deploy --all` for automated pipelines.
- Shared SageMaker endpoint incurs cost while running.
