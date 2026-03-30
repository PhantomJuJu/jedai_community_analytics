SELECT
  *,
  `voice_duration_seconds_aggregated` / 3600 AS voice_duration_hours
FROM kazuki_jedai.gold.user_activity
