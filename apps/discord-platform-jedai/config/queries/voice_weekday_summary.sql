WITH agg AS (
  SELECT
    weekday,
    SUM(voice_duration_seconds_aggregated) / 3600.0 AS daily_voice_hours
  FROM kazuki_jedai.gold.activity_by_weekday_hour
  GROUP BY weekday
),
mx AS (
  SELECT MAX(daily_voice_hours) AS max_voice_hours FROM agg
)
SELECT
  a.weekday,
  CASE
    WHEN a.weekday = 0 THEN '1. 月'
    WHEN a.weekday = 1 THEN '2. 火'
    WHEN a.weekday = 2 THEN '3. 水'
    WHEN a.weekday = 3 THEN '4. 木'
    WHEN a.weekday = 4 THEN '5. 金'
    WHEN a.weekday = 5 THEN '6. 土'
    WHEN a.weekday = 6 THEN '7. 日'
    ELSE CAST(a.weekday AS STRING)
  END AS weekday_label,
  a.daily_voice_hours,
  a.daily_voice_hours / NULLIF(m.max_voice_hours, 0) AS voice_day_score,
  RANK() OVER (ORDER BY a.daily_voice_hours ASC) AS low_voice_rank
FROM agg a
CROSS JOIN mx m
ORDER BY a.weekday
