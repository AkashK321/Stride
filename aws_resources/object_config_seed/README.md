# Object Config Seed

This package owns DynamoDB COCO class configuration seeding.

## Responsibilities

- Seed `CocoConfigTable` with COCO class metadata (`class_id`, `class_name`, `avg_height_meters`).
- Run independently from relational schema initialization and map population.

## Non-responsibilities

- Do not initialize or mutate RDS schema (`schema_initializer` owns that).
- Do not validate or seed map floor data (`map_population` owns that).

## Local usage

Set a target table explicitly:

```bash
cd aws_resources/object_config_seed
TABLE_NAME=<coco-config-table-name> python populate_obj_ddb.py
```

## CI usage

Use `.github/workflows/object-config-seed.yaml` as the dedicated workflow boundary.

- Provide either:
  - `table_name` directly, or
  - `stack_name` so the workflow resolves `CocoConfigTableName` from CloudFormation outputs.
