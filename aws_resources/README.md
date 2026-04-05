# AWS Resources Deployment Guide

This directory contains the CDK app for a two-stack architecture:

- `StrideSharedStack`: persistent shared infrastructure—**one Amazon RDS (PostgreSQL) instance** for map/navigation data, shared by every branch stack
- `StrideStack` / `StrideStack-{branch}`: branch-specific app infrastructure (Lambda/API/Cognito/DynamoDB). Static and live navigation Lambdas receive **DB connection settings from the shared RDS** via CDK cross-stack references (no per-branch database)

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

`app.py` always defines **both** stacks. The branch stack **depends on** `StrideSharedStack` (deploy order is enforced in CDK and in CI).

**Deploy order:** `StrideSharedStack` first (or in the **same** `cdk deploy` invocation listing both stacks—CDK respects the dependency). The shared database must exist before navigation Lambdas can connect.

- **CI:** the Infrastructure Deploy workflow runs `cdk deploy StrideSharedStack <branch-stack-name>` so shared RDS and the branch stack deploy together on pushes that trigger backend deploy.
- **Manual:** you can deploy only `StrideSharedStack` when changing shared infra, or deploy both stacks when bringing up a new environment.

Do not run `cdk deploy --all` in automation unless you intend to deploy every stack the app defines; prefer **explicit stack names**.

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

`main` branch resolves to `StrideStack`. Deploy **shared + main** together (recommended):

```bash
cd aws_resources
source .venv/bin/activate
BRANCH_NAME=main cdk -a "python3 app.py" deploy StrideSharedStack StrideStack --require-approval never
```

If `StrideSharedStack` is already current, deploying only `StrideStack` is enough.

## Deploy a branch stack manually (optional)

Branch name must follow:

`<tag>/<issue-number>-<description>`

Example:

```bash
BRANCH_NAME=feature/119-http-inference-routing
STACK_NAME=$(BRANCH_NAME="$BRANCH_NAME" python3 -c "import os; from app import sanitize_branch_name; print(sanitize_branch_name(os.environ['BRANCH_NAME']))")
cdk -a "python3 app.py" deploy StrideSharedStack "$STACK_NAME" --require-approval never
```

## CI/CD behavior

- **Infrastructure Deploy** (`.github/workflows/infrastructure-deploy.yaml`), when run after a successful backend build:
  - Deploys **`StrideSharedStack` and the branch stack** in one `cdk deploy` (shared RDS secret and branch API outputs are both written to `cdk-outputs.json`).
  - Runs shared **RDS schema** and **floor/map population** using `RdsSecretArn` from the shared stack (idempotent).
- **Shared Stack Deploy** (manual `workflow_dispatch`): optional path to deploy or repair **only** `StrideSharedStack` and initialize/populate the shared DB—see that workflow for one-off maintenance.
- **Cleanup** workflow: deletes branch stacks after merge; **does not** delete `StrideSharedStack`.

### Bearing alignment calibration (Issue 171)

`aws_resources/data_population/populate_floor_data.py` writes true-compass `MapEdges.Bearing` values using:

- `TRUE_NORTH_OFFSET_DEGREES` (default `51`)
- `BEARING_HORIZONTAL_FLIP` (default `true`)
- `BEARING_HORIZONTAL_MODE` (`bands` or `cones`, default `bands`)

CI workflows set these variables on the floor-data population step so production values are reproducible. For existing deployed data, use:

```bash
cd aws_resources/data_population
python recompute_edge_bearings.py --dry-run
python recompute_edge_bearings.py --apply
```

For on-site validation checklist generation:

```bash
cd aws_resources/data_population
python list_edges_for_bearing_check.py --all
```

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

- Do not destroy `StrideSharedStack` from CI/CD; it holds the **shared** map database used by all environments.
- Avoid `cdk deploy --all` for automated pipelines unless you explicitly want every stack deployed.
- The **shared RDS instance** runs continuously and incurs cost while it exists. Object detection now uses HTTP inference routing via `INFERENCE_HTTP_URL` on the **branch** stack when configured.
