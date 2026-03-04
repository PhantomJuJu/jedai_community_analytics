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
    """Cast column to BIGINT; handles STRING or numeric types from bronze."""
    return F.col(col_name).cast("long").alias(col_name)


def _safe_timestamp(col_name: str):
    """Parse string or timestamp to TIMESTAMP."""
    return F.to_timestamp(F.col(col_name)).alias(col_name)


def _safe_date(col_name: str):
    """Parse string or date to DATE."""
    return F.to_date(F.col(col_name)).alias(col_name)


# -----------------------------------------------------------------------------
# Dimensions (from channels + messages + voice)
# -----------------------------------------------------------------------------


@dlt.table(
    name="guild_dim",
    comment="Silver dimension: one row per unique guild (Discord server).",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def guild_dim():
    """One row per unique guild. Source: discord_channels_raw (guild_id, guild_name)."""
    df = spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
    return (
        df.select(
            _safe_bigint("guild_id"),
            F.col("guild_name").cast("string").alias("guild_name"),
        )
        .distinct()
        .filter(F.col("guild_id").isNotNull())
    )


@dlt.table(
    name="category_dim",
    comment="Silver dimension: one row per unique category.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def category_dim():
    """One row per unique category. Source: discord_channels_raw (category_id). category_name not in bronze; derived."""
    df = spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
    return (
        df.select(
            _safe_bigint("category_id"),
            F.when(
                F.col("category_id").isNotNull(),
                F.concat(F.lit("Category_"), F.col("category_id").cast("string")),
            )
            .otherwise(F.lit("Uncategorized"))
            .alias("category_name"),
        )
        .distinct()
        .filter(F.col("category_id").isNotNull())
    )


@dlt.table(
    name="channel_dim",
    comment="Silver dimension: one row per unique channel per snapshot_date.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def channel_dim():
    """One row per channel per snapshot_date. Source: discord_channels_raw."""
    df = spark.table(f"{BRONZE_SCHEMA}.discord_channels_raw")
    return df.select(
        _safe_bigint("channel_id"),
        _safe_bigint("guild_id"),
        F.coalesce(_safe_date("snapshot_date"), F.current_date()).alias("snapshot_date"),
        F.col("channel_type").cast("int").alias("channel_type"),
        F.col("channel_name").cast("string").alias("channel_name"),
        F.when(F.col("category_id").isNotNull(), F.col("category_id").cast("long")).otherwise(
            F.lit(None).cast("long")
        ).alias("category_id"),
    ).filter(F.col("channel_id").isNotNull())


@dlt.table(
    name="user_dim",
    comment="Silver dimension: one row per unique user.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def user_dim():
    """One row per unique user. Source: discord_messages_raw + discord_voice_activity_raw."""
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
        .distinct()
        .filter(F.col("user_id").isNotNull())
    )


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
    comment="Silver fact: one row per unique message.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def message_fact():
    """One row per message. Source: discord_messages_raw. category_id from channel_latest."""
    messages = spark.table(f"{BRONZE_SCHEMA}.discord_messages_raw")
    ch = dlt.read("channel_latest").select(
        F.col("channel_id").alias("_ch_channel_id"),
        F.col("category_id").alias("_ch_category_id"),
    )
    ts = F.to_timestamp(F.col("timestamp"))
    joined = messages.withColumn("_channel_id", F.col("channel_id").cast("long")).join(
        ch, F.col("_channel_id") == F.col("_ch_channel_id"), "left"
    )
    return (
        joined.select(
            F.col("message_id").cast("long").alias("message_id"),
            F.col("_channel_id").alias("channel_id"),
            F.col("guild_id").cast("long").alias("guild_id"),
            F.col("user_id").cast("long").alias("user_id"),
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
        .filter(F.col("message_id").isNotNull())
    )


@dlt.table(
    name="voice_chat_fact",
    comment="Silver fact: one row per unique voice session.",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
def voice_chat_fact():
    """One row per voice session. Source: discord_voice_activity_raw. session_id string -> BIGINT via hash."""
    df = spark.table(f"{BRONZE_SCHEMA}.discord_voice_activity_raw")
    joined_ts = F.to_timestamp(F.col("joined_at"))
    return (
        df.select(
            F.xxhash64(F.col("session_id")).cast("long").alias("session_id"),
            _safe_bigint("channel_id"),
            _safe_bigint("guild_id"),
            _safe_bigint("user_id"),
            F.when(joined_ts.isNotNull(), joined_ts).otherwise(F.current_timestamp()).alias("joined_at"),
            _safe_timestamp("left_at"),
        )
        .withColumn(
            "session_date",
            F.coalesce(F.to_date("joined_at"), F.current_date()),
        )
        .dropDuplicates(["session_id"])
        .filter(F.col("session_id").isNotNull())
    )
