# jedai_pj

Project overview.

## Folder structure

```
project_root/
├── data/                    # Data files (CSV, JSON, etc.)
│   ├── raw/                  # Raw data
│   └── reference/            # Reference data
├── scripts/                  # Implementation scripts
│   ├── 01_setup/            # Environment setup
│   ├── 02_bronze/           # Bronze layer data load
│   ├── 03_silver/           # Silver layer (common, dlt, legacy)
│   ├── 04_gold/             # Gold layer feature engineering
│   ├── 05_models/           # AI model inference
│   ├── 06_dashboards/       # Dashboard view generation (00-09, 20-29, 80-89)
│   ├── 07_workflows/        # Databricks Workflows definitions
│   └── 08_maintenance/      # Maintenance scripts
├── solutions/               # Solution design documents
├── dashboard/               # Dashboard definition files (.lvdash.json)
└── .cursorrules/            # Cursor project rules
```

Skipped in this setup: `guides/`, `standards/`, `.cursorrules/00-foundations`, `01-phases`, `02-tasks`, `03-deliverables`, `04-roles`, `05-languages`, `06-functions`, `07-implementation-areas`.
