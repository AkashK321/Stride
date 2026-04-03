# Validate indoor dead-reckoning viability with heading average and pedometer distance

## Problem

We need to determine whether a rolling average of heading plus pedometer-derived distance can accurately track direction and distance traveled indoors.

## Goal

Add a dedicated Sensor Dev Test Mode to collect standardized run metadata and time-series samples, and stream them to a local dev logger running on the laptop so CSVs are immediately available in-repo for plotting and analysis.

## MVP scope

- Compute and record:
  - heading (raw + rolling average)
  - pedometer step count (and step delta)
  - estimated traveled distance from steps
- Initial protocol: single short route
- No advanced confidence or drift modeling in MVP

## Required metadata per run

- `test_id` / run number
- `start_label`
- `end_label`
- `ground_truth_distance_m`
- `tester`
- `device_model`

## Data flow

1. User opens Sensor Dev Test Mode and enters run metadata.
2. User starts recording and walks route.
3. Frontend emits sample rows during run.
4. Frontend posts metadata and samples to local logger on the laptop.
5. Logger writes CSV files into repo data folder for plotting scripts.

## Proposed CSV schema (MVP)

- `timestamp_ms`
- `test_id`
- `tester`
- `device_model`
- `start_label`
- `end_label`
- `ground_truth_distance_m`
- `heading_raw_deg`
- `heading_avg_deg`
- `pedometer_steps`
- `step_delta`
- `estimated_distance_m`

## Implementation tasks

- [ ] Add Sensor Dev Test Mode UI (metadata entry + start/stop + live preview).
- [ ] Implement rolling heading average (configurable window).
- [ ] Implement pedometer-based distance accumulation (`steps * step_length_m`).
- [ ] Add local logger contract (`/run/start`, `/run/sample`, `/run/end`) and CSV writing.
- [ ] Save CSV files to deterministic path (`test_results/dead_reckoning/`).
- [ ] Add plotting script(s) for distance trend and heading stability.
- [ ] Collect at least 5 pilot runs on the single short route.
- [ ] Summarize error vs ground truth and recommend next iteration.

## Acceptance criteria

- [ ] Sensor Dev supports full test-run workflow with required metadata.
- [ ] Each run outputs structured CSV with required fields.
- [ ] Data lands in a consistent in-repo folder from local logger.
- [ ] Plots can be generated directly from collected CSVs.
- [ ] Pilot run report includes estimated vs ground-truth distance error and heading behavior.

## Initial test protocol (single short route)

1. Define one short indoor route with known distance.
2. Enter metadata and start run.
3. Walk start to end at normal pace with consistent phone placement.
4. Stop run and verify CSV file creation.
5. Repeat at least 5 times.
