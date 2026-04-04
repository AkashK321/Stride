# Floor plan image (optional)

Place a floor-2 plan image here as `floor2_map.png` so `plot_runs.py` can draw it behind dead-reckoning paths.

## Auto-generate from graph data

From repo root:

```bash
python3 test_results/dead_reckoning/assets/generate_floor2_map.py
```

This creates `floor2_map.png` from `aws_resources/data_population/floor_data/floor2.py`.
It is aligned so **north is up** (top of image is north) and uses the same meter coordinate frame as `frontend/data/floor2Nodes.json`.

If no image is present, plots still render on coordinate axes using node positions when `start_node_id` is set.
