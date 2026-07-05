# Discord Community Analytics Platform on Databricks

> An end-to-end Lakehouse platform that ingests Discord community activity data, transforms it through a Bronze / Silver / Gold medallion architecture, and serves dashboards and LLM-powered announcement generation via Databricks Apps.

**🎤 Presented at [JEDAI](https://jedai.connpass.com/event/390596/) — the official Databricks user community in Japan**

- 📺 [Talk recording (YouTube)](https://youtu.be/gPEMRsjkaco)
- 📊 [Slides (Speaker Deck)](https://speakerdeck.com/phantomjuju/da-xue-sheng-gaben-qi-dedatabrickswohuo-yong-sitediscordsakuruwodetaqu-dong-sasetemita)
- 📝 [Event page (connpass)](https://jedai.connpass.com/event/390596/)

[![platform](https://img.shields.io/badge/platform-Databricks-orange)]()
[![source](https://img.shields.io/badge/source-Discord%20API-blue)]()
[![python](https://img.shields.io/badge/python-3.9+-blue)]()

---

## Overview

Community management is usually driven by gut feeling. This project replaces that with data: it continuously collects activity data from a Discord server (messages, voice sessions, member events), lands it in a Databricks Lakehouse, and turns it into dashboards and AI-assisted operations that community organizers actually use for decision-making.

The project is organized around a four-stage community operations cycle:

1. **Observe** — measure community activity objectively and detect changes
2. **Design** — prioritize initiatives based on data and hypotheses
3. **Execute** — run initiatives reproducibly (e.g., LLM-generated event announcements)
4. **Validate & improve** — quantify results and feed learnings back into design

## Architecture

```
Discord API
    │  (Python bot / collectors on EC2, Dockerized)
    ▼
Bronze (raw Delta tables, append + mergeSchema)
    │
    ▼  Delta Live Tables — cleansing, validation, Expectations,
    │  quarantine tables for rejected records
Silver (cleansed, validated)
    │
    ▼  aggregation logic (weekday/hour trends, user & channel activity)
Gold (4 aggregate tables: activity_daily, activity_by_weekday_hour,
      user_activity, channel_activity)
    │
    ├─▶ Lakehouse Dashboards (time series, heatmaps, rankings, data quality)
    └─▶ Databricks Apps (web dashboard + few-shot LLM announcement generator
                          + AI/BI Genie integration)
```

Orchestrated end-to-end with **Databricks Workflows** on a schedule.

### Key components

| Component | Description |
|---|---|
| `scripts/01_setup` | Discord bot & API server (data collection, scheduled posting) |
| `scripts/02_bronze` – `04_gold` | Medallion-layer table definitions and transformations (DLT / notebooks) |
| `scripts/05_models` | ML experiments on community data (survival analysis, A/B testing) |
| `scripts/06_dashboards` | Dashboard definitions and metric queries |
| `scripts/07_workflows` | Databricks Workflows pipeline definitions |
| `apps/discord-platform-jedai` | Databricks App: web dashboard, few-shot LLM announcement generation, Genie integration (TypeScript + SQL) |
| `guides/` | Design docs: DLT implementation, SCD Type 2 comparison, quarantine design, dashboard metrics |

### Design highlights

- **Medallion architecture with quarantine tables** — invalid records are quarantined with rejection reasons instead of being dropped, keeping data quality auditable
- **DLT Expectations** for declarative data validation between Bronze and Silver
- **SCD Type 2** evaluated across three implementation approaches (see `guides/implementation/SCD_TYPE2_THREE_APPROACHES_COMPARISON.md`)
- **Few-shot prompting** for event announcement generation, deployed as a Databricks App with prompt construction shared between notebook and app runtimes
- **Bot on EC2 (Dockerized)** posts LLM-generated announcements directly to Discord, with whitelist-based guild/channel/role controls

## Getting started

### Prerequisites

- A Databricks workspace (Unity Catalog enabled) and a SQL Warehouse
- A Discord bot token with read access to your target server
- Python 3.9+

### Setup

1. Clone this repository
2. Copy `jedai-bot.env.example` to `jedai-bot.env` and fill in your Discord token, Databricks host/token, catalog and schema (the file is gitignored)
3. Run the collectors in `scripts/01_setup` to start landing raw data into Bronze
4. Create the DLT pipeline from `scripts/03_silver` and the Gold aggregation jobs from `scripts/04_gold`
5. Schedule everything with the Workflow definitions in `scripts/07_workflows`
6. (Optional) Deploy the web app: see `apps/discord-platform-jedai` — copy its `.env.example`, then deploy as a Databricks App

## Roadmap

- **Phase 1 (done)** — data foundation: ingestion, medallion pipeline, dashboards
- **Phase 2 (done)** — LLM-powered announcement generation (few-shot), web dashboard on Databricks Apps, bot stabilization
- **Phase 3 (planned)** — RAG-based agent for community Q&A, announcement timing/targeting optimization, action-item recommendation

## About

Built as a team project for the JEDAI (Japan Databricks user community) Discord server and presented at a JEDAI event ([recording](https://youtu.be/gPEMRsjkaco) / [slides](https://speakerdeck.com/phantomjuju/da-xue-sheng-gaben-qi-dedatabrickswohuo-yong-sitediscordsakuruwodetaqu-dong-sasetemita)).

My role ([@PhantomJuJu](https://github.com/PhantomJuJu)): pipeline design and implementation (Bronze/Silver/Gold, DLT, Workflows), dashboards, few-shot LLM announcement generator, Databricks App, and the JEDAI presentation.
