SELECT
  user_name,
  user_id,
  voice_duration_seconds_aggregated / 3600.0 AS voice_hours_total,
  active_week_count_aggregated,
  tenure_weeks_aggregated,
  (voice_duration_seconds_aggregated / 3600.0)
    * (
      active_week_count_aggregated / NULLIF(tenure_weeks_aggregated, 0)
    ) AS voice_ltv_score
FROM kazuki_jedai.gold.user_voice_summary
WHERE tenure_weeks_aggregated >= 2
ORDER BY voice_ltv_score DESC NULLS LAST
LIMIT 20
