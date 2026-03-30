SELECT
  *,
  CASE
    WHEN `weekday` = 0 THEN '1. 月'
    WHEN `weekday` = 1 THEN '2. 火'
    WHEN `weekday` = 2 THEN '3. 水'
    WHEN `weekday` = 3 THEN '4. 木'
    WHEN `weekday` = 4 THEN '5. 金'
    WHEN `weekday` = 5 THEN '6. 土'
    WHEN `weekday` = 6 THEN '7. 日'
    ELSE CAST(`weekday` AS STRING)
  END AS weekday_display,
  `voice_duration_seconds_aggregated` / 3600 AS voice_duration_hours
FROM kazuki_jedai.gold.activity_by_weekday_hour
