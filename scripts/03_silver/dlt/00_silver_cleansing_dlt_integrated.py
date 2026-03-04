"""
Lakeflow Spark Declarative Pipeline: Bronze → Silver (Discord Star Schema)

Reads from `kazuki_jedai.bronze` and writes to `kazuki_jedai.silver`.
Run as a Delta Live Tables (DLT) pipeline in Databricks.

Bronze sources: discord_channels_raw, discord_messages_raw, discord_voice_activity_raw
Silver targets: guild_dim, user_dim, category_dim, channel_dim, message_fact, voice_chat_fact
Quarantine tables: *_quarantined for each target table

Author: Cheng Wang
Contact: cheng.wang@myteam.com
Date / Last Modified: 2026-03-04
"""

import dlt
from pyspark.sql import functions as F
from pyspark.sql.window import Window

# Import quarantine utilities
import sys
sys.path.append("/Workspace/Repos/cheng.wang@myteam.com/jedai_pj/scripts/03_silver")
from common import quarantine_utils as qutils

CATALOG = "kazuki_jedai"
BRONZE_SCHEMA = f"{CATALOG}.bronze"


def _safe_bigint(col_name: str):
    """Cast column to BIGINT; handles STRING or numeric types from bronze. Discord IDs are 64-bit."""
    return F.col(col_name).cast("long").alias(col_name)


def _safe_timestamp(col_name: str):
    """Parse string or timestamp to TIMESTAMP."""
    return F.to_timestamp(F.col(col_name)).alias(col_name)


def _safe_date(col_name: str):
    """Parse string or date to DATE."""
    return F.to_date(F.col(col_name)).alias(col_name)


# -----------------------------------------------------------------------------
# Helper functions for quarantine pattern
# -----------------------------------------------------------------------------


def _transform_guild_dim_with_quarantine():
    """Transform guild_dim with quarantine validation. One row per guild_id (max guild_name)."""
    df = (
        spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
        .select(_safe_bigint("guild_id"), F.col("guild_name").cast("string").alias("guild_name"))
        .filter(F.col("guild_id").isNotNull())
        .groupBy("guild_id")
        .agg(F.max("guild_name").alias("guild_name"))
    )
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "guild_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_name_column(df, "guild_name", min_length=1, allow_null=False, reason_prefix="Name")
    df = qutils.set_quarantine_timestamp(df)
    return df


def _transform_category_dim_with_quarantine():
    """Transform category_dim with quarantine validation."""
    df = (
        spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
        .filter(F.col("channel_type") == 4)  # Filter first for predicate pushdown
        .select(
            _safe_bigint("channel_id").alias("category_id"),
            F.col("channel_name").cast("string").alias("category_name"),
        )
        .distinct()
    )
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "category_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_name_column(df, "category_name", min_length=1, allow_null=False, reason_prefix="Name")
    df = qutils.set_quarantine_timestamp(df)
    return df


def _transform_channel_dim_with_quarantine():
    """Transform channel_dim with quarantine validation."""
    df = (
        spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
        .filter(F.col("channel_type") != 4)  # Filter first for predicate pushdown
        .select(
            _safe_bigint("channel_id"),
            _safe_bigint("guild_id"),
            F.coalesce(_safe_date("snapshot_date"), F.current_date()).alias("snapshot_date"),
            F.col("channel_type").cast("int").alias("channel_type"),
            F.col("channel_name").cast("string").alias("channel_name"),
            F.when(F.col("category_id").isNotNull(), _safe_bigint("category_id"))
            .otherwise(F.lit(None).cast("long"))
            .alias("category_id"),
        )
    )
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "channel_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_id_column(df, "guild_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_name_column(df, "channel_name", min_length=1, allow_null=False, reason_prefix="Name")
    df = qutils.validate_required_not_empty(df, "channel_type", reason_type="NULL_or_INVALID")
    df = qutils.validate_required_not_empty(df, "snapshot_date", reason_type="NULL")
    # Additional validation: channel_type should not be 4
    df = qutils._append_quarantine_reason(
        df, 
        F.col("channel_type") == 4, 
        "Invalid_channel_type_should_not_be_category"
    )
    df = qutils.set_quarantine_timestamp(df)
    return df


def _transform_user_dim_with_quarantine():
    """Transform user_dim with quarantine validation. One row per user_id (max user_name)."""
    messages = spark.table(f"{BRONZE_SCHEMA}.discord_messages_raw").select(
        _safe_bigint("user_id"),
        F.col("user_name").cast("string").alias("user_name"),
    )
    voice = spark.table(f"{BRONZE_SCHEMA}.discord_voice_activity_raw").select(
        _safe_bigint("user_id"),
        F.col("user_name").cast("string").alias("user_name"),
    )
    df = (
        messages.unionByName(voice, allowMissingColumns=True)
        .groupBy("user_id")
        .agg(F.max("user_name").alias("user_name"))
    )
    
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "user_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_name_column(df, "user_name", min_length=1, allow_null=False, reason_prefix="Name")
    df = qutils.set_quarantine_timestamp(df)
    return df


