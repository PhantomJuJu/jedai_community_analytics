SELECT
  guild_id,
  guild_name,
  weekday,
  hour_slot,
  CASE
    WHEN weekday = 0 THEN '1. 月'
    WHEN weekday = 1 THEN '2. 火'
    WHEN weekday = 2 THEN '3. 水'
    WHEN weekday = 3 THEN '4. 木'
    WHEN weekday = 4 THEN '5. 金'
    WHEN weekday = 5 THEN '6. 土'
    WHEN weekday = 6 THEN '7. 日'
    ELSE CAST(weekday AS STRING)
  END AS weekday_display,
  message_count_aggregated,
  voice_duration_seconds_aggregated,
  voice_duration_seconds_aggregated / 3600.0 AS voice_duration_hours,
  (
    0.9 * (
      voice_duration_seconds_aggregated
      / NULLIF(MAX(voice_duration_seconds_aggregated) OVER (PARTITION BY guild_id), 0)
    )
    + 0.1 * (
      message_count_aggregated
      / NULLIF(MAX(message_count_aggregated) OVER (PARTITION BY guild_id), 0)
    )
  ) AS voice_dominant_score,
  RANK() OVER (
    PARTITION BY guild_id ORDER BY voice_duration_seconds_aggregated DESC
  ) AS voice_slot_rank
FROM kazuki_jedai.gold.activity_by_weekday_hour
