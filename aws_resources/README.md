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
  - Runs shared **RDS schema** and canonical map seed sequence using `RdsSecretArn` from the shared stack (idempotent):
    1. `python cli.py validate`
    2. `python cli.py populate`
- **Object Config Seed** (`.github/workflows/object-config-seed.yaml`): dedicated workflow for COCO class metadata seeding into DynamoDB; provide a table directly or resolve it from stack outputs.
- **Shared Stack Deploy** (manual `workflow_dispatch`): optional path to deploy or repair **only** `StrideSharedStack` and initialize/populate the shared DB—see that workflow for one-off maintenance.
- **Cleanup** workflow: deletes branch stacks after merge; **does not** delete `StrideSharedStack`.

### Canonical CI/deploy command sequence

Use this sequence across CI and operational workflows:

1. Map validation: `python cli.py validate`
2. Backend unit tests (`./gradlew test` in `aws_resources/backend`)
3. Map population tests (`pytest tests/test_populate.py tests/test_data_validation.py`)
4. Shared DB schema init (`python populate_rds.py` in `aws_resources/map_population`)
5. Shared map seed (`python cli.py populate` in `aws_resources/map_population`)

## Schema vs map tooling boundary

- `schema_initializer` owns relational DDL only (table/index creation and schema reset safety controls).
- `map_population` owns map-definition validation plus RDS map seed data writes (`Buildings`, `Floors`, `MapNodes`, `MapEdges`, `Landmarks`).
- `object_config_seed` owns DynamoDB COCO class config seeding and is intentionally separate from map population.

The current schema path is still drop/recreate. To prevent accidental destructive runs, schema init requires explicit opt-in:

```bash
cd aws_resources/map_population
SCHEMA_INIT_ALLOW_DESTRUCTIVE_RESET=true python populate_rds.py
```

Then run map seeding separately through the unified CLI:

```bash
cd aws_resources/map_population
python cli.py validate
python cli.py populate
```

Run COCO config seeding through the dedicated tool/workflow, separately from map seeding:

```bash
cd aws_resources/object_config_seed
TABLE_NAME=<coco-config-table-name> python populate_obj_ddb.py
```

### Map tooling commands

Use the unified CLI:

```bash
cd aws_resources/map_population
python cli.py validate
python cli.py populate
python cli.py plot-local --module floor_data.floor2_v2 --var FLOOR2_DATA_V2 --floor-number 2
python cli.py plot-db --floor-number 2 --building-id B01 --show-edge-bearings
python cli.py audit-bearings --all
python cli.py recompute-bearings
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
