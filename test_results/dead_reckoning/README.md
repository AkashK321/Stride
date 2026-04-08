# Dead-reckoning test data

This folder holds **CSV run files** from the Sensor Dev **Dead reckoning** flow and any **plots** produced for analysis.

## How data gets here

1. Run **`npm run dev-logger`** from `frontend/` (starts `frontend/dev-logger-server.js`, default `http://localhost:3001`).
2. Point the app at the logger: set **`EXPO_PUBLIC_DEAD_RECKONING_LOGGER_URL`** (or **`EXPO_PUBLIC_DEV_LOGGER_URL`**) to your machine’s URL (see logger console output for LAN IP when using a physical device).
3. In the app: **Sensor Dev** tab → **Dead reckoning** → fill metadata, choose **floor** (only floor **2** is supported today), select **start** and **end** graph nodes, then **Start Test Run** / **Stop Test Run**.

The logger writes one CSV per run under this directory.

## CSV file naming

- Pattern: **`<sanitized_test_id>-<YYYYMMDD-HHmmss-mmm>.csv`**  
  Example: `001-20260403-204134-015.csv`
- `test_id` comes from the Dead reckoning form; the timestamp keeps each file unique.

## CSV columns (current format)

Each row is one sample during the run. Run-level fields repeat on every row.

| Column | Description |
| --- | --- |
| `timestamp_ms` | Sample time (epoch ms) |
| `test_id` | Run label from the app |
| `tester` | Tester name |
| `device_model` | Device model string |
| `floor` | Floor number (logger accepts **2** only for new runs) |
| `start_node_id` | BHEE floor graph node id (start of route metadata) |
| `end_node_id` | BHEE floor graph node id (end of route metadata) |
| `ground_truth_distance_m` | Declared path length (meters) |
| `heading_raw_deg` | Heading sample (degrees) |
| `heading_avg_deg` | Rolling average heading (degrees) |
| `pedometer_steps` | Step count (relative to run start) |
| `step_delta` | Steps since previous sample |
| `estimated_distance_m` | Estimated distance from steps × nominal stride |

**Legacy files** in this folder may still include `start_label` and `end_label` instead of `floor`; `plot_runs.py` only needs node ids and the numeric columns above for the main plots.

## Plots

```bash
cd test_results/dead_reckoning
python plot_runs.py
```

Default output: **`plots/`** under this directory.

When `start_node_id` matches an id in **`frontend/data/floor2Nodes.json`**, the path plot is anchored in building coordinates and the floor-2 graph is drawn. If `end_node_id` is set, an **End (graph)** marker is shown.

Optional map image: place **`assets/floor2_map.png`** here (see **`assets/README.md`**) or pass **`--map-image`** to `plot_runs.py`.

## Pilot checklist (manual)

For quick viability checks, collect several short routes:

1. Start the dev logger; confirm the app can reach it.
2. In Dead reckoning: set **test id**, **floor** (2), **ground truth distance**, **tester**, **device model**, **start** and **end** nodes.
3. **Start Test Run**, walk the route, **Stop Test Run**.
4. Confirm a new CSV appears in this folder.
5. Repeat for multiple runs.
6. Run **`plot_runs.py`** and review heading stability vs. distance error.
