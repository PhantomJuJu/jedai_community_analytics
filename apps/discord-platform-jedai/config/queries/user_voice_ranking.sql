SELECT
  user_name,
  SUM(voice_duration_seconds_aggregated) / 3600 AS voice_hours
FROM kazuki_jedai.gold.user_activity
GROUP BY user_name
ORDER BY voice_hours DESC
LIMIT 25
