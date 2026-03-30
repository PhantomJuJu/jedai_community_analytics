SELECT
  SUM(message_count_aggregated) AS total_messages,
  SUM(voice_duration_seconds_aggregated) / 3600 AS total_voice_hours
FROM kazuki_jedai.gold.activity_daily
