# Map Population Workflow

This folder is the canonical place for RDS map schema setup, map validation, map population, and plotting.

## Script interface (what to run directly)

Direct-entry scripts in this folder:

- `cli.py` (primary interface for map tooling)
- `populate_rds.py` (destructive schema reset/init)

Other top-level `.py` modules are support libraries and are usually imported, not run directly.

Internal command modules used by `cli.py` live in `cli_commands/` and are not intended as direct entry points.

## Quick start

From `aws_resources/map_population`:

```bash
pip install -r requirements.txt
python cli.py -h
```

Set required env before DB operations:

- `DB_SECRET_ARN` (Secrets Manager ARN for shared RDS credentials)
- `AWS_REGION` (usually `us-east-1`)
- AWS credentials in your shell/profile (`~/.aws/credentials` or role)

If `DB_SECRET_ARN` is not available or access is denied, map population can fall back to:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Iteration loop (authoring map data)

1. Edit floor definitions under `floor_data/` (for example `floor_data/floor2_v2` and `floor_data/registry.py`).
2. Validate authored map data:

   ```bash
   python cli.py validate
   ```

3. Plot local/authored data:

   ```bash
   python cli.py plot-local --floor-number 2
   ```

4. If you need a fresh schema reset (destructive):

   ```bash
   SCHEMA_INIT_ALLOW_DESTRUCTIVE_RESET=true python populate_rds.py
   ```

5. Seed map data into RDS:

   ```bash
   python cli.py populate --coordinate-angle-offset 141 --side-by-bearing-offset 51
   ```

   Notes on `DoorID` migration:
   - `populate` ensures `Landmarks.DoorID` exists (non-destructive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
   - Landmark `door_id` values are authored manually in `floor_data/*/landmarks.py`.
   - Population fails if any authored landmark is missing `door_id`.

### Upload offsets

`python cli.py populate` has two independent rotation offsets:

- `--coordinate-angle-offset` (default: `141`)
  - Rotates node/landmark coordinates into DB storage frame.
  - Change this when plotted/stored node geometry is globally rotated relative to authored map coordinates.
- `--side-by-bearing-offset` (default: `51`)
  - Rotates per-door `side_by_bearing` headings in node metadata.
  - Change this when door side labels/headings are systematically rotated even though node geometry looks correct.

Important:

- The defaults (`141` coords / `51` side-by-bearing) are calibrated for current `floor0` authoring data.
- Other floors or future re-authoring may require different values.
- Keep values explicit in deployment commands for repeatable behavior across environments.

6. Plot deployed DB map to verify what is actually stored:

   ```bash
   python cli.py plot-db --building-id B01 --floor-number 2
   ```

7. Optional QA utilities:

   ```bash
   python cli.py audit-bearings --all
   python cli.py recompute-bearings
   python cli.py print-tables --limit 25
   ```

8. Optional destructive data clear (keeps schema, removes map data rows):

   ```bash
   python cli.py clear-db --yes
   ```

## Plot outputs

Default plot files are saved under `aws_resources/map_population/plots/`:

- local plot: `plot-local-floor-<floor>.png`
- db plot: `plot-db-<building>-floor-<floor>.png`

## CI/CD workflows that use this tooling

- `pr-validation.yaml`
  - Runs `python cli.py validate`
  - Runs map population tests (`pytest tests/test_populate.py tests/test_data_validation.py`)
- `infrastructure-deploy.yaml`
  - Runs `python populate_rds.py` (destructive reset path, temporary)
  - Runs `python cli.py validate`
  - Runs `python cli.py populate`
- `shared-stack-deploy.yaml` (manual repair/maintenance path)
  - Runs the same schema + validate + populate sequence

## Notes

- `populate_rds.py` is intentionally destructive in the current phase; never run it against an environment you do not intend to reset.
- Upload now applies only the angle-offset coordinate transform (no mirroring, no feet-to-pixels transform).
- Edge bearings persisted to DB are always recomputed from stored node coordinates.
- `python cli.py clear-db --yes` clears map data tables only (schema remains).
- COCO object config seeding is separate (`aws_resources/object_config_seed`) and not part of map population.
