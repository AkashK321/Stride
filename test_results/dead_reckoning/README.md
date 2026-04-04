# Dead-Reckoning Test Data

This folder stores CSV runs emitted by the local dev logger (`frontend/dev-logger-server.js`) and generated plots.

## Expected CSV naming

- `<test_id>-<YYYYMMDD-HHmmss-mmm>.csv` (e.g. `001-20260403-204134-015.csv`)
- `test_id` comes from Sensor Dev metadata; the timestamp makes each file unique.

Columns **`start_node_id`** and **`end_node_id`** (optional) record BHEE floor-2 graph nodes from Sensor Dev. When `start_node_id` matches `frontend/data/floor2Nodes.json`, `plot_runs.py` aligns the reconstructed path to building coordinates and draws the **End (graph)** marker when `end_node_id` is set.

Optional floor plan: put `assets/floor2_map.png` in this folder (see `assets/README.md`) or pass `--map-image` to the plot script.

## Generate plots

```bash
cd test_results/dead_reckoning
python plot_runs.py
```

By default, plots are written to `test_results/dead_reckoning/plots/`.

## Pilot run checklist (manual)

For initial viability validation, collect at least 5 short-route runs using Sensor Dev Test Mode:

1. Enter metadata (`test_id`, start/end labels, ground-truth distance, tester, device model).
2. Start run, walk the route, stop run.
3. Confirm CSV appears in this directory.
4. Repeat for at least 5 runs.
5. Run `plot_runs.py` and review heading stability + distance error.
