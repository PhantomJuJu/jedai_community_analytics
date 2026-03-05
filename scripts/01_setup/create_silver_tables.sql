-- -----------------------------------------------------------------------------
-- Title: Create Silver Layer Tables (Discord Star Schema)
-- Summary: DDL for silver dimension and fact tables per data model.
--          Creates channel_dim, guild_dim, user_dim, category_dim, message_fact,
--          voice_chat_fact in kazuki_jedai.silver with partitioning and comments.
-- Execution: Run in Databricks SQL or notebook. Prerequisites: catalog `kazuki_jedai` and
--           schema `silver` must exist (e.g. via 01_setup/01_create_catalog_schema).
-- Author: Cheng Wang
-- Contact: cheng.wang@myteam.com
-- Date / Last Modified: 2026-03-04
-- -----------------------------------------------------------------------------

-- Use catalog and schema
USE CATALOG kazuki_jedai;
USE SCHEMA silver;

-- =============================================================================
-- Dimension tables (create first; no cross-dependencies)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- guild_dim: one row per unique guild (Discord server)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.silver.guild_dim (
  guild_id   BIGINT NOT NULL,
  guild_name STRING NOT NULL
)
USING DELTA
COMMENT 'Silver dimension: one row per unique guild (Discord server).';

COMMENT ON TABLE kazuki_jedai.silver.guild_dim IS 'Silver dimension table for Discord guilds (servers). One row per unique guild.';

COMMENT ON COLUMN kazuki_jedai.silver.guild_dim.guild_id   IS 'Primary key; Discord guild (server) snowflake ID.';
COMMENT ON COLUMN kazuki_jedai.silver.guild_dim.guild_name IS 'Guild display name.';

-- -----------------------------------------------------------------------------
-- user_dim: one row per unique user
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.silver.user_dim (
  user_id   BIGINT NOT NULL,
  user_name STRING NOT NULL
)
USING DELTA
COMMENT 'Silver dimension: one row per unique user.';

COMMENT ON TABLE kazuki_jedai.silver.user_dim IS 'Silver dimension table for Discord users. One row per unique user.';

COMMENT ON COLUMN kazuki_jedai.silver.user_dim.user_id   IS 'Primary key; Discord user snowflake ID.';
COMMENT ON COLUMN kazuki_jedai.silver.user_dim.user_name IS 'User display name.';

-- -----------------------------------------------------------------------------
-- category_dim: one row per unique category
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.silver.category_dim (
  category_id   BIGINT NOT NULL,
  category_name STRING NOT NULL
)
USING DELTA
COMMENT 'Silver dimension: one row per unique channel category.';

COMMENT ON TABLE kazuki_jedai.silver.category_dim IS 'Silver dimension table for Discord channel categories. One row per unique category.';

COMMENT ON COLUMN kazuki_jedai.silver.category_dim.category_id   IS 'Primary key; Discord category snowflake ID.';
COMMENT ON COLUMN kazuki_jedai.silver.category_dim.category_name IS 'Category display name.';

-- -----------------------------------------------------------------------------
-- channel_dim: one row per unique channel (historized by snapshot_date)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.silver.channel_dim (
  channel_id    BIGINT NOT NULL,
  guild_id      BIGINT NOT NULL,
  snapshot_date DATE   NOT NULL,
  channel_type  INT    NOT NULL,
  channel_name STRING NOT NULL,
  category_id   BIGINT
)
USING DELTA
PARTITIONED BY (snapshot_date)
COMMENT 'Silver dimension: one row per unique channel per snapshot date.';

COMMENT ON TABLE kazuki_jedai.silver.channel_dim IS 'Silver dimension table for Discord channels. One row per unique channel per snapshot_date (historized).';

COMMENT ON COLUMN kazuki_jedai.silver.channel_dim.channel_id    IS 'Primary key; Discord channel snowflake ID.';
COMMENT ON COLUMN kazuki_jedai.silver.channel_dim.guild_id     IS 'Foreign key to guild_dim.guild_id.';
COMMENT ON COLUMN kazuki_jedai.silver.channel_dim.snapshot_date IS 'Snapshot date for this channel record (partition key).';
COMMENT ON COLUMN kazuki_jedai.silver.channel_dim.channel_type  IS 'Discord channel type (e.g. text, voice).';
COMMENT ON COLUMN kazuki_jedai.silver.channel_dim.channel_name  IS 'Channel display name.';
COMMENT ON COLUMN kazuki_jedai.silver.channel_dim.category_id  IS 'Foreign key to category_dim.category_id; NULL if uncategorized.';

