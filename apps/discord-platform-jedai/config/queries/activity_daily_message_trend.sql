SELECT
  activity_date,
  guild_name,
  SUM(message_count_aggregated) AS message_count
FROM kazuki_jedai.gold.activity_daily
GROUP BY activity_date, guild_name
ORDER BY activity_date
