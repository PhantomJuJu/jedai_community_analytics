"""
Gold 集計 DLT パイプライン: Silver → Gold（曜日×時間帯・日次・ユーザ別・チャンネル別）

Silver スキーマ（kazuki_jedai.silver）の message_fact / voice_chat_fact（いずれも guild_id を持つ）を読み、
按分ロジック（時間帯按分・日按分）を含む集計を行い、guild_dim / user_dim / channel_dim / category_dim と JOIN して
guild_name 等の表示名を付与したうえで、Gold スキーマ（kazuki_jedai.gold）に 4 本のテーブルを出力する。Delta Live Tables パイプラインとして実行する。

前提:
  - DLT パイプラインで実行すること。パイプラインのターゲットを kazuki_jedai.gold に設定すること。
  - ソースはカタログ kazuki_jedai の Silver テーブル（kazuki_jedai.silver.message_fact / voice_chat_fact）を 3 レベル名で参照する。
  - 日付・時刻の導出（weekday, hour_slot, activity_date 等）は Spark セッションのタイムゾーンに依存する。プロジェクト方針（例: UTC）に合わせてクラスタのタイムゾーンを設定すること。
  - 実行ごとにフルリフレッシュ（パイプラインの Full refresh 設定）を推奨。

Author: Kazuki Date
Contact: kazuki.date@myteam.com
Date / Last Modified: 2026-03-06
"""

import dlt
from pyspark.sql import functions as F

CATALOG = "kazuki_jedai"
SILVER_SCHEMA = f"{CATALOG}.silver"
SECONDS_PER_HOUR = 3600


# ---------------------------------------------------------------------------
# 1. activity_by_weekday_hour（曜日×時間帯：メッセージ COUNT + ボイス時間帯按分 SUM）
# ---------------------------------------------------------------------------


def _get_guild_dim():
    """guild_dim を読み guild_id, guild_name を返す（JOIN 用）。"""
    return spark.read.table(f"{SILVER_SCHEMA}.guild_dim").select("guild_id", "guild_name")


