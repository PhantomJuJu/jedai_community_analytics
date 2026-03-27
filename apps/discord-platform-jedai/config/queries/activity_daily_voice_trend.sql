SELECT
  activity_date,
  guild_name,
  SUM(voice_duration_seconds_aggregated) / 3600 AS voice_hours
FROM kazuki_jedai.gold.activity_daily
GROUP BY activity_date, guild_name
ORDER BY activity_date
