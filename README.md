# jedai_pj

Data engineering solution on Databricks Lakehouse, following the JEDAI / Databricks Solution Standard Guideline (Medallion architecture, DLT, naming conventions).

## Folder structure

```
project_root/
├── data/                    # Data files (CSV, JSON, etc.)
│   ├── raw/                  # Raw data
│   └── reference/            # Reference data
├── scripts/                  # Implementation scripts
│   ├── 01_setup/             # Environment setup (catalog, roles, metadata)
│   ├── 02_bronze/            # Bronze layer ingestion
│   ├── 03_silver/            # Silver layer (common/, dlt/, legacy/)
│   ├── 04_gold/              # Gold layer feature engineering
│   ├── 05_models/            # ML model inference
│   ├── 06_dashboards/        # Dashboard views (00-09, 20-29, 80-89)
│   ├── 07_workflows/         # Databricks Workflows definitions
│   └── 08_maintenance/       # Maintenance (OPTIMIZE, VACUUM)
├── guides/                   # Guide documents (dashboards, data-model, implementation, ml-models, etc.)
├── standards/                # Standards and guidelines (naming, code, platform)
├── solutions/                # Solution design documents
├── dashboard/                # Dashboard definition files (.lvdash.json)
├── .cursor/rules/            # Cursor Project Rules (.mdc, alwaysApply: true)
└── .cursorrules/             # Source for project rules (synced to .cursor/rules/)
```

## Key folders

| Folder | Purpose |
|--------|--------|
| **scripts/** | Bronze → Silver → Gold pipelines, DLT, workflows, maintenance |
| **guides/** | How-to guides (DLT, quarantine, SCD Type 2, dashboards, ML) |
| **standards/** | Naming, code commenting, platform and data-engineering best practices |
| **solutions/** | Solution design docs (`X. solution_overview.md`) |
| **.cursor/rules/** | Cursor Project Rules used by the IDE (62 rules; edit here or sync from `.cursorrules/`) |

## References

- Project rules: `.cursor/rules/JEDAI.mdc` (and sibling `.mdc` files)
- Standards: `standards/00-core/` (e.g. `DATABRICKS_SOLUTION_STANDARD_GUIDELINE.md`, `myteam_Naming_Conventions.md`)
