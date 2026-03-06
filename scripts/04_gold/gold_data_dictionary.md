# Gold 層 データディクショナリ（Data Dictionary）

**目的:** 本ドキュメントは、Discord コミュニティ活動可視化（JEDAI）プロジェクトの **Gold スキーマ（`kazuki_jedai.gold`）に格納するテーブルのデータディクショナリ**である。スキーマ設計の参照・承認用として利用し、承認後に実装（DDL・集計ジョブ）を行う。

**Author:** Kazuki Date  
**Contact:** kazuki.date@myteam.com  
**Date / Last Modified:** 2026-03-06 

---

## 前提・命名

- **カタログ・スキーマ:** `kazuki_jedai.gold`
- **集計元:** Silver の `message_fact`, `voice_chat_fact`（および Dimension との JOIN で名前を取得する場合あり）。
- **ボイス使用時間:** Silver に秒数カラムはない。`left_at - joined_at` を秒で計算し、集計単位（曜日×時間帯／日／ユーザ／チャンネル）に応じて **按分** または **SUM** する。
- **複数ギルド対応:** 全 Gold テーブルに **guild_id**（および表示用 **guild_name**）を持つ。ダッシュボードでギルドによる絞り込み・比較が可能。

---

## 1. activity_by_weekday_hour

**完全修飾名:** `kazuki_jedai.gold.activity_by_weekday_hour`

**役割・用途:** 曜日×時間帯ごとのメッセージ数・ボイス時間を集計し、ダッシュボードの「曜日×時間帯ヒートマップ」「曜日別 Bar chart」用データを提供する。ギルドで絞り込み・比較可能。

**集計元:** `message_fact` を `timestamp` から導出した (guild_id, weekday, hour_slot) で COUNT。`voice_chat_fact` は **時間帯按分**（セッションが重なった各 (日付, 時) にその時間帯内の秒数を配分）してから (guild_id, weekday, hour_slot) で SUM。

### カラム一覧

| Target Column | Data Type | Source Column | Source Table | Transformation Logic |
|---------------|-----------|---------------|--------------|----------------------|
| guild_id | BIGINT | guild_id | silver.message_fact, silver.voice_chat_fact | Direct mapping。集計キー。GROUP BY (guild_id, weekday, hour_slot)。 |
| guild_name | STRING | (表示名カラム) | silver.guild_dim | JOIN guild_dim ON guild_id。ダッシュボードラベル用。 |
| weekday | INT | timestamp（msg）, 按分後の date（voice） | silver.message_fact, silver.voice_chat_fact | message_fact: dayofweek(timestamp)。voice_chat_fact: 時間帯按分で展開した (date, hour) から date の曜日を導出。集計キー。 |
| hour_slot | INT | timestamp（msg）, 按分後の hour（voice） | silver.message_fact, silver.voice_chat_fact | message_fact: hour(timestamp)（0〜23）。voice_chat_fact: 按分後の「時」。集計キー。 |
| message_count | BIGINT | — | silver.message_fact | COUNT(\*) GROUP BY guild_id, weekday, hour_slot。 |
| voice_duration_seconds | DOUBLE | joined_at, left_at | silver.voice_chat_fact | 時間帯按分: セッションが重なる各 (date, hour) にその時間帯内の秒数を配分し、SUM(配分秒数) GROUP BY guild_id, weekday, hour_slot。 |

### 補足

- ボイスは **時間帯按分** を行う。セッション全体を `joined_at` の 1 時間に乗せず、重なった各 (日付, 時) に「その 1 時間にいた秒数」だけを配分してから SUM する（数時間・日跨ぎを正しく扱うため）。

---

## 2. activity_daily

**完全修飾名:** `kazuki_jedai.gold.activity_daily`

**役割・用途:** 日付ごとのメッセージ数・ボイス時間を集計し、ダッシュボードの「時系列トレンド（Time series）」「今月 KPI」用データを提供する。ギルドで絞り込み・比較可能。

**集計元:** `message_fact` を (guild_id, message_date) で COUNT。`voice_chat_fact` は **日按分**（セッションが重なった各 (日付) にその日に属する秒数を配分）してから (guild_id, activity_date) で SUM。両者を (guild_id, activity_date) で JOIN。

### カラム一覧

| Target Column | Data Type | Source Column | Source Table | Transformation Logic |
|---------------|-----------|---------------|--------------|----------------------|
| guild_id | BIGINT | guild_id | silver.message_fact, silver.voice_chat_fact | Direct mapping。集計キー。GROUP BY (guild_id, activity_date)。 |
| guild_name | STRING | (表示名カラム) | silver.guild_dim | JOIN guild_dim ON guild_id。ダッシュボードラベル用。 |
| activity_date | DATE | message_date（msg）, 按分後の date（voice） | silver.message_fact, silver.voice_chat_fact | message_fact: Direct mapping。voice_chat_fact: 日按分で展開した「日付」。本テーブルはこのカラムでパーティション分割。 |
| message_count | BIGINT | — | silver.message_fact | COUNT(\*) GROUP BY guild_id, message_date。 |
| voice_duration_seconds | DOUBLE | joined_at, left_at | silver.voice_chat_fact | 日按分: セッションが重なる各 date にその日に属する秒数を配分し、SUM(配分秒数) GROUP BY guild_id, activity_date。 |

### 補足

