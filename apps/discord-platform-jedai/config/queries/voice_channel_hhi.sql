WITH totals AS (
  SELECT SUM(voice_duration_seconds_aggregated) AS total_voice_sec
  FROM kazuki_jedai.gold.channel_activity
  WHERE voice_duration_seconds_aggregated > 0
),
shares AS (
  SELECT
    guild_id,
    guild_name,
    channel_id,
    channel_name,
    category_name,
    voice_duration_seconds_aggregated,
    voice_duration_seconds_aggregated / NULLIF((SELECT total_voice_sec FROM totals), 0) AS voice_share
  FROM kazuki_jedai.gold.channel_activity
  WHERE voice_duration_seconds_aggregated > 0
),
hhi_calc AS (
  SELECT SUM(POWER(voice_share, 2)) * 10000 AS voice_channel_hhi
  FROM shares
)
SELECT
  s.guild_id,
  s.guild_name,
  s.channel_name,
  s.category_name,
  s.voice_duration_seconds_aggregated / 3600.0 AS voice_hours,
  s.voice_share * 100 AS voice_share_pct,
  h.voice_channel_hhi,
  CASE
    WHEN h.voice_channel_hhi < 1500 THEN '健全（分散）'
    WHEN h.voice_channel_hhi < 2500 THEN '要注意（中程度集中）'
    ELSE '危険（高集中）'
  END AS hhi_status
FROM shares s
CROSS JOIN hhi_calc h
ORDER BY s.voice_share DESC
