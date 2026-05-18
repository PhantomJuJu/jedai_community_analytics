SELECT channel_id, channel_name, category_id
FROM kazuki_jedai.bronze.discord_channels_raw
WHERE snapshot_date = (
  SELECT MAX(snapshot_date) FROM kazuki_jedai.bronze.discord_channels_raw
)
  AND channel_type IN (0, 5)
ORDER BY channel_name
