SELECT
  user_name,
  user_id,
  avg_session_duration_seconds_aggregated / 60.0 AS avg_session_minutes,
  active_week_count_aggregated AS active_weeks,
  session_count_aggregated,
  voice_duration_seconds_aggregated / 3600.0 AS voice_hours_total
FROM kazuki_jedai.gold.user_voice_summary
WHERE session_count_aggregated >= 2
