SELECT
  user_name,
  SUM(message_count_aggregated) AS message_count
FROM kazuki_jedai.gold.user_activity
GROUP BY user_name
ORDER BY message_count DESC
LIMIT 25
