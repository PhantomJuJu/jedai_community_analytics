-- 01_create_gold_tables.sql
-- 概要: Gold スキーマ（kazuki_jedai.gold）に 4 本の Delta テーブルを空の状態で作成する。
-- 実行前提:
--   - カタログ kazuki_jedai およびスキーマ gold が存在すること。
--   - 実行ユーザに CREATE TABLE 権限があること。
--   - 依存ビュー/テーブル: なし（DDL のみ。投入は 00_gold_feature_engineering 等で実施）。

-- ---------------------------------------------------------------------------
-- 1. gold_activity_by_weekday_hour（曜日×時間帯ごとのメッセージ数・ボイス時間）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.gold.gold_activity_by_weekday_hour (
  weekday                   INT,
  hour_slot                  INT,
  message_count              BIGINT,
  voice_duration_seconds     DOUBLE
)
USING DELTA
COMMENT '曜日×時間帯ごとのメッセージ数・ボイス使用時間。ヒートマップ・曜日別 Bar 用。';

COMMENT ON COLUMN kazuki_jedai.gold.gold_activity_by_weekday_hour.weekday IS '曜日（0=月〜6=日）';
COMMENT ON COLUMN kazuki_jedai.gold.gold_activity_by_weekday_hour.hour_slot IS '時間帯（0〜23）';
COMMENT ON COLUMN kazuki_jedai.gold.gold_activity_by_weekday_hour.message_count IS 'メッセージ数';
COMMENT ON COLUMN kazuki_jedai.gold.gold_activity_by_weekday_hour.voice_duration_seconds IS 'ボイス使用時間の合計（秒）';

-- ---------------------------------------------------------------------------
-- 2. gold_activity_daily（日付ごとのメッセージ数・ボイス時間）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.gold.gold_activity_daily (
  activity_date              DATE,
  message_count              BIGINT,
  voice_duration_seconds     DOUBLE
)
USING DELTA
PARTITIONED BY (activity_date)
COMMENT '日付ごとのメッセージ数・ボイス使用時間。時系列トレンド・今月 KPI 用。';

COMMENT ON COLUMN kazuki_jedai.gold.gold_activity_daily.activity_date IS '活動日';
COMMENT ON COLUMN kazuki_jedai.gold.gold_activity_daily.message_count IS 'メッセージ数';
COMMENT ON COLUMN kazuki_jedai.gold.gold_activity_daily.voice_duration_seconds IS 'ボイス使用時間の合計（秒）';

-- ---------------------------------------------------------------------------
-- 3. gold_user_activity（ユーザごとのメッセージ数・ボイス時間）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.gold.gold_user_activity (
  user_id                    STRING,
  message_count              BIGINT,
  voice_duration_seconds     DOUBLE
)
USING DELTA
COMMENT 'ユーザごとのメッセージ数・ボイス使用時間。ユーザ別活動ランキング用。';

COMMENT ON COLUMN kazuki_jedai.gold.gold_user_activity.user_id IS 'ユーザ ID（Silver の user_id と同一）';
COMMENT ON COLUMN kazuki_jedai.gold.gold_user_activity.message_count IS 'メッセージ数';
COMMENT ON COLUMN kazuki_jedai.gold.gold_user_activity.voice_duration_seconds IS 'ボイス使用時間の合計（秒）';

-- ---------------------------------------------------------------------------
-- 4. gold_channel_activity（チャンネル・カテゴリごとのメッセージ数・ボイス時間）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kazuki_jedai.gold.gold_channel_activity (
  channel_id                 STRING,
  category_id                STRING,
  message_count              BIGINT,
  voice_duration_seconds     DOUBLE
)
USING DELTA
COMMENT 'チャンネル（およびカテゴリ）ごとのメッセージ数・ボイス使用時間。チャンネル別比較・カテゴリ Exclude 用。';

COMMENT ON COLUMN kazuki_jedai.gold.gold_channel_activity.channel_id IS 'チャンネル ID';
COMMENT ON COLUMN kazuki_jedai.gold.gold_channel_activity.category_id IS 'カテゴリ ID（Exclude 用 Filter に使用、NULL 可）';
COMMENT ON COLUMN kazuki_jedai.gold.gold_channel_activity.message_count IS 'メッセージ数';
COMMENT ON COLUMN kazuki_jedai.gold.gold_channel_activity.voice_duration_seconds IS 'ボイス使用時間の合計（秒）';
