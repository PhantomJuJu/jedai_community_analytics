WITH windows AS (
  SELECT
    SUM(
      CASE
        WHEN activity_date >= DATE_SUB(CURRENT_DATE(), 6) AND activity_date <= CURRENT_DATE()
        THEN voice_duration_seconds_aggregated
        ELSE 0
      END
    ) / 3600.0 AS this_week_voice_hours,
    SUM(
      CASE
        WHEN activity_date >= DATE_SUB(CURRENT_DATE(), 13)
        AND activity_date <= DATE_SUB(CURRENT_DATE(), 7)
        THEN voice_duration_seconds_aggregated
        ELSE 0
      END
    ) / 3600.0 AS last_week_voice_hours
  FROM kazuki_jedai.gold.activity_daily
),
rates AS (
  SELECT
    this_week_voice_hours,
    last_week_voice_hours,
    CASE
      WHEN last_week_voice_hours IS NULL OR last_week_voice_hours = 0 THEN NULL
      ELSE (this_week_voice_hours - last_week_voice_hours) / last_week_voice_hours * 100
    END AS voice_growth_rate_pct
  FROM windows
)
SELECT
  this_week_voice_hours,
  last_week_voice_hours,
  voice_growth_rate_pct,
  CASE
    WHEN voice_growth_rate_pct IS NULL THEN 'GREEN'
    WHEN voice_growth_rate_pct < -15 THEN 'RED'
    WHEN voice_growth_rate_pct < 0 THEN 'YELLOW'
    ELSE 'GREEN'
  END AS voice_health_signal
FROM rates
