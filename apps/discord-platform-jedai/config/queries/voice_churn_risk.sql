SELECT
  user_name,
  last_voice_session_date,
  DATEDIFF(CURRENT_DATE(), last_voice_session_date) AS days_since_last_voice,
  session_count_aggregated,
  voice_duration_seconds_aggregated / 3600.0 AS voice_hours_total,
  CASE
    WHEN DATEDIFF(CURRENT_DATE(), last_voice_session_date) > 30 THEN 100
    WHEN DATEDIFF(CURRENT_DATE(), last_voice_session_date) > 14 THEN 75
    WHEN DATEDIFF(CURRENT_DATE(), last_voice_session_date) > 7 THEN 40
    ELSE 10
  END AS churn_risk_score,
  CASE
    WHEN DATEDIFF(CURRENT_DATE(), last_voice_session_date) > 30 THEN '離脱済み'
    WHEN DATEDIFF(CURRENT_DATE(), last_voice_session_date) > 14 THEN '高'
    WHEN DATEDIFF(CURRENT_DATE(), last_voice_session_date) > 7 THEN '要注意'
    ELSE '活発'
  END AS churn_risk_level
FROM kazuki_jedai.gold.user_voice_summary
WHERE session_count_aggregated >= 2
ORDER BY churn_risk_score DESC, days_since_last_voice DESC
LIMIT 30
