# Discord Community Activity Visualization Platform

> A Phase 1 project to collect, store, and visualize Discord community activity data using Databricks

[![Project Status](https://img.shields.io/badge/status-active-green)]()
[![Platform](https://img.shields.io/badge/platform-Databricks-orange)]()
[![Source](https://img.shields.io/badge/source-Discord%20API-blue)]()
[![Python](https://img.shields.io/badge/python-3.9+-blue)]()

---

## Overview

This project builds a data collection and visualization platform for Discord communities.

By integrating the Discord API with the Databricks Lakehouse Platform, the project enables continuous collection, aggregation, and visualization of community activity data.  
The primary goal of Phase 1 is to support data-driven community management by making activity patterns visible and explainable.

This repository focuses on **data infrastructure and visualization**, not automation or AI-driven decision-making.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Dashboards](#dashboards)
- [Development & Standards](#development--standards)
- [Roadmap](#roadmap)
- [Notes](#notes)
- [Documentation](#documentation)
- [Development Setup](#development-setup)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Project Summary](#project-summary)
- [Contact](#contact)

---

## Quick Start

### For Developers

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd jedai_pj
   ```

2. **Set up Databricks environment**
   - Follow the [Environment Configuration Guide](guides/implementation/ENVIRONMENT_CONFIGURATION.md)
   - Ensure Databricks workspace is configured with Unity Catalog

3. **Run setup scripts**
   ```bash
   # Execute scripts in order
   scripts/01_setup/     # Environment setup (catalog, schema, roles, metadata tables)
   scripts/02_bronze/    # Bronze layer ingestion (Discord API → Delta)
   scripts/03_silver/    # Silver layer cleansing
   scripts/04_gold/      # Gold layer feature engineering
   scripts/06_dashboards/ # Dashboard views and queries
   ```

4. **Review documentation**
   - See [Implementation Guides](guides/implementation/README.md) for detailed setup
   - Check [Standards](standards/00-core/README.md) for coding conventions

### For Project Stakeholders

See [Project Summary](#project-summary) below for business context, objectives, and scope.

---

## Prerequisites

### Required

- **Databricks Workspace** with Unity Catalog enabled
- **Python 3.9+** (for local development)
- **Databricks CLI** configured
- **Git** for version control

### Recommended

- **Databricks Runtime** 13.3 LTS or later
- **Discord API access** (application token / bot token for activity data)
- **Knowledge of**:
  - PySpark / Spark SQL
  - Delta Live Tables (DLT)
  - REST API integration

### Environment Variables

Configure the following (see [Environment Configuration Guide](guides/implementation/ENVIRONMENT_CONFIGURATION.md)):

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`
- Discord API credentials via Databricks Secrets (do not hardcode)

---

## Project Structure

```
jedai_pj/
├── .cursorrules/              # Cursor Project Rules (00-foundations … 07-implementation-areas)
├── data/                       # Data files
│   ├── raw/                    # Raw data
│   └── reference/              # Reference data
├── scripts/                    # Implementation scripts
│   ├── 01_setup/               # Environment setup (catalog, schema, roles, metadata tables)
│   ├── 02_bronze/              # Bronze layer ingestion (e.g. Discord API → Delta)
│   ├── 03_silver/              # Silver layer cleansing
│   │   ├── common/             # Common utilities (quarantine, SCD Type 2)
│   │   ├── dlt/                # DLT scripts
│   │   └── legacy/             # Legacy scripts
│   ├── 04_gold/                # Gold layer feature engineering
│   ├── 05_models/              # ML model inference
│   ├── 06_dashboards/          # Dashboard views and queries
│   │   ├── 00-09/              # View creation
│   │   ├── 20-29/              # Dashboard query provision
│   │   └── 80-89/              # Maintenance
│   ├── 07_workflows/           # Databricks Workflows definitions
│   └── 08_maintenance/         # Maintenance (OPTIMIZE, VACUUM)
├── standards/                  # Standards and guidelines
│   ├── 00-core/                # Core standards, naming, project structure
│   ├── 01-language/            # Language-specific standards
│   ├── 02-platform/            # Platform and data-engineering best practices
│   ├── 03-patterns/            # Implementation patterns, error handling
│   └── 99-governance/          # Governance
├── guides/                     # Implementation guides
│   ├── dashboards/             # Dashboard guides
│   ├── data-model/             # Data model guides
│   ├── implementation/        # Implementation guides (DLT, environment, SCD Type 2)
│   ├── ml-models/              # ML model guides
│   ├── pre-implementation/     # Pre-implementation considerations
│   └── solution-design/        # Solution design guides
├── solutions/                  # Solution design documents (e.g. X. solution_overview.md)
├── dashboard/                  # Dashboard definition files (.lvdash.json)
└── README.md
```

**See [Project Structure Template](standards/00-core/PROJECT_STRUCTURE_TEMPLATE.md) for detailed pipeline flow and execution order.**

---

## Dashboards

Phase 1 dashboards focus on temporal activity patterns.

**Example views:**

- **Activity volume by day of week × hour** — Message or participation counts over time
- **Comparison across different time windows** — Trends and patterns for scheduling decisions

Dashboards are designed to support exploration and explanation, not automated decision-making.  
See [Dashboard Creation Guide](guides/dashboards/DASHBOARD_CREATION_GUIDE.md) for implementation details.

---

## Development & Standards

This project follows the **Databricks Solution Standard Guideline** and project rules under `.cursorrules/`.

- **Data transformations** follow a Medallion-style structure (Bronze → Silver → Gold)
- **All scripts and notebooks** include explanatory comments ([Code Commenting Standard](standards/01-language/CODE_COMMENTING_STANDARD.md))
- **Secrets** (tokens, keys) are managed outside of source code (Databricks Secrets)
- **Reproducibility** is prioritized over performance optimization in Phase 1

### Key Standards

- **Naming**: [myteam Naming Conventions](standards/00-core/myteam_Naming_Conventions.md)
- **Comments**: [Code Commenting Standard](standards/01-language/CODE_COMMENTING_STANDARD.md)
- **Errors**: [Error Handling](standards/03-patterns/ERROR_HANDLING_STANDARD.md)
- **Patterns**: [Implementation Patterns](standards/03-patterns/IMPLEMENTATION_PATTERNS.md)

### Architecture

- **Bronze**: Append-only; preserve raw form (e.g. Discord API response)
- **Silver**: Cleansing, validation; SCD Type 2 where required; DLT preferred
- **Gold**: Aggregations and feature tables; overwrite with `overwriteSchema` where appropriate
- **Data quality**: DLT Expectations; invalid data to quarantine tables per naming rules

---

## Roadmap

| Phase | Status   | Focus |
|-------|----------|--------|
| **Phase 1** | Current  | Data ingestion, aggregation, dashboard visualization, Jedai presentation |
| **Phase 2** | Planned  | Metric expansion, segmentation by roles/channels, event-level analysis, advanced analytics |

---

## Documentation

### Key Documentation Links

#### Standards Reference
- **[Core Standards](standards/00-core/README.md)** — Project standards overview
- **[Naming Conventions](standards/00-core/myteam_Naming_Conventions.md)** — Naming rules
- **[Code Commenting](standards/01-language/CODE_COMMENTING_STANDARD.md)** — Comments and docstrings
- **[Implementation Patterns](standards/03-patterns/IMPLEMENTATION_PATTERNS.md)** — Common patterns
- **[Data Engineering Best Practices](standards/02-platform/Data_Engineering_Best_Practices.md)** — Platform and pipeline practices

#### Implementation Guides
- **[DLT Complete Guide](guides/implementation/DLT_COMPLETE_GUIDE.md)** — DLT pipelines
- **[Environment Configuration](guides/implementation/ENVIRONMENT_CONFIGURATION.md)** — Environment setup
- **[SCD Type 2](guides/implementation/SCD_TYPE2_THREE_APPROACHES_COMPARISON.md)** — SCD Type 2 implementation

#### Data & Dashboards
- **[Data Model Guides](guides/data-model/)** — Data model and schemas
- **[Dashboard Guide](guides/dashboards/DASHBOARD_CREATION_GUIDE.md)** — Dashboard creation

### Quick Reference

| Topic | Document |
|-------|----------|
| **Getting Started** | [Environment Configuration](guides/implementation/ENVIRONMENT_CONFIGURATION.md) |
| **DLT Pipelines** | [DLT Complete Guide](guides/implementation/DLT_COMPLETE_GUIDE.md) |
| **Naming Rules** | [Naming Conventions](standards/00-core/myteam_Naming_Conventions.md) |
| **Code Standards** | [Code Commenting](standards/01-language/CODE_COMMENTING_STANDARD.md) |
| **Project Structure** | [Project Structure Template](standards/00-core/PROJECT_STRUCTURE_TEMPLATE.md) |

---

## Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd jedai_pj
```

### 2. Configure Databricks

```bash
pip install databricks-cli
databricks configure --token
```

### 3. Set Up Environment

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt   # if present
```

### 4. Environment Variables & Secrets

- Set `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, catalog/schema as needed.
- Store Discord API credentials in Databricks Secrets; do not commit to the repo.

### 5. Run Setup Scripts

Execute in order:

```bash
scripts/01_setup/    # Catalog, schema, roles, metadata tables
scripts/02_bronze/   # Bronze ingestion (e.g. Discord → Delta)
scripts/03_silver/   # Silver cleansing (DLT or legacy)
scripts/04_gold/     # Gold feature engineering
scripts/06_dashboards/ # Views and dashboard queries
```

### 6. Verify

- Databricks workspace and Unity Catalog access
- At least one pipeline run (e.g. Bronze → Silver → Gold)
- Dashboard loads as expected

---

## Contributing

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Follow standards** — Naming, commenting, error handling, tests where applicable.

3. **Submit pull request** — Description, related issues, tests passing.

### Code Review Checklist

- [ ] Follows project standards
- [ ] Tests added/updated where relevant
- [ ] Documentation updated
- [ ] No hardcoded secrets
- [ ] Errors handled; logging where appropriate

---

## Troubleshooting

### Databricks Connection

- Check `DATABRICKS_HOST` and `DATABRICKS_TOKEN` (or profile)
- Confirm token not expired; retry after re-auth
- Verify Unity Catalog and workspace permissions

### DLT / Pipeline Errors

- Confirm no conflicting table names; use `_dlt` during development if needed
- Check [DLT Complete Guide](guides/implementation/DLT_COMPLETE_GUIDE.md) and Expectations
- Inspect quarantine tables for dropped rows

### Schema / Write Mode

- Bronze/Silver: `mode("append")` with `option("mergeSchema", "true")`
- Gold: `mode("overwrite")` with `option("overwriteSchema", "true")` where full refresh is intended
- Avoid DROP TABLE + CREATE TABLE in production pipelines

### Discord API

- Verify token and permissions (e.g. Guild Members Intent if needed)
- Check rate limits and backoff; store credentials in Databricks Secrets

---

## Project Summary

### 1. Executive Summary

This project implements **Phase 1** of a **Discord Community Activity Visualization Platform**: collect, store, and visualize Discord server activity on Databricks so community management can be based on data (e.g. by day of week and time of day) instead of experience or intuition.

It is presented at **Jedai** as a practical case study of building a data platform and visualization pipeline on Databricks using a **non-business data source** (Discord activity logs).

### 2. Background and Problem

- **Context**: A university esports community on Discord (600+ members); events and engagement are managed with limited quantitative support.
- **Gap**: Decisions (e.g. when to hold events) rely on experience and intuition; there is no systematic way to record, verify, or share findings with data.
- **Goal**: Ingest Discord activity, store it in Databricks, and provide dashboards so that situation awareness, hypothesis formation, and planning can be data-driven.

### 3. Objectives and Success Criteria (Phase 1)

| Goal | By end of March 2025 |
|------|----------------------|
| **Deliverable** | A dashboard that explains Discord community activity trends by **day of week** and **time of day**. |

**Success criteria (definition of done):**

- Activity data is retrievable via the Discord API.
- Data is stored in Databricks and can be recomputed.
- Activity trends are visualized on a dashboard.
- Operational insights can be explained using the visualized data.
- Reproduction steps and design intent are documented (e.g. in this README).

### 4. As-Is vs To-Be (Phase 1)

| Aspect | As-Is | To-Be (Phase 1) |
|--------|--------|------------------|
| **Situation** | Subjective sense of activity; no quantitative history | Continuous collection and storage; trends by day/time on dashboards |
| **Hypotheses** | Based on experience (e.g. “weekends are busier”) | Data-driven hypotheses; compare intuition vs data |
| **Planning** | Manual; rationale not quantified | Schedules and content choices informed by expected participation |
| **Retrospective** | Impression-based | Before/after and trends visible in data |

### 5. Scope (Phase 1)

**In scope**

- Discord API integration to retrieve activity data.
- Storage in Databricks (e.g. Bronze/Silver/Gold).
- Aggregation logic.
- Visualization via dashboards.

**Out of scope (Phase 1)**

- Automatic event schedule or content suggestions.
- Community management via chatbots.
- Predictive or optimization algorithms.
- Production-grade availability and full monitoring design.
- Full CI/CD between GitHub and Databricks.

### 6. Data Architecture (Concept)

| Stage | Purpose | Strategy |
|-------|--------|----------|
| **Bronze** | Raw Discord API / event data | Append-only; schema evolution with `mergeSchema` |
| **Silver** | Cleansed, validated activity (e.g. by user, channel, timestamp) | SCD Type 2 where needed; DLT preferred; quarantine for invalid rows |
| **Gold** | Aggregations (e.g. by day of week, hour) for dashboards | Overwrite with `overwriteSchema` where full refresh |

Write modes and naming follow [standards](standards/00-core/) and [Data Engineering Best Practices](standards/02-platform/Data_Engineering_Best_Practices.md).

### 7. Team Structure

| Role | Main responsibilities |
|------|----------------------|
| **PM / Data Engineer** | Requirements, project management, implementation |
| **Tech Lead** | Technical design, review, quality assurance |

---

## Notes

This project intentionally focuses on **observability and explainability** in its first phase.  
Future phases may explore automation and AI-based support, but Phase 1 prioritizes building a reliable foundation.

---

## Contact

- **Repository**: [Add repository URL]
- **Project**: jedai_pj — Discord Community Activity Visualization Platform (Phase 1)

---

**Created**: 2025  
**Last Updated**: 2026  
**Author**: jedai_pj team
