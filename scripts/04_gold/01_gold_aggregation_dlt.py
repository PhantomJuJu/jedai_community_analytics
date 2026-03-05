"""
Gold 集計 DLT パイプライン: Silver → Gold（曜日×時間帯・日次・ユーザ別・チャンネル別）

Silver スキーマ（kazuki_jedai.silver）の message_fact / voice_chat_fact を読み、
按分ロジック（時間帯按分・日按分）を含む集計を行い、Gold スキーマ（kazuki_jedai.gold）に
4 本のテーブルを出力する。Delta Live Tables パイプラインとして実行する。

前提:
  - DLT パイプラインで実行すること。パイプラインのターゲットを kazuki_jedai.gold に設定すること。
  - ソースはカタログ kazuki_jedai の Silver テーブル（kazuki_jedai.silver.message_fact / voice_chat_fact）を 3 レベル名で参照する。
  - 日付・時刻の導出（weekday, hour_slot, activity_date 等）は Spark セッションのタイムゾーンに依存する。プロジェクト方針（例: UTC）に合わせてクラスタのタイムゾーンを設定すること。
  - 実行ごとにフルリフレッシュ（パイプラインの Full refresh 設定）を推奨。

Author: Kazuki Date
Contact: kazuki.date@myteam.com
Date / Last Modified: 2026-03-05
"""

import dlt
from pyspark.sql import functions as F

CATALOG = "kazuki_jedai"
SILVER_SCHEMA = f"{CATALOG}.silver"
SECONDS_PER_HOUR = 3600


# ---------------------------------------------------------------------------
# 1. activity_by_weekday_hour（曜日×時間帯：メッセージ COUNT + ボイス時間帯按分 SUM）
# ---------------------------------------------------------------------------


def _transform_message_by_weekday_hour():
    """message_fact から weekday, hour_slot を導出し (weekday, hour_slot) で COUNT。"""
    df = spark.read.table(f"{SILVER_SCHEMA}.message_fact").filter(F.col("timestamp").isNotNull())
    # weekday: 0=月〜6=日（DAYOFWEEK: 1=日〜7=土 → (DAYOFWEEK + 5) % 7 で 0=月〜6=日に変換）
    return (
        df.withColumn("weekday", F.expr("(DAYOFWEEK(timestamp) + 5) % 7"))
        .withColumn("hour_slot", F.hour("timestamp"))
        .groupBy("weekday", "hour_slot")
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_by_weekday_hour_prorated():
    """
    voice_chat_fact を時間帯按分で展開: 各セッションを重なる (日付, 時) ごとに分割し、
    その時間帯に含まれる秒数を計算して (weekday, hour_slot) で SUM。
    """
    voice = (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
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
        voice.groupBy("weekday", "hour_slot")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_activity_by_weekday_hour():
    """メッセージ集計とボイス（時間帯按分）集計を (weekday, hour_slot) で JOIN。"""
    msg = _transform_message_by_weekday_hour()
    voice = _transform_voice_by_weekday_hour_prorated()
    return (
        msg.join(voice, ["weekday", "hour_slot"], "left")
        .select(
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
    """message_fact を message_date で GROUP BY して COUNT。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.message_fact")
        .filter(F.col("message_date").isNotNull())
        .groupBy(F.col("message_date").alias("activity_date"))
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_daily_prorated():
    """
    voice_chat_fact を日按分で展開: セッションが重なる各 (日付) に属する秒数を計算し、
    activity_date で SUM。
    """
    voice = (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
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
        voice.groupBy("activity_date")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_activity_daily():
    """メッセージ集計とボイス（日按分）集計を activity_date で JOIN。"""
    msg = _transform_message_daily()
    voice = _transform_voice_daily_prorated()
    return (
        msg.join(voice, "activity_date", "left")
        .select(
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
    """message_fact を user_id で GROUP BY して COUNT。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.message_fact")
        .filter(F.col("user_id").isNotNull())
        .groupBy("user_id")
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_by_user():
    """voice_chat_fact で left_at - joined_at を秒で計算し user_id で SUM。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
        .withColumn(
            "duration_seconds",
            (
                F.unix_timestamp("left_at") - F.unix_timestamp("joined_at")
            ).cast("double"),
        )
        .groupBy("user_id")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_user_activity():
    """メッセージ集計とボイス集計を user_id で JOIN。Gold は user_id STRING。"""
    msg = _transform_message_by_user()
    voice = _transform_voice_by_user()
    return (
        msg.join(voice, "user_id", "left")
        .select(
            F.col("user_id").cast("string").alias("user_id"),
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
    """message_fact を channel_id, category_id で GROUP BY して COUNT。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.message_fact")
        .filter(F.col("channel_id").isNotNull())
        .groupBy("channel_id", "category_id")
        .agg(F.count("*").alias("message_count"))
    )


def _transform_voice_by_channel():
    """voice_chat_fact で duration を計算し channel_id, category_id で SUM。"""
    return (
        spark.read.table(f"{SILVER_SCHEMA}.voice_chat_fact")
        .filter(F.col("left_at").isNotNull())
        .filter(F.col("left_at") >= F.col("joined_at"))
        .withColumn(
            "duration_seconds",
            (
                F.unix_timestamp("left_at") - F.unix_timestamp("joined_at")
            ).cast("double"),
        )
        .groupBy("channel_id", "category_id")
        .agg(F.sum("duration_seconds").alias("voice_duration_seconds"))
    )


def _build_gold_channel_activity():
    """メッセージ集計とボイス集計を channel_id, category_id で JOIN。Gold は STRING。"""
    msg = _transform_message_by_channel()
    voice = _transform_voice_by_channel()
    return (
        msg.join(voice, ["channel_id", "category_id"], "left")
        .select(
            F.col("channel_id").cast("string").alias("channel_id"),
            F.col("category_id").cast("string").alias("category_id"),
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
@dlt.expect("channel_id_not_null", "channel_id IS NOT NULL")
@dlt.expect("message_count_non_negative", "message_count >= 0")
@dlt.expect("voice_duration_non_negative", "voice_duration_seconds >= 0")
def gold_channel_activity():
    return _build_gold_channel_activity()
