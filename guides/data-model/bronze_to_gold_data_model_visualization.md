# Bronze-Gold データモデル可視化

`kazuki_jedai` の現行 DLT 実装に基づく、Bronze → Silver → Gold の依存関係可視化。

- Bronze→Silver: `scripts/03_silver/01_silver_cleansing_dlt_integrated.py`
- Silver→Gold: `scripts/04_gold/01_gold_aggregation_dlt.py`

## 1. レイヤ全体図（Bronze → Silver → Gold）

```mermaid
%%{init: {"flowchart": {"curve": "linear"}}}%%
flowchart LR
  subgraph bronze [Bronze Layer]
    direction TB
    b_channels[discord_channels_raw]
    b_messages[discord_messages_raw]
    b_voice[discord_voice_activity_raw]
  end

  subgraph silver [Silver Layer]
    direction TB
    subgraph silver_dims [Dimensions]
      direction TB
      s_guild[guild_dim]
      s_category[category_dim]
      s_channel[channel_dim]
      s_user[user_dim]
    end
    subgraph silver_facts [Facts]
      direction TB
      s_message[message_fact]
      s_voice[voice_chat_fact]
    end
  end

  subgraph gold [Gold Layer]
    direction TB
    g_weekhour[activity_by_weekday_hour]
    g_daily[activity_daily]
    g_user[user_activity]
    g_channel[channel_activity]
    g_voice_summary[user_voice_summary]
  end

  b_channels --> s_guild
  b_channels --> s_category
  b_channels --> s_channel

  b_messages --> s_user
  b_voice --> s_user

  b_messages --> s_message
  b_voice --> s_voice

  s_message --> g_weekhour
  s_voice --> g_weekhour
  s_message --> g_daily
  s_voice --> g_daily
  s_message --> g_user
  s_voice --> g_user
  s_message --> g_channel
  s_voice --> g_channel
  s_voice --> g_voice_summary

  s_guild --> g_weekhour
  s_guild --> g_daily
  s_guild --> g_user
  s_guild --> g_channel
  s_guild --> g_voice_summary
  s_user --> g_user
  s_user --> g_voice_summary
  s_channel --> g_channel
  s_category --> g_channel
```

## 2. 補足（実装上のポイント）

- `activity_by_weekday_hour` は `voice_chat_fact` を時間帯按分して集計。
- `activity_daily` は `voice_chat_fact` を日按分して集計。
- `user_voice_summary` は `voice_chat_fact` のみを集計元として使用。
- 一部アプリクエリ（`activity_by_category_daily`）は Silver 直接参照だが、本資料は Bronze→Gold の物理テーブル依存のみを対象。
