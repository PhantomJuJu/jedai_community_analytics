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


def _safe_int(col_name: str):
    """Cast column to INT; handles STRING or numeric types from bronze."""
    return F.col(col_name).cast("int").alias(col_name)


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
    """Transform guild_dim with quarantine validation."""
    df = spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
    df = (
        df.select(
            _safe_int("guild_id"),
            F.col("guild_name").cast("string").alias("guild_name"),
        )
        .distinct()
    )
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "guild_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_name_column(df, "guild_name", min_length=1, allow_null=False, reason_prefix="Name")
    df = qutils.set_quarantine_timestamp(df)
    return df


def _transform_category_dim_with_quarantine():
    """Transform category_dim with quarantine validation."""
    df = spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
    df = (
        df.filter(F.col("channel_type") == 4)  # Only category channels
        .select(
            F.col("channel_id").cast("int").alias("category_id"),
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
    df = spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
    df = (
        df.filter(F.col("channel_type") != 4)  # Exclude category channels
        .select(
            _safe_int("channel_id"),
            _safe_int("guild_id"),
            F.coalesce(_safe_date("snapshot_date"), F.current_date()).alias("snapshot_date"),
            F.col("channel_type").cast("int").alias("channel_type"),
            F.col("channel_name").cast("string").alias("channel_name"),
            F.when(F.col("category_id").isNotNull(), F.col("category_id").cast("int"))
            .otherwise(F.lit(None).cast("int"))
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
    """Transform user_dim with quarantine validation."""
    messages = spark.table(f"{BRONZE_SCHEMA}.discord_messages_raw").select(
        _safe_int("user_id"),
        F.col("user_name").cast("string").alias("user_name"),
    )
    voice = spark.table(f"{BRONZE_SCHEMA}.discord_voice_activity_raw").select(
        _safe_int("user_id"),
        F.col("user_name").cast("string").alias("user_name"),
    )
    df = messages.unionByName(voice, allowMissingColumns=True).distinct()
    
    # Add quarantine columns and apply validations
    df = qutils.add_quarantine_columns(df)
    df = qutils.validate_id_column(df, "user_id", reason_prefix="Invalid", allow_null=False)
    df = qutils.validate_name_column(df, "user_name", min_length=1, allow_null=False, reason_prefix="Name")
    df = qutils.set_quarantine_timestamp(df)
    return df


def _transform_message_fact_with_quarantine():
    """Transform message_fact with quarantine validation."""
    messages = spark.table(f"{BRONZE_SCHEMA}.discord_messages_raw")
    ch = dlt.read("channel_latest").select(
        F.col("channel_id").alias("_ch_channel_id"),
        F.col("category_id").alias("_ch_category_id"),
    )
    ts = F.to_timestamp(F.col("timestamp"))
    joined = messages.withColumn("_channel_id", F.col("channel_id").cast("int")).join(
        ch, F.col("_channel_id") == F.col("_ch_channel_id"), "left"
    )
    df = (
        joined.select(
            F.col("message_id").cast("int").alias("message_id"),
            F.col("_channel_id").alias("channel_id"),
            F.col("guild_id").cast("int").alias("guild_id"),
            F.col("user_id").cast("int").alias("user_id"),
            F.col("_ch_category_id").alias("category_id"),
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
    """Transform voice_chat_fact with quarantine validation."""
    voice = spark.table(f"{BRONZE_SCHEMA}.discord_voice_activity_raw")
    
    # Join with channel_latest to get category_id
    ch = dlt.read("channel_latest").select(
        F.col("channel_id").alias("_ch_channel_id"),
        F.col("category_id").alias("_ch_category_id"),
    )
    
    joined_ts = F.to_timestamp(F.col("joined_at"))
    joined = voice.withColumn("_channel_id", F.col("channel_id").cast("int")).join(
        ch, F.col("_channel_id") == F.col("_ch_channel_id"), "left"
    )
    
    df = (
        joined.select(
            F.xxhash64(F.col("session_id")).cast("int").alias("session_id"),
            F.col("_channel_id").alias("channel_id"),
            F.col("_ch_category_id").alias("category_id"),
            F.col("guild_id").cast("int").alias("guild_id"),
            F.col("user_id").cast("int").alias("user_id"),
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
# Dimensions (from channels + messages + voice)
# -----------------------------------------------------------------------------


@dlt.table(
    name="guild_dim",
    comment="Silver dimension: one row per unique guild (Discord server). Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def guild_dim():
    """One row per unique guild. Source: discord_channels_raw (guild_id, guild_name)."""
    df = _transform_guild_dim_with_quarantine()
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="guild_dim_quarantined",
    comment="Quarantined records from guild_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def guild_dim_quarantined():
    """Invalid guild records with quarantine reasons."""
    df = _transform_guild_dim_with_quarantine()
    return qutils.filter_invalid_records(df)


@dlt.table(
    name="category_dim",
    comment="Silver dimension: one row per unique category (channel_type = 4). Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def category_dim():
    """
    One row per unique category. Categories are channels with channel_type = 4.
    Source: discord_channels_raw WHERE channel_type = 4.
    """
    df = _transform_category_dim_with_quarantine()
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="category_dim_quarantined",
    comment="Quarantined records from category_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def category_dim_quarantined():
    """Invalid category records with quarantine reasons."""
    df = _transform_category_dim_with_quarantine()
    return qutils.filter_invalid_records(df)


@dlt.table(
    name="channel_dim",
    comment="Silver dimension: one row per unique channel per snapshot_date (excludes categories). Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_dim():
    """
    One row per channel per snapshot_date. Excludes category channels (type 4).
    Source: discord_channels_raw WHERE channel_type != 4.
    """
    df = _transform_channel_dim_with_quarantine()
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="channel_dim_quarantined",
    comment="Quarantined records from channel_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_dim_quarantined():
    """Invalid channel records with quarantine reasons."""
    df = _transform_channel_dim_with_quarantine()
    return qutils.filter_invalid_records(df)


@dlt.table(
    name="user_dim",
    comment="Silver dimension: one row per unique user. Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def user_dim():
    """One row per unique user. Source: discord_messages_raw + discord_voice_activity_raw."""
    df = _transform_user_dim_with_quarantine()
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="user_dim_quarantined",
    comment="Quarantined records from user_dim with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def user_dim_quarantined():
    """Invalid user records with quarantine reasons."""
    df = _transform_user_dim_with_quarantine()
    return qutils.filter_invalid_records(df)


# -----------------------------------------------------------------------------
# Facts (depend on dimensions)
# -----------------------------------------------------------------------------


@dlt.table(
    name="channel_latest",
    comment="Latest channel snapshot per channel_id for lookups.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_latest():
    """One row per channel_id with latest snapshot_date; used to get category_id for messages."""
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
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
@dlt.expect("message_date_matches_timestamp", "DATE(timestamp) = message_date")
def message_fact():
    """One row per message. Source: discord_messages_raw. category_id from channel_latest."""
    df = _transform_message_fact_with_quarantine()
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="message_fact_quarantined",
    comment="Quarantined records from message_fact with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def message_fact_quarantined():
    """Invalid message records with quarantine reasons."""
    df = _transform_message_fact_with_quarantine()
    return qutils.filter_invalid_records(df)


@dlt.table(
    name="voice_chat_fact",
    comment="Silver fact: one row per unique voice session. Valid records only.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
@dlt.expect("session_date_matches_joined_at", "DATE(joined_at) = session_date")
@dlt.expect("valid_session_duration", "left_at IS NULL OR left_at >= joined_at")
def voice_chat_fact():
    """One row per voice session. Source: discord_voice_activity_raw. session_id string -> BIGINT via hash."""
    df = _transform_voice_chat_fact_with_quarantine()
    return qutils.filter_valid_records(df).drop("quarantine_reason", "quarantine_timestamp")


@dlt.table(
    name="voice_chat_fact_quarantined",
    comment="Quarantined records from voice_chat_fact with validation failures.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def voice_chat_fact_quarantined():
    """Invalid voice session records with quarantine reasons."""
    df = _transform_voice_chat_fact_with_quarantine()
    return qutils.filter_invalid_records(df)
