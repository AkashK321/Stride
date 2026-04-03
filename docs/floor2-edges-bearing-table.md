# Floor 2 - all edges with DB bearing

All map edges in Floor 2 for compass validation.

- **StartNodeID**: stand at this node
- **EndNodeID**: face this node
- **DB bearing (deg)**: value from `MapEdges.Bearing`
- **True bearing (deg)**: measured on-site value to fill during validation

Generate this table from live DB:

```bash
cd aws_resources/data_population
python list_edges_for_bearing_check.py --all --floor-id 2
```

| # | Floor | StartNodeID (stand here) | EndNodeID (face this) | DB bearing (deg) | True bearing (deg) |
|---|-------|---------------------------|------------------------|------------------|--------------------|
| 1 | 2 | (populate from script output) | (populate from script output) | | |
