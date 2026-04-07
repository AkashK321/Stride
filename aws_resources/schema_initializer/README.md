## Schema Initializer (Legacy Wrapper)

Canonical schema initialization now lives in `aws_resources/map_population/populate_rds.py`.
This folder remains as a compatibility wrapper so older invocations still work.

### Responsibilities

- Create/update relational DDL objects (tables, indexes, constraints).
- Apply temporary drop/recreate schema flow used by deployment workflows.
- Avoid map-definition validation and map-data population logic.

### Non-responsibilities

- Do not seed map nodes/edges/landmarks (`map_population` owns that).
- Do not seed DynamoDB COCO object config (`object_config_seed` owns that).

### Safety guardrail

`populate_rds.py` is destructive in the current phase. It requires explicit opt-in:

```bash
cd aws_resources/map_population
SCHEMA_INIT_ALLOW_DESTRUCTIVE_RESET=true python populate_rds.py
```