-- =============================================================================
-- Fact tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- message_fact: one row per unique message
-- Partitioned by message_date for daily batch and query performance.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.silver.message_fact (
  message_id       BIGINT    NOT NULL,
  channel_id       BIGINT    NOT NULL,
  guild_id         BIGINT    NOT NULL,
  user_id          BIGINT    NOT NULL,
  category_id      BIGINT,
  content          STRING,
  timestamp        TIMESTAMP NOT NULL,
  edited_timestamp TIMESTAMP,
  attachment_count INT       NOT NULL,
  reaction_count   INT       NOT NULL,
  is_pinned        BOOLEAN   NOT NULL,
  message_date     DATE      NOT NULL
)
USING DELTA
PARTITIONED BY (message_date)
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact'   = 'true'
)
COMMENT 'Silver fact: one row per unique message. Partitioned by message_date.';

COMMENT ON TABLE kazuki_jedai.silver.message_fact IS 'Silver fact table for Discord messages. One row per unique message. Partitioned by message_date for daily batch.';

COMMENT ON COLUMN kazuki_jedai.silver.message_fact.message_id       IS 'Primary key; Discord message snowflake ID.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.channel_id       IS 'Foreign key to channel_dim.channel_id.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.guild_id         IS 'Foreign key to guild_dim.guild_id.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.user_id          IS 'Foreign key to user_dim.user_id.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.category_id     IS 'Foreign key to category_dim.category_id.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.content          IS 'Message text content.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.timestamp        IS 'Message creation time.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.edited_timestamp IS 'Last edit time; NULL if never edited.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.attachment_count IS 'Number of attachments.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.reaction_count   IS 'Total reaction count.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.is_pinned        IS 'Whether the message is pinned.';
COMMENT ON COLUMN kazuki_jedai.silver.message_fact.message_date     IS 'Date of message (partition key); derived from timestamp in ETL.';

-- -----------------------------------------------------------------------------
-- voice_chat_fact: one row per unique voice session
-- Partitioned by session_date for daily batch and query performance.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.silver.voice_chat_fact (
  session_id   BIGINT    NOT NULL,
  channel_id   BIGINT    NOT NULL,
  guild_id     BIGINT    NOT NULL,
  user_id      BIGINT    NOT NULL,
  joined_at    TIMESTAMP NOT NULL,
  left_at      TIMESTAMP,
  session_date DATE      NOT NULL
)
USING DELTA
PARTITIONED BY (session_date)
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact'   = 'true'
)
COMMENT 'Silver fact: one row per unique voice session. Partitioned by session_date.';

COMMENT ON TABLE kazuki_jedai.silver.voice_chat_fact IS 'Silver fact table for Discord voice chat sessions. One row per unique session. Partitioned by session_date for daily batch.';

COMMENT ON COLUMN kazuki_jedai.silver.voice_chat_fact.session_id   IS 'Primary key; unique voice session ID.';
COMMENT ON COLUMN kazuki_jedai.silver.voice_chat_fact.channel_id   IS 'Foreign key to channel_dim.channel_id.';
COMMENT ON COLUMN kazuki_jedai.silver.voice_chat_fact.guild_id     IS 'Foreign key to guild_dim.guild_id.';
COMMENT ON COLUMN kazuki_jedai.silver.voice_chat_fact.user_id      IS 'Foreign key to user_dim.user_id.';
COMMENT ON COLUMN kazuki_jedai.silver.voice_chat_fact.joined_at    IS 'When the user joined the voice channel.';
COMMENT ON COLUMN kazuki_jedai.silver.voice_chat_fact.left_at      IS 'When the user left; NULL if still in channel or unknown.';
COMMENT ON COLUMN kazuki_jedai.silver.voice_chat_fact.session_date IS 'Date of session start (partition key); derived from joined_at in ETL.';

-- =============================================================================
-- Post-create: Z-ORDER (run after tables are populated for best effect)
-- Frequently filtered columns per company best practices.
-- =============================================================================
-- OPTIMIZE kazuki_jedai.silver.message_fact ZORDER BY (channel_id, user_id, timestamp);
-- OPTIMIZE kazuki_jedai.silver.voice_chat_fact ZORDER BY (channel_id, user_id, joined_at);
-- (Uncomment and run periodically or as part of maintenance workflow.)