def _transform_message_fact_with_quarantine():
    """Transform message_fact with quarantine validation. category_id from bronze."""
    messages = (
        spark.table(f"{BRONZE_SCHEMA}.discord_messages_raw")
        .filter(F.col("message_id").isNotNull())  # Early filter for dropDuplicates
    )
    ts = F.to_timestamp(F.col("timestamp"))
    df = (
        messages.select(
            _safe_bigint("message_id").alias("message_id"),
            _safe_bigint("channel_id").alias("channel_id"),
            _safe_bigint("guild_id").alias("guild_id"),
            _safe_bigint("user_id").alias("user_id"),
            F.when(F.col("category_id").isNotNull(), _safe_bigint("category_id"))
            .otherwise(F.lit(None).cast("long"))
            .alias("category_id"),
            F.col("content").cast("string").alias("content"),
            F.when(ts.isNotNull(), ts).otherwise(F.current_timestamp()).alias("timestamp"),
            F.to_timestamp(F.col("edited_timestamp")).alias("edited_timestamp"),
            F.coalesce(F.col("attachment_count").cast("int"), F.lit(0)).alias("attachment_count"),
            F.coalesce(F.col("reaction_count").cast("int"), F.lit(0)).alias("reaction_count"),
            F.coalesce(F.col("is_pinned").cast("boolean"), F.lit(False)).alias("is_pinned"),
        )
        .withColumn(
            "message_date",
            F.coalesce(F.to_date("timestamp"), F.current_date()),
        )
        .dropDuplicates(["message_id"])
    )
    
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "message_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_id_column(df, "channel_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_id_column(df, "guild_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_id_column(df, "user_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_required_not_empty(df, "timestamp", reason_type="NULL")
    df = qutils.validate_required_not_empty(df, "message_date", reason_type="NULL")
    df = qutils.validate_numeric_column(df, "attachment_count", min_value=0, allow_null=False, reason_prefix="Invalid")
    df = qutils.validate_numeric_column(df, "reaction_count", min_value=0, allow_null=False, reason_prefix="Invalid")
    df = qutils.validate_required_not_empty(df, "is_pinned", reason_type="NULL")
    df = qutils.set_quarantine_timestamp(df)
    return df


def _transform_voice_chat_fact_with_quarantine():
    """Transform voice_chat_fact with quarantine validation. category_id from bronze."""
    voice = (
        spark.table(f"{BRONZE_SCHEMA}.discord_voice_activity_raw")
        .filter(F.col("session_id").isNotNull())  # Early filter for dropDuplicates
    )
    joined_ts = F.to_timestamp(F.col("joined_at"))
    df = (
        voice.select(
            F.xxhash64(F.col("session_id")).cast("long").alias("session_id"),
            _safe_bigint("channel_id").alias("channel_id"),
            _safe_bigint("guild_id").alias("guild_id"),
            _safe_bigint("user_id").alias("user_id"),
            F.when(F.col("category_id").isNotNull(), _safe_bigint("category_id"))
            .otherwise(F.lit(None).cast("long"))
            .alias("category_id"),
            F.when(joined_ts.isNotNull(), joined_ts).otherwise(F.current_timestamp()).alias("joined_at"),
            _safe_timestamp("left_at"),
        )
        .withColumn(
            "session_date",
            F.coalesce(F.to_date("joined_at"), F.current_date()),
        )
        .dropDuplicates(["session_id"])
    )
    
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "session_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_id_column(df, "channel_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_id_column(df, "guild_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_id_column(df, "user_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_required_not_empty(df, "joined_at", reason_type="NULL")
    df = qutils.validate_required_not_empty(df, "session_date", reason_type="NULL")
    df = qutils.set_quarantine_timestamp(df)
    return df


# -----------------------------------------------------------------------------
# Staging tables (compute once; main + quarantined read from these)
# -----------------------------------------------------------------------------


@dlt.table(
    name="guild_dim_staging",
    comment="Staging: guild transform with quarantine. Read by guild_dim and guild_dim_quarantined.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def guild_dim_staging():
    """One transform for both guild_dim and guild_dim_quarantined."""
    return _transform_guild_dim_with_quarantine()


@dlt.table(
    name="category_dim_staging",
    comment="Staging: category transform with quarantine. Read by category_dim and category_dim_quarantined.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def category_dim_staging():
    """One transform for both category_dim and category_dim_quarantined."""
    return _transform_category_dim_with_quarantine()


@dlt.table(
    name="channel_dim_staging",
    comment="Staging: channel transform with quarantine. Read by channel_dim and channel_dim_quarantined.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_dim_staging():
    """One transform for both channel_dim and channel_dim_quarantined."""
    return _transform_channel_dim_with_quarantine()


@dlt.table(
    name="user_dim_staging",
    comment="Staging: user transform with quarantine. Read by user_dim and user_dim_quarantined.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def user_dim_staging():
    """One transform for both user_dim and user_dim_quarantined."""
    return _transform_user_dim_with_quarantine()


@dlt.table(
    name="message_fact_staging",
    comment="Staging: message transform with quarantine. Read by message_fact and message_fact_quarantined.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def message_fact_staging():
    """One transform for both message_fact and message_fact_quarantined."""
    return _transform_message_fact_with_quarantine()


@dlt.table(
    name="voice_chat_fact_staging",
    comment="Staging: voice transform with quarantine. Read by voice_chat_fact and voice_chat_fact_quarantined.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def voice_chat_fact_staging():
    """One transform for both voice_chat_fact and voice_chat_fact_quarantined."""
    return _transform_voice_chat_fact_with_quarantine()


# -----------------------------------------------------------------------------
# Dimensions (from channels + messages + voice)
# -----------------------------------------------------------------------------


@dlt.table(
    name="guild_dim",
    comment="Silver dimension: one row per unique guild (Discord server). Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def guild_dim():
    """One row per unique guild. Source: guild_dim_staging."""
    df = dlt.read("guild_dim_staging")
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="guild_dim_quarantined",
    comment="Quarantined records from guild_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def guild_dim_quarantined():
    """Invalid guild records with quarantine reasons."""
    return qutils.filter_invalid_records(dlt.read("guild_dim_staging"))


@dlt.table(
    name="category_dim",
    comment="Silver dimension: one row per unique category (channel_type = 4). Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def category_dim():
    """
    One row per unique category. Categories are channels with channel_type = 4.
    Source: category_dim_staging.
    """
    df = dlt.read("category_dim_staging")
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="category_dim_quarantined",
    comment="Quarantined records from category_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def category_dim_quarantined():
    """Invalid category records with quarantine reasons."""
    return qutils.filter_invalid_records(dlt.read("category_dim_staging"))


@dlt.table(
    name="channel_dim",
    comment="Silver dimension: one row per unique channel per snapshot_date (excludes categories). Valid records only.",
    partition_cols=["snapshot_date"],
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_dim():
    """
    One row per channel per snapshot_date. Excludes category channels (type 4).
    Source: channel_dim_staging.
    """
    df = dlt.read("channel_dim_staging")
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="channel_dim_quarantined",
    comment="Quarantined records from channel_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_dim_quarantined():
    """Invalid channel records with quarantine reasons."""
    return qutils.filter_invalid_records(dlt.read("channel_dim_staging"))


@dlt.table(
    name="user_dim",
    comment="Silver dimension: one row per unique user. Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def user_dim():
    """One row per unique user. Source: user_dim_staging."""
    df = dlt.read("user_dim_staging")
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="user_dim_quarantined",
    comment="Quarantined records from user_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def user_dim_quarantined():
    """Invalid user records with quarantine reasons."""
    return qutils.filter_invalid_records(dlt.read("user_dim_staging"))


# -----------------------------------------------------------------------------
# Facts (depend on dimensions)
# -----------------------------------------------------------------------------


@dlt.table(
    name="channel_latest",
    comment="Latest channel snapshot per channel_id for lookups.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_latest():
    """One row per channel_id with latest snapshot_date."""
    return (
        dlt.read("channel_dim")
        .withColumn(
            "_rn",
            F.row_number().over(
                Window.partitionBy("channel_id").orderBy(F.desc("snapshot_date"))
            ),
        )
        .filter(F.col("_rn") == 1)
        .drop("_rn", "snapshot_date", "channel_type", "channel_name")
    )


@dlt.table(
    name="message_fact",
    comment="Silver fact: one row per unique message. Valid records only.",
    partition_cols=["message_date"],
    table_properties={
        "pipelines.autoOptimize.managed": "true",
        "delta.autoOptimize.optimizeWrite": "true",
        "delta.autoOptimize.autoCompact": "true",
    },
)
@dlt.expect("message_date_matches_timestamp", "DATE(timestamp) = message_date")
def message_fact():
    """One row per message. Source: message_fact_staging."""
    df = dlt.read("message_fact_staging")
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="message_fact_quarantined",
    comment="Quarantined records from message_fact with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def message_fact_quarantined():
    """Invalid message records with quarantine reasons."""
    return qutils.filter_invalid_records(dlt.read("message_fact_staging"))


@dlt.table(
    name="voice_chat_fact",
    comment="Silver fact: one row per unique voice session. Valid records only.",
    partition_cols=["session_date"],
    table_properties={
        "pipelines.autoOptimize.managed": "true",
        "delta.autoOptimize.optimizeWrite": "true",
        "delta.autoOptimize.autoCompact": "true",
    },
)
@dlt.expect("session_date_matches_joined_at", "DATE(joined_at) = session_date")
@dlt.expect("valid_session_duration", "left_at IS NULL OR left_at >= joined_at")
def voice_chat_fact():
    """One row per voice session. Source: voice_chat_fact_staging."""
    df = dlt.read("voice_chat_fact_staging")
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="voice_chat_fact_quarantined",
    comment="Quarantined records from voice_chat_fact with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def voice_chat_fact_quarantined():
    """Invalid voice session records with quarantine reasons."""
    return qutils.filter_invalid_records(dlt.read("voice_chat_fact_staging"))
