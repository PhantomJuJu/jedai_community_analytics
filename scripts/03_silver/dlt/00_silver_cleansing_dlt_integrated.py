"""
Lakeflow Spark Declarative Pipeline: Bronze → Silver (Discord Star Schema)

Reads from `kazuki_jedai.bronze` and writes to `kazuki_jedai.silver`.
Run as a Delta Live Tables (DLT) pipeline in Databricks.

Bronze sources: discord_channels_raw, discord_messages_raw, discord_voice_activity_raw
Silver targets: guild_dim, user_dim, category_dim, channel_dim, message_fact, voice_chat_fact

Author: Cheng Wang
Contact: cheng.wang@myteam.com
Date / Last Modified: 2026-03-04
"""

import dlt
from pyspark.sql import functions as F
from pyspark.sql.window import Window

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
# Transform functions: Bronze → Silver (no quarantine)
# -----------------------------------------------------------------------------


def _transform_guild_dim():
    """Transform guild_dim. One row per guild_id (max guild_name)."""
    return (
        spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
        .select(_safe_bigint("guild_id"), F.col("guild_name").cast("string").alias("guild_name"))
        .filter(F.col("guild_id").isNotNull())
        .groupBy("guild_id")
        .agg(F.max("guild_name").alias("guild_name"))
    )


def _transform_category_dim():
    """Transform category_dim. Categories are channels with channel_type = 4."""
    return (
        spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
        .filter(F.col("channel_type") == 4)  # Filter first for predicate pushdown
        .select(
            _safe_bigint("channel_id").alias("category_id"),
            F.col("channel_name").cast("string").alias("category_name"),
        )
        .distinct()
    )


def _transform_channel_dim():
    """Transform channel_dim. Excludes category channels (channel_type = 4)."""
    return (
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


def _transform_user_dim():
    """Transform user_dim. One row per user_id (max user_name)."""
    messages = spark.table(f"{BRONZE_SCHEMA}.discord_messages_raw").select(
        _safe_bigint("user_id"),
        F.col("user_name").cast("string").alias("user_name"),
    )
    voice = spark.table(f"{BRONZE_SCHEMA}.discord_voice_activity_raw").select(
        _safe_bigint("user_id"),
        F.col("user_name").cast("string").alias("user_name"),
    )
    return (
        messages.unionByName(voice, allowMissingColumns=True)
        .groupBy("user_id")
        .agg(F.max("user_name").alias("user_name"))
    )


def _transform_message_fact():
    """Transform message_fact from discord_messages_raw. edited_timestamp dropped in silver."""
    messages = (
        spark.table(f"{BRONZE_SCHEMA}.discord_messages_raw")
        .filter(F.col("message_id").isNotNull())  # Early filter for dropDuplicates
    )
    ts = F.to_timestamp(F.col("timestamp"))
    return (
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


def _transform_voice_chat_fact():
    """Transform voice_chat_fact from discord_voice_activity_raw."""
    voice = (
        spark.table(f"{BRONZE_SCHEMA}.discord_voice_activity_raw")
        .filter(F.col("session_id").isNotNull())  # Early filter for dropDuplicates
    )
    joined_ts = F.to_timestamp(F.col("joined_at"))
    return (
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


# -----------------------------------------------------------------------------
# Dimensions (from channels + messages + voice)
# -----------------------------------------------------------------------------


@dlt.table(
    name="guild_dim",
    comment="Silver dimension: one row per unique guild (Discord server).",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def guild_dim():
    """One row per unique guild. Built from bronze discord_channels_raw."""
    return _transform_guild_dim()


@dlt.table(
    name="category_dim",
    comment="Silver dimension: one row per unique category (channel_type = 4).",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def category_dim():
    """
    One row per unique category. Categories are channels with channel_type = 4.
    Built from bronze discord_channels_raw.
    """
    return _transform_category_dim()


@dlt.table(
    name="channel_dim",
    comment="Silver dimension: one row per unique channel per snapshot_date (excludes categories).",
    partition_cols=["snapshot_date"],
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_dim():
    """
    One row per channel per snapshot_date. Excludes category channels (type 4).
    Built from bronze discord_channels_raw.
    """
    return _transform_channel_dim()


@dlt.table(
    name="user_dim",
    comment="Silver dimension: one row per unique user.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def user_dim():
    """One row per unique user. Built from bronze discord_messages_raw and discord_voice_activity_raw."""
    return _transform_user_dim()


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
    comment="Silver fact: one row per unique message. edited_timestamp not carried from bronze.",
    partition_cols=["message_date"],
    table_properties={
        "pipelines.autoOptimize.managed": "true",
        "delta.autoOptimize.optimizeWrite": "true",
        "delta.autoOptimize.autoCompact": "true",
    },
)
@dlt.expect("message_date_matches_timestamp", "DATE(timestamp) = message_date")
def message_fact():
    """One row per message. Built from bronze discord_messages_raw."""
    return _transform_message_fact()


@dlt.table(
    name="voice_chat_fact",
    comment="Silver fact: one row per unique voice session.",
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
    """One row per voice session. Built from bronze discord_voice_activity_raw."""
    return _transform_voice_chat_fact()
