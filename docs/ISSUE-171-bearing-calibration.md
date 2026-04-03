# ISSUE-171 Bearing Calibration

This document records calibration inputs and on-site validation for true-compass edge bearings.

## Calibration configuration

- `TRUE_NORTH_OFFSET_DEGREES`: `51`
- `BEARING_HORIZONTAL_FLIP`: `true`
- `BEARING_HORIZONTAL_MODE`: `bands` (`45-135` and `225-315` get `+180` before offset)
- Bearing formula:
  - `raw = bearing_from_coords(start, end)`
  - `if horizontal(raw): adjusted = (raw + 180) % 360 else adjusted = raw`
  - `stored = (adjusted + offset) % 360`

## How to generate field checklist

```bash
cd aws_resources/data_population
python list_edges_for_bearing_check.py --all
```

## Existing data correction

```bash
cd aws_resources/data_population
python recompute_edge_bearings.py --dry-run
python recompute_edge_bearings.py --apply
```

## On-site validation table

Acceptance requires at least ~10 mixed-orientation edges measured on-site.

| # | Floor | StartNodeID | EndNodeID | Stored bearing (deg) | Measured compass (deg) | Error (deg) | Pass/Fail |
|---|-------|-------------|-----------|----------------------|------------------------|-------------|-----------|
| 1 |       |             |           |                      |                        |             |           |
| 2 |       |             |           |                      |                        |             |           |
| 3 |       |             |           |                      |                        |             |           |
| 4 |       |             |           |                      |                        |             |           |
| 5 |       |             |           |                      |                        |             |           |
| 6 |       |             |           |                      |                        |             |           |
| 7 |       |             |           |                      |                        |             |           |
| 8 |       |             |           |                      |                        |             |           |
| 9 |       |             |           |                      |                        |             |           |
| 10 |      |             |           |                      |                        |             |           |

Do not close Issue 171 until this table is completed and the selected offset/flip values are validated on-site.
