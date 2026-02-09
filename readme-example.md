# ClientX PoC Project

> **Knowledge Management PoC** using Databricks Lakehouse Platform for RAG (Retrieval-Augmented Generation) and secure document search

[![Project Status](https://img.shields.io/badge/status-active-green)]()
[![Databricks](https://img.shields.io/badge/platform-Databricks-orange)]()
[![Python](https://img.shields.io/badge/python-3.9+-blue)]()

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Development Setup](#development-setup)
- [Standards & Guidelines](#standards--guidelines)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Project Summary](#project-summary)

---

## Quick Start

### For Developers

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ClientX
   ```

2. **Set up Databricks environment**
   - Follow the [Environment Configuration Guide](guides/implementation/ENVIRONMENT_CONFIGURATION.md)
   - Ensure Databricks workspace is configured with Unity Catalog

3. **Run setup scripts**
   ```bash
   # Execute scripts in order
   scripts/01_setup/     # Environment setup
   scripts/02_bronze/    # Bronze layer ingestion
   scripts/03_silver/    # Silver layer cleansing
   scripts/04_gold/      # Gold layer feature engineering
   ```

4. **Review documentation**
   - See [Implementation Guides](guides/implementation/README.md) for detailed setup
   - Check [Standards](standards/00-core/README.md) for coding conventions

### For Project Stakeholders

See [Project Summary](#project-summary) section below for business context, objectives, and execution plan.

---

## Prerequisites

### Required

- **Databricks Workspace** with Unity Catalog enabled
- **Python 3.9+** (for local development)
- **Databricks CLI** configured
- **Git** for version control

### Recommended

- **Databricks Runtime** 13.3 LTS or later
- **Access to Box API** (for Phase 1 data ingestion)
- **Knowledge of**:
  - PySpark / Spark SQL
  - Delta Live Tables (DLT)
  - Databricks Vector Search
  - RAG architectures

### Environment Variables

Configure the following (see [Environment Configuration Guide](guides/implementation/ENVIRONMENT_CONFIGURATION.md)):

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`

---

## Project Structure

```
ClientX/
├── .cursor/                    # Cursor AI rules and standards
│   └── rules/                 # Project-specific coding rules
├── scripts/                    # Implementation scripts
│   ├── 01_setup/              # Environment setup
│   ├── 02_bronze/              # Bronze layer ingestion
│   ├── 03_silver/              # Silver layer cleansing
│   │   ├── 01_rot_filtering/   # ROT data filtering
│   │   ├── 02_pii_masking/     # PII masking
│   │   ├── common/             # Common utilities
│   │   ├── dlt/                # DLT scripts
│   │   └── legacy/             # Legacy scripts
│   ├── 04_gold/                # Gold layer feature engineering
│   ├── 05_models/              # ML model inference
│   ├── 06_dashboards/          # Dashboard views
│   ├── 07_workflows/           # Workflow definitions
│   └── 08_maintenance/          # Maintenance scripts
├── standards/                  # Coding standards and guidelines
│   ├── 00-core/               # Core standards
│   ├── 01-language/            # Language-specific standards
│   ├── 02-platform/            # Platform-specific standards
│   ├── 03-patterns/            # Implementation patterns
│   └── 99-governance/          # Governance standards
├── guides/                     # Implementation guides
│   ├── dashboards/             # Dashboard guides
│   ├── data-model/             # Data model guides
│   ├── implementation/         # Implementation guides
│   ├── ml-models/              # ML model guides
│   └── solution-design/        # Solution design guides
├── docs/                       # Project documentation
│   ├── evaluation_reports/     # Evaluation results
│   ├── metric_definitions/     # Metric definitions
│   └── project_metadata/       # Project metadata
└── data/                       # Data files
    ├── raw/                    # Raw data
    └── reference/              # Reference data
```

**See [Scripts README](scripts/README.md) for detailed pipeline flow and execution order.**

---

## Documentation

### Key Documentation Links

#### Standards & Guidelines
- **[Core Standards](standards/00-core/README.md)** - Project standards overview
- **[Naming Conventions](standards/00-core/myteam_Naming_Conventions.md)** - Naming rules
- **[Coding Standards](standards/01-language/)** - Language-specific standards
- **[Implementation Patterns](standards/03-patterns/IMPLEMENTATION_PATTERNS.md)** - Common patterns

#### Implementation Guides
- **[DLT Complete Guide](guides/implementation/DLT_COMPLETE_GUIDE.md)** - ⭐ Start here for DLT pipelines
- **[Environment Configuration](guides/implementation/ENVIRONMENT_CONFIGURATION.md)** - Environment setup
- **[SCD Type 2 Guide](guides/implementation/SCD_TYPE2_THREE_APPROACHES_COMPARISON.md)** - SCD Type 2 implementation

#### Data Architecture
- **[Data Architecture](#5-data-architecture)** - Pipeline specifications (see below)
- **[Data Model Guides](guides/data-model/)** - Data model documentation

### Quick Reference

| Topic | Document |
|-------|----------|
| **Getting Started** | [Environment Configuration](guides/implementation/ENVIRONMENT_CONFIGURATION.md) |
| **DLT Pipelines** | [DLT Complete Guide](guides/implementation/DLT_COMPLETE_GUIDE.md) |
| **Naming Rules** | [Naming Conventions](standards/00-core/myteam_Naming_Conventions.md) |
| **Code Standards** | [Coding Standards](standards/01-language/) |
| **Project Structure** | [Project Structure Template](standards/00-core/PROJECT_STRUCTURE_TEMPLATE.md) |

---

## Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd ClientX
```

### 2. Configure Databricks

```bash
# Install Databricks CLI
pip install databricks-cli

# Configure authentication
databricks configure --token
```

### 3. Set Up Environment

```bash
# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies (if requirements.txt exists)
pip install -r requirements.txt
```

### 4. Configure Environment Variables

See [Environment Configuration Guide](guides/implementation/ENVIRONMENT_CONFIGURATION.md) for details.

### 5. Run Setup Scripts

Execute scripts in order (see [Scripts README](scripts/README.md)):

```bash
# 1. Environment setup
scripts/01_setup/

# 2. Bronze layer ingestion
scripts/02_bronze/

# 3. Silver layer cleansing
scripts/03_silver/01_rot_filtering/
scripts/03_silver/02_pii_masking/

# 4. Gold layer feature engineering
scripts/04_gold/
```

### 6. Verify Installation

- Check Databricks workspace connectivity
- Verify Unity Catalog access
- Run test scripts to validate setup

---

## Standards & Guidelines

This project follows the **Databricks Solution Standard Guideline** and enforces strict coding standards.

### Key Standards

- **Naming Conventions**: See [myteam Naming Conventions](standards/00-core/myteam_Naming_Conventions.md)
- **Code Commenting**: See [Code Commenting Standard](standards/01-language/CODE_COMMENTING_STANDARD.md)
- **Error Handling**: See [Error Handling Standard](standards/03-patterns/ERROR_HANDLING_STANDARD.md)
- **Implementation Patterns**: See [Implementation Patterns](standards/03-patterns/IMPLEMENTATION_PATTERNS.md)

### Architecture Standards

- **Medallion Architecture**: Bronze → Silver → Gold layers
- **SCD Strategy**: 
  - Bronze: Append-only
  - Silver: Type 2 (REQUIRED)
  - Gold: Type 1 (Overwrite)
- **DLT Usage**: Preferred for Silver layer pipelines
- **Data Quality**: DLT Expectations with quarantine

**See [Project Rules](.cursor/rules/ClientXpoc.mdc) for complete standards.**

---

## Contributing

### Code Contribution Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Follow coding standards**
   - Review [Coding Standards](standards/01-language/)
   - Follow naming conventions
   - Add proper documentation

3. **Write tests**
   - Unit tests for new functions
   - Integration tests for pipelines
   - Ensure ≥80% code coverage

4. **Submit pull request**
   - Include description of changes
   - Reference related issues
   - Ensure all tests pass

### Code Review Checklist

- [ ] Code follows project standards
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] No hardcoded credentials
- [ ] Error handling implemented
- [ ] Logging added appropriately

---

## Troubleshooting

### Common Issues

#### Databricks Connection Issues

**Problem**: Cannot connect to Databricks workspace

**Solutions**:
- Verify `DATABRICKS_HOST` and `DATABRICKS_TOKEN` are set correctly
- Check token expiration: `databricks configure --token`
- Verify network connectivity and firewall rules
- Check Unity Catalog permissions

#### DLT Pipeline Errors

**Problem**: DLT pipeline fails with table conflicts

**Solutions**:
- Check for existing tables with same name
- Use `_dlt` suffix during development, rename to production after validation
- Review [DLT Complete Guide](guides/implementation/DLT_COMPLETE_GUIDE.md) troubleshooting section
- Check DLT Expectations and quarantine tables

#### Schema Evolution Issues

**Problem**: Schema merge conflicts in Bronze/Silver layers

**Solutions**:
- Ensure `mergeSchema: true` is set for append operations
- Use `overwriteSchema: true` for Gold layer overwrite operations
- Review column naming conventions (PascalCase vs snake_case)
- Check [Naming Conventions](standards/00-core/myteam_Naming_Conventions.md)

#### PII Detection Accuracy

**Problem**: PII detection accuracy below 99% target

**Solutions**:
- Review PII detection patterns and rules
- Check quarantine tables for false positives/negatives
- Validate masking logic implementation
- Consult PII protection documentation

#### ROT Filtering Issues

**Problem**: ROT exclusion rate below 20% target

**Solutions**:
- Review ROT detection thresholds and business rules
- Validate ROT classification logic
- Check quarantine tables for filtered records
- Adjust thresholds based on data characteristics

### Getting Help

- **Documentation**: Check [guides](guides/) and [standards](standards/) directories
- **Issues**: Create an issue in the repository (if available)
- **Contact**: Reach out to project team via email

---

## Project Summary

## 1. Executive Summary

This project implements a PoC (Proof of Concept) using a phased approach to comprehensively address three major themes: "Knowledge Management of Past Project Documents," "Cost Reduction and Quality Improvement," and "Secure Knowledge Search."

- **Phase 1 (Late February - Late May)**: Initially, we will focus on infrastructure-related project documents and implement a fixed approach centered on "Knowledge Management of Past Project Documents." This will validate technical feasibility and key business value in a short timeframe.
- **Phase 2 (June onwards)**: Based on Phase 1 results, we will expand data sources company-wide and develop advanced features such as "Cost Reduction" and "Automation Workflows."

This phased approach minimizes risk while steadily advancing knowledge utilization sophistication.

## 2. Background and Problem Recognition

Based on the materials you provided, we have organized your company's challenges into the following three themes:

| Theme | Objective (Target State) | What to Verify in PoC |
| --- | --- | --- |
| 1. Knowledge Management of Past Project Documents | • Early detection of project risks<br>• Traceability visualization from requirements to incidents<br>• Quality issue prevention and reuse of past knowledge | • Accuracy of impact extraction<br>• Accuracy of linking semantic relationships between requirements, design, testing, and incidents<br>• Accuracy of risk and concern extraction |
| 2. Cost Reduction and Quality Improvement | • Elimination of personal dependencies and manual work<br>• Identification of tasks to automate and improvement points | • Accuracy of procedure decomposition and understanding<br>• Accuracy of similar procedure clustering<br>• Validity assessment of automation candidates |
| 3. Secure Knowledge Search | • Clean data assets without unnecessary/restricted information<br>• Accurate, simple, and fast search of unstructured data | • ROT/PII detection and masking accuracy<br>• Accuracy of summarization, tagging, and classification<br>• Search quality and data ingestion feasibility |

## 3. PoC Objectives and Architecture

### 3.1 PoC Objectives and Success Criteria

| PoC Type | Success Criteria (KPI) |
| --- | --- |
| Technical PoC | 1. ROT data detection logic can automatically exclude 20% or more of target documents as ROT data.<br>2. Detect PII (Personal Identifiable Information) items with 99% or higher accuracy and mask them within the pipeline.<br>3. Generate responses to user "impact analysis" queries within 10 seconds. |
| Business PoC | 1. 80% or more of evaluators rate the presented "Impact Analysis Report" as "more comprehensive than manual investigation and provided insights."<br>2. 80% or more of evaluators rate the presented "Automation Candidate List" as "valid and contributing to cost reduction."<br>3. Based on PoC results, stakeholders can clearly determine whether to proceed with full-scale implementation. |

## 4. PoC Execution Plan: Schedule and Discussion Points

### Phase 1: Fixed Implementation Limited to Infrastructure (Late February - Late May)

| Month | Week | Schedule (Main Tasks) | Key Discussion Points (Weekly Meeting Agenda) |
| --- | --- | --- | --- |
| Late February | 1-2 | Preparation, planning, kickoff, goal/KPI agreement, ROT/PII definition, Box integration, environment setup | **Agenda**: Goal setting and evaluation criteria definition for Themes 1 and 3<br>**Discussion**: How to quantitatively evaluate "impact level" and "risks/concerns"?<br>**Discussion**: What are the definitions of ROT/PII and acceptable levels of false positives/misses? |
| March | 3-6 | Development, implementation, data pipeline construction, RAG and Agent development | **Agenda**: Evaluation of data cleansing, analysis, and search capabilities<br>**Discussion**: Is the ROT exclusion logic working as expected?<br>**Discussion**: Does ai_parse_document extraction accuracy meet expectations?<br>**Discussion**: Are search result relevance and answer quality sufficient? |
| April | 7-10 | Continued development, testing, and refinement | **Agenda**: Progress review and technical validation<br>**Discussion**: Are performance targets being met?<br>**Discussion**: What improvements are needed? |
| May | 11-14 | Final testing, evaluation, and improvement | **Agenda**: Comprehensive system evaluation<br>**Discussion**: Are all PoC objectives being achieved?<br>**Discussion**: What are the key learnings and recommendations? |
| Late May | 15-16 | Final report, Phase 2 planning | **Agenda**: Business PoC evaluation workshop<br>**Discussion**: Is the presented "Impact Analysis Report" useful in practice?<br>**Discussion**: What are Phase 2 priorities and scope? |

### Phase 2: Data Source Expansion and Feature Addition (April onwards)

(Details to be determined based on Phase 1 results)

## 5. Data Architecture

| Pipeline # | Pipeline Name | Source Layer | Target Layer | SCD Strategy | Error Handling Strategy | Implementation Details |
|------------|---------------|--------------|--------------|--------------|------------------------|----------------------|
| 1 | Raw Ingestion to Bronze | External Source | Bronze | **Append-only** (Immutable) | • Schema merge with `mode("append")` and `option("mergeSchema", "true")`<br>• Structured error codes: `INGESTION_SOURCE_ERROR_TYPE`<br>• Fail fast on connection failures<br>• Log ingestion metadata (rows processed, timestamps) | • Use Auto Loader for streaming or batch ingestion<br>• Preserve source data format (PascalCase allowed for existing columns)<br>• Add metadata columns: `ingestion_timestamp`, `source_system`, `env` (snake_case)<br>• No data transformation or validation at this stage |
| 2 | Bronze to ROT Filtered | Bronze | Bronze (ROT Filtered) | **Append-only** | • ROT detection logic with configurable thresholds<br>• Quarantine ROT records to `bronze_{data_source}_rot_quarantined`<br>• Error codes: `ROT_DETECTION_ERROR_TYPE`<br>• Log ROT exclusion rate and metrics | • Filter redundant, obsolete, or trivial data based on business rules<br>• Maintain audit trail of filtered records<br>• Target: >20% ROT exclusion rate (per PoC requirements)<br>• Preserve all valid records in filtered output |
| 3 | ROT Filtered to PII Masked Silver | Bronze (ROT Filtered) | Silver | **SCD Type 2** (REQUIRED) | • **DLT Expectations**: Use `@dlt.expect_or_drop` for invalid data quarantine<br>• **Quarantine**: Invalid records to `silver_{data_source}_quarantined`<br>• **Quarantine reason format**: `{TYPE}_{COLUMN_NAME}` (e.g., `Invalid_Id`, `Name_NULL_or_EMPTY`)<br>• **Error codes**: `VALIDATION_ERROR_TYPE`, `PII_MASKING_ERROR_TYPE`<br>• **DLT auto-optimization**: Enable `pipelines.autoOptimize.managed: "true"` | • **SCD Type 2 columns**: `valid_from`, `valid_to`, `is_current`<br>• **Change detection**: Hash comparison recommended<br>• **PII masking**: Apply masking/redaction for sensitive data<br>• **Method**: DLT creates `_dlt` table → rename to production (REQUIRED for production)<br>• **Write mode**: `mode("append")` with `option("mergeSchema", "true")`<br>• **Target**: >99% PII detection accuracy (per PoC requirements) |
| 4 | Silver to Chunked Gold | Silver | Gold | **SCD Type 1** (Full Recalculation, Overwrite) | • Basic validation before chunking<br>• Error codes: `CHUNKING_ERROR_TYPE`, `VECTORIZATION_ERROR_TYPE`<br>• Log chunking metrics (chunk count, average size, overlap ratio)<br>• Fail fast on critical errors | • **Write mode**: `mode("overwrite")` with `option("overwriteSchema", "true")` (REQUIRED)<br>• **Chunking strategy**: Document-based chunking with configurable size and overlap<br>• **Column naming**: All columns must be snake_case (REQUIRED)<br>• **Partitioning**: Partition on date/time columns (REQUIRED)<br>• **Z-ORDER**: Use for frequently filtered columns (REQUIRED when applicable)<br>• **Materialized Views**: Use for hot queries (REQUIRED when performance is critical) |

### Notes

#### SCD Strategy Rationale
- **Bronze (Append-only)**: Raw data is immutable; preserve complete history
- **ROT Filtered (Append-only)**: Filtered data remains append-only for audit purposes
- **Silver (Type 2)**: REQUIRED by standards for change history management and time-series analysis
- **Gold (Type 1)**: Chunked data is recalculated; current state is sufficient

#### Error Handling Rationale
- **Bronze**: Minimal validation; preserve raw data integrity
- **ROT Filtered**: Quarantine invalid/ROT records for review
- **Silver**: Comprehensive DLT Expectations with quarantine (REQUIRED)
- **Gold**: Validation focused on chunking/vectorization process integrity

### Write Operations (REQUIRED)
- **Bronze/Silver**: Use `mergeSchema` with `mode("append")` for schema evolution
- **Gold**: Use `overwriteSchema` with `mode("overwrite")` to prevent schema conflicts
- **Prohibited**: DROP TABLE + CREATE TABLE pattern (breaks data continuity)

## 5. Team Structure

| Role | Main Responsibilities | Headcount |
| --- | --- | --- |
| Project Manager/Leader | Overall project management, stakeholder coordination | 1 person |
| Data Engineer/ML Engineer | Databricks environment setup, program development, evaluation | 1-2 people |
| Domain Expert | Data selection, output evaluation, feedback provision | 2-3 people |


## Contact

- **Project Owner**: PM Team
- **Email**: cheng.wang@myteam.com
- **Repository**: [Add repository URL]

---

**Created**: December 3, 2025  
**Last Updated**: January 27, 2026  
**Author**: myteam
