# Silver DLT Pipeline (Lakeflow Spark Declarative)

**Author:** Cheng Wang  
**Contact:** cheng.wang@myteam.com  
**Date / Last Modified:** 2026-03-04  

## Overview

Single **Delta Live Tables (DLT)** pipeline that reads from `kazuki_jedai.bronze` and writes to `kazuki_jedai.silver` (Discord star schema).

- **Entry point:** `00_silver_cleansing_dlt_integrated.py`
- **Bronze sources:** `discord_channels_raw`, `discord_messages_raw`, `discord_voice_activity_raw`
- **Silver tables:** `guild_dim`, `user_dim`, `category_dim`, `channel_dim`, `channel_latest` (internal), `message_fact`, `voice_chat_fact`

## Create the pipeline in Databricks

1. **Repos:** Pull this repo into your Databricks workspace (e.g. Repos → Add Repo → your Git URL).

2. **Pipelines UI:** Workflows → Delta Live Tables → Create Pipeline.

3. **Settings:**
   - **Pipeline name:** e.g. `kazuki_jedai_silver_discord`
   - **Product edition:** Advanced (or Standard if you don’t need expectations)
   - **Source code:** Add one source:
     - **Path type:** Repo (or Workspace)
     - **Path:** Path to this folder in the repo, e.g.  
       `Repos/<your-folder>/jedai_pj/scripts/03_silver/dlt`
     - **Script:** `00_silver_cleansing_dlt_integrated.py`  
     (Or add the single file: `.../scripts/03_silver/dlt/00_silver_cleansing_dlt_integrated.py`.)
   - **Destination:**
     - **Catalog:** `kazuki_jedai`
     - **Schema / Database:** `silver`
   - **Storage location:** e.g. `dbfs:/mnt/delta/kazuki_jedai/silver_pipeline/` (or your managed path)
   - **Pipeline mode:** Triggered (for batch, e.g. daily) or Continuous (streaming)

4. **Cluster / channel:** Choose a DLT channel or create one (e.g. current channel, autoscale).

5. **Run:** Start the pipeline. Tables are created/updated under `kazuki_jedai.silver`.

## Prerequisites

- Catalog `kazuki_jedai` and schemas `bronze`, `silver` exist.
- Bronze tables are populated: `discord_channels_raw`, `discord_messages_raw`, `discord_voice_activity_raw`.
- (Optional) Run `scripts/03_silver/01_create_silver_tables.sql` once if you want empty silver tables with partitioning already defined; DLT will append to or replace them depending on configuration.

## Scheduling (batch, e.g. daily)

In the pipeline settings, set **Pipeline mode** to **Triggered** and add a **Schedule** (e.g. daily at 2:00 AM). Alternatively, trigger the pipeline from a Databricks Job that runs after your bronze ingestion.

## Tables produced

| Table            | Source(s)                    | Grain                    |
|------------------|-----------------------------|--------------------------|
| guild_dim        | discord_channels_raw        | One row per guild        |
| category_dim     | discord_channels_raw        | One row per category     |
| channel_dim      | discord_channels_raw        | One row per channel per snapshot_date |
| user_dim         | discord_messages_raw, discord_voice_activity_raw | One row per user |
| channel_latest   | channel_dim                 | Latest channel per channel_id (internal) |
| message_fact     | discord_messages_raw + channel_latest | One row per message |
| voice_chat_fact  | discord_voice_activity_raw  | One row per voice session |