def _transform_message_by_weekday_hour():
    """message_fact から guild_id, weekday, hour_slot を導出し (guild_id, weekday, hour_slot) で COUNT。"""
    df = spark.read.table(f"{SILVER_SCHEMA}.message_fact").filter(F.col("timestamp").isNotNull()).filter(F.col("guild_id").isNotNull())
    # weekday: 0=月〜6=日（DAYOFWEEK: 1=日〜7=土 → (DAYOFWEEK + 5) % 7 で 0=月〜6=日に変換）
    return (
        df.withColumn("weekday", F.expr("(DAYOFWEEK(timestamp) + 5) % 7"))
        .withColumn("hour_slot", F.hour("timestamp"))
        .groupBy("guild_id", "weekday", "hour_slot")
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_by_weekday_hour_prorated():
    """
    voice_chat_fact を時間帯按分で展開: 各セッションを重なる (日付, 時) ごとに分割し、
    その時間帯に含まれる秒数を計算して (guild_id, weekday, hour_slot) で SUM。
    """
    voice = (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
        .filter(F.col("guild_id").isNotNull())
    )
    # 時間単位で区切った開始・終了（unix 秒）
    voice = voice.withColumn(
        "_start_hour_sec",
        F.unix_timestamp(F.date_trunc("hour", "joined_at")),
    ).withColumn(
        "_end_hour_sec",
        F.unix_timestamp(F.date_trunc("hour", "left_at")),
    )
    # 1 時間刻みのシーケンスを explode（SECONDS_PER_HOUR で区切り）
    voice = voice.withColumn(
        "_hour_sec",
        F.explode(
            F.expr(f"sequence(_start_hour_sec, _end_hour_sec, {SECONDS_PER_HOUR})")
        ),
    )
    # その時間帯内の重なり秒数: segment_start = max(joined_at, hour_bucket), segment_end = min(left_at, hour_bucket+1h)
    # left_at がちょうど時間境界（例: 23:00）のときは duration=0 になる行が出るため、以下の filter で除外する
    voice = voice.withColumn(
        "hour_bucket",
        F.to_timestamp(F.col("_hour_sec").cast("long")),
    ).withColumn(
        "segment_start",
        F.greatest(F.col("joined_at"), F.col("hour_bucket")),
    ).withColumn(
        "segment_end",
        F.least(
            F.col("left_at"),
            F.col("hour_bucket") + F.expr("INTERVAL 1 HOUR"),
        ),
    ).withColumn(
        "duration_seconds",
        (
            F.unix_timestamp("segment_end") - F.unix_timestamp("segment_start")
        ).cast("double"),
    ).filter(F.col("duration_seconds") > 0)
    # weekday: 0=月〜6=日, hour_slot: 0〜23
    voice = voice.withColumn(
        "weekday",
        F.expr("(DAYOFWEEK(hour_bucket) + 5) % 7"),
    ).withColumn("hour_slot", F.hour("hour_bucket"))
    return (
        voice.groupBy("guild_id", "weekday", "hour_slot")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_activity_by_weekday_hour():
    """メッセージ集計とボイス（時間帯按分）集計を (guild_id, weekday, hour_slot) で JOIN し、guild_dim で guild_name を付与。"""
    msg = _transform_message_by_weekday_hour()
    voice = _transform_voice_by_weekday_hour_prorated()
    guild = _get_guild_dim()
    return (
        msg.join(voice, ["guild_id", "weekday", "hour_slot"], "left")
        .join(guild, "guild_id", "left")
        .select(
            F.col("guild_id").cast("long"),
            F.col("guild_name").cast("string"),
            F.col("weekday").cast("int"),
            F.col("hour_slot").cast("int"),
            F.col("message_count").cast("long"),
            F.coalesce(F.col("voice_duration_seconds").cast("double"), F.lit(0.0)).alias(
                "voice_duration_seconds"
            ),
        )
    )


# ---------------------------------------------------------------------------
# 2. activity_daily（日次：メッセージ COUNT + ボイス日按分 SUM）
# ---------------------------------------------------------------------------


def _transform_message_daily():
    """message_fact を (guild_id, message_date) で GROUP BY して COUNT。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.message_fact")
        .filter(F.col("message_date").isNotNull())
        .filter(F.col("guild_id").isNotNull())
        .groupBy("guild_id", F.col("message_date").alias("activity_date"))
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_daily_prorated():
    """
    voice_chat_fact を日按分で展開: セッションが重なる各 (日付) に属する秒数を計算し、
    (guild_id, activity_date) で SUM。
    """
    voice = (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
        .filter(F.col("guild_id").isNotNull())
    )
    voice = voice.withColumn(
        "_start_date",
        F.to_date("joined_at"),
    ).withColumn(
        "_end_date",
        F.to_date("left_at"),
    )
    # 重なる日付のシーケンスを explode（Spark 3 sequence(date, date, interval 1 day)。開始日・終了日の両端を含む）
    voice = voice.withColumn(
        "activity_date",
        F.explode(
            F.expr("sequence(_start_date, _end_date, interval 1 day)")
        ),
    )
    # その日に属する秒数: segment_start = max(joined_at, 日初), segment_end = min(left_at, 日末)
    voice = voice.withColumn(
        "day_start",
        F.to_timestamp(F.col("activity_date")),
    ).withColumn(
        "day_end",
        F.col("day_start") + F.expr("INTERVAL 1 DAY"),
    ).withColumn(
        "segment_start",
        F.greatest(F.col("joined_at"), F.col("day_start")),
    ).withColumn(
        "segment_end",
        F.least(F.col("left_at"), F.col("day_end")),
    ).withColumn(
        "duration_seconds",
        (
            F.unix_timestamp("segment_end") - F.unix_timestamp("segment_start")
        ).cast("double"),
    ).filter(F.col("duration_seconds") > 0)
    return (
        voice.groupBy("guild_id", "activity_date")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_activity_daily():
    """メッセージ集計とボイス（日按分）集計を (guild_id, activity_date) で JOIN し、guild_dim で guild_name を付与。"""
    msg = _transform_message_daily()
    voice = _transform_voice_daily_prorated()
    guild = _get_guild_dim()
    return (
        msg.join(voice, ["guild_id", "activity_date"], "left")
        .join(guild, "guild_id", "left")
        .select(
            F.col("guild_id").cast("long"),
            F.col("guild_name").cast("string"),
            F.col("activity_date"),
            F.col("message_count").cast("long"),
            F.coalesce(F.col("voice_duration_seconds").cast("double"), F.lit(0.0)).alias(
                "voice_duration_seconds"
            ),
        )
    )


# ---------------------------------------------------------------------------
# 3. user_activity（ユーザ別：メッセージ COUNT + ボイス SUM）
# ---------------------------------------------------------------------------


def _transform_message_by_user():
    """message_fact を (guild_id, user_id) で GROUP BY して COUNT。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.message_fact")
        .filter(F.col("user_id").isNotNull())
        .filter(F.col("guild_id").isNotNull())
        .groupBy("guild_id", "user_id")
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_by_user():
    """voice_chat_fact で left_at - joined_at を秒で計算し (guild_id, user_id) で SUM。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
        .filter(F.col("guild_id").isNotNull())
        .withColumn(
            "duration_seconds",
            (
                F.unix_timestamp("left_at") - F.unix_timestamp("joined_at")
            ).cast("double"),
        )
        .groupBy("guild_id", "user_id")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_user_activity():
    """メッセージ集計とボイス集計を (guild_id, user_id) で JOIN し、user_dim で user_name、guild_dim で guild_name を付与。"""
    msg = _transform_message_by_user()
    voice = _transform_voice_by_user()
    user_dim = spark.read.table(f"{SILVER_SCHEMA}.user_dim").select("user_id", "user_name")
    guild = _get_guild_dim()
    return (
        msg.join(voice, ["guild_id", "user_id"], "left")
        .join(user_dim, "user_id", "left")
        .join(guild, "guild_id", "left")
        .select(
            F.col("guild_id").cast("long"),
            F.col("guild_name").cast("string"),
            F.col("user_id").cast("string").alias("user_id"),
            F.col("user_name").cast("string").alias("user_name"),
            F.col("message_count").cast("long"),
            F.coalesce(F.col("voice_duration_seconds").cast("double"), F.lit(0.0)).alias(
                "voice_duration_seconds"
            ),
        )
    )


# ---------------------------------------------------------------------------
# 4. channel_activity（チャンネル・カテゴリ別：メッセージ COUNT + ボイス SUM）
# ---------------------------------------------------------------------------


def _transform_message_by_channel():
    """message_fact を (guild_id, channel_id, category_id) で GROUP BY して COUNT。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.message_fact")
        .filter(F.col("channel_id").isNotNull())
        .filter(F.col("guild_id").isNotNull())
        .groupBy("guild_id", "channel_id", "category_id")
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_by_channel():
    """voice_chat_fact で duration を計算し (guild_id, channel_id, category_id) で SUM。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
        .filter(F.col("guild_id").isNotNull())
        .withColumn(
            "duration_seconds",
            (
                F.unix_timestamp("left_at") - F.unix_timestamp("joined_at")
            ).cast("double"),
        )
        .groupBy("guild_id", "channel_id", "category_id")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_channel_activity():
    """メッセージ集計とボイス集計を (guild_id, channel_id, category_id) で JOIN し、channel_dim, category_dim, guild_dim で channel_name, category_name, guild_name を付与。"""
    msg = _transform_message_by_channel()
    voice = _transform_voice_by_channel()
    guild = _get_guild_dim()
    channel_dim = spark.read.table(f"{SILVER_SCHEMA}.channel_dim").select("channel_id", "channel_name")
    category_dim = spark.read.table(f"{SILVER_SCHEMA}.category_dim").select("category_id", "category_name")
    return (
        msg.join(voice, ["guild_id", "channel_id", "category_id"], "left")
        .join(guild, "guild_id", "left")
        .join(channel_dim, "channel_id", "left")
        .join(category_dim, "category_id", "left")
        .select(
            F.col("guild_id").cast("long"),
            F.col("guild_name").cast("string"),
            F.col("channel_id").cast("string").alias("channel_id"),
            F.col("category_id").cast("string").alias("category_id"),
            F.col("channel_name").cast("string").alias("channel_name"),
            F.col("category_name").cast("string").alias("category_name"),
            F.col("message_count").cast("long"),
            F.coalesce(F.col("voice_duration_seconds").cast("double"), F.lit(0.0)).alias(
                "voice_duration_seconds"
            ),
        )
    )


# ---------------------------------------------------------------------------
# DLT テーブル定義（フルリフレッシュ想定：パイプラインで Full refresh を指定）
# ---------------------------------------------------------------------------


@dlt.table(
    name="activity_by_weekday_hour",
    comment="曜日×時間帯ごとのメッセージ数・ボイス使用時間（ヒートマップ・曜日別 Bar 用）。",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
@dlt.expect("guild_id_not_null", "guild_id IS NOT NULL")
@dlt.expect("weekday_not_null", "weekday IS NOT NULL")
@dlt.expect("hour_slot_not_null", "hour_slot IS NOT NULL")
@dlt.expect("message_count_non_negative", "message_count >= 0")
@dlt.expect("voice_duration_non_negative", "voice_duration_seconds >= 0")
def gold_activity_by_weekday_hour():
    return _build_gold_activity_by_weekday_hour()


@dlt.table(
    name="activity_daily",
    comment="日付ごとのメッセージ数・ボイス使用時間（時系列トレンド・今月 KPI 用）。",
    partition_cols=["activity_date"],
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
@dlt.expect("guild_id_not_null", "guild_id IS NOT NULL")
@dlt.expect("activity_date_not_null", "activity_date IS NOT NULL")
@dlt.expect("message_count_non_negative", "message_count >= 0")
@dlt.expect("voice_duration_non_negative", "voice_duration_seconds >= 0")
def gold_activity_daily():
    return _build_gold_activity_daily()


@dlt.table(
    name="user_activity",
    comment="ユーザごとのメッセージ数・ボイス使用時間（ユーザ別活動ランキング用）。",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
@dlt.expect("guild_id_not_null", "guild_id IS NOT NULL")
@dlt.expect("user_id_not_null", "user_id IS NOT NULL")
@dlt.expect("message_count_non_negative", "message_count >= 0")
@dlt.expect("voice_duration_non_negative", "voice_duration_seconds >= 0")
def gold_user_activity():
    return _build_gold_user_activity()


@dlt.table(
    name="channel_activity",
    comment="チャンネル・カテゴリごとのメッセージ数・ボイス使用時間（チャンネル別比較・カテゴリ Exclude 用）。",
    table_properties={"pipelines.autoOptimize.managed": "true"},
)
@dlt.expect("guild_id_not_null", "guild_id IS NOT NULL")
@dlt.expect("channel_id_not_null", "channel_id IS NOT NULL")
@dlt.expect("message_count_non_negative", "message_count >= 0")
@dlt.expect("voice_duration_non_negative", "voice_duration_seconds >= 0")
def gold_channel_activity():
    return _build_gold_channel_activity()