- ボイスは **日按分** を行う。日をまたいだセッションは「その日に属する秒数」だけを各 activity_date に配分する（例: 金曜 23:00〜土曜 02:00 → 金曜に 1 時間ぶん、土曜に 2 時間ぶん）。

---

## 3. user_activity

**完全修飾名:** `kazuki_jedai.gold.user_activity`

**役割・用途:** ユーザごとのメッセージ数・ボイス時間を集計し、ダッシュボードの「ユーザ別メッセージ数・ボイス時間」ランキング等に使う。表示用に **user_name** を持つ（user_dim と JOIN）。ギルドで絞り込み・比較可能。

**集計元:** `message_fact` を (guild_id, user_id) で COUNT。`voice_chat_fact` を (guild_id, user_id) で SUM(duration_seconds)。両者を (guild_id, user_id) で JOIN したうえで、`user_dim`, `guild_dim` と JOIN して user_name, guild_name を取得。

### カラム一覧

| Target Column | Data Type | Source Column | Source Table | Transformation Logic |
|---------------|-----------|---------------|--------------|----------------------|
| guild_id | BIGINT | guild_id | silver.message_fact, silver.voice_chat_fact | Direct mapping。集計キー。1 行 = 1 ギルド内の 1 ユーザの活動。GROUP BY (guild_id, user_id)。 |
| guild_name | STRING | (表示名カラム) | silver.guild_dim | JOIN guild_dim ON guild_id。ダッシュボードラベル用。 |
| user_id | STRING | user_id | silver.message_fact, silver.voice_chat_fact | Direct mapping。集計キー。 |
| user_name | STRING | (表示名カラム) | silver.user_dim | JOIN user_dim ON user_id。ダッシュボードラベル用。 |
| message_count | BIGINT | — | silver.message_fact | COUNT(\*) GROUP BY guild_id, user_id。 |
| voice_duration_seconds | DOUBLE | joined_at, left_at | silver.voice_chat_fact | unix_timestamp(left_at) - unix_timestamp(joined_at) を秒で計算し、SUM(秒数) GROUP BY guild_id, user_id。 |

### 補足

- user_name は **user_dim** との JOIN で取得する。user_dim に存在しない user_id の場合は NULL または未取得の扱いとする。
- 同一 **user_id** が複数ギルドに所属している場合は複数行になる。ギルド別ユーザランキング用。

---

## 4. channel_activity

**完全修飾名:** `kazuki_jedai.gold.channel_activity`

**役割・用途:** チャンネル（およびカテゴリ）ごとのメッセージ数・ボイス時間を集計する。ダッシュボードでチャンネル別比較や **カテゴリ Exclude**（特定カテゴリを除いた表示）に利用する。表示用に **channel_name**, **category_name** を持つ（channel_dim, category_dim と JOIN）。ギルドで絞り込み可能。

**集計元:** `message_fact` を (guild_id, channel_id, category_id) で COUNT。`voice_chat_fact` を (guild_id, channel_id, category_id) で SUM(duration_seconds)。両者を (guild_id, channel_id, category_id) で JOIN したうえで、`channel_dim`, `category_dim`, `guild_dim` と JOIN して channel_name, category_name, guild_name を取得。guild_id は Fact または channel_dim から取得可能。

### カラム一覧

| Target Column | Data Type | Source Column | Source Table | Transformation Logic |
|---------------|-----------|---------------|--------------|----------------------|
| guild_id | BIGINT | guild_id | silver.message_fact, silver.voice_chat_fact, silver.channel_dim | Fact または channel_dim から取得。Direct mapping。集計キー。GROUP BY (guild_id, channel_id, category_id)。 |
| guild_name | STRING | (表示名カラム) | silver.guild_dim | JOIN guild_dim ON guild_id。ダッシュボードラベル用。 |
| channel_id | STRING | channel_id | silver.message_fact, silver.voice_chat_fact | Direct mapping。集計キー。 |
| category_id | STRING | category_id | silver.message_fact, silver.voice_chat_fact | Direct mapping。集計キー。NULL 可。カテゴリ Exclude 用。 |
| channel_name | STRING | (表示名カラム) | silver.channel_dim | JOIN channel_dim ON channel_id。ダッシュボードラベル用。 |
| category_name | STRING | (表示名カラム) | silver.category_dim | JOIN category_dim ON category_id。ダッシュボードラベル・Filter 用。 |
| message_count | BIGINT | — | silver.message_fact | COUNT(\*) GROUP BY guild_id, channel_id, category_id。 |
| voice_duration_seconds | DOUBLE | joined_at, left_at | silver.voice_chat_fact | unix_timestamp(left_at) - unix_timestamp(joined_at) を秒で計算し、SUM(秒数) GROUP BY guild_id, channel_id, category_id。 |

### 補足

- channel_name, category_name は **channel_dim**, **category_dim** との JOIN で取得する。Dimension に存在しない ID の場合は NULL または未取得の扱いとする。
- **カテゴリ Exclude:** ダッシュボード側で category_id または category_name に Filter をかけ、除外したいカテゴリを外して集計・表示する。Gold は guild_id × channel_id × category_id の粒度で保持する。

---

## 参照

- **Gold 集計の詳細:** `scripts/04_gold/README.md`（Casting・導出、集計ロジック、按分の説明）
- **Silver テーブル定義:** `scripts/03_silver/` の DLT および README
- **Dimension:** `guild_dim`, `category_dim`, `channel_dim`, `user_dim`（guild_name および名前取得用）
