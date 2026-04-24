WITH message_daily AS (
  SELECT
    message_date AS activity_date,
    guild_id,
    category_id,
    COUNT(*) AS message_count,
    CAST(0 AS DOUBLE) AS voice_duration_seconds
  FROM kazuki_jedai.silver.message_fact
  GROUP BY message_date, guild_id, category_id
),
voice_daily AS (
  SELECT
    session_date AS activity_date,
    guild_id,
    category_id,
    CAST(0 AS BIGINT) AS message_count,
    SUM(
      GREATEST(
        UNIX_TIMESTAMP(left_at) - UNIX_TIMESTAMP(joined_at),
        0
      )
    ) AS voice_duration_seconds
  FROM kazuki_jedai.silver.voice_chat_fact
  WHERE left_at IS NOT NULL
  GROUP BY session_date, guild_id, category_id
),
unioned AS (
  SELECT * FROM message_daily
  UNION ALL
  SELECT * FROM voice_daily
)
SELECT
  u.activity_date,
  g.guild_name,
  c.category_name,
  SUM(u.message_count) AS message_count,
  SUM(u.voice_duration_seconds) AS voice_duration_seconds,
  SUM(u.voice_duration_seconds) / 3600.0 AS voice_duration_hours
FROM unioned u
LEFT JOIN kazuki_jedai.silver.guild_dim g ON u.guild_id = g.guild_id
LEFT JOIN kazuki_jedai.silver.category_dim c ON u.category_id = c.category_id
GROUP BY u.activity_date, g.guild_name, c.category_name
