# Gold 集計レイヤー（04_gold）

**Author:** Kazuki Date  
**Contact:** kazuki.date@myteam.com  
**Date / Last Modified:** 2026-03-06  

---

## 概要

`scripts/04_gold` は、**Silver スキーマ（`kazuki_jedai.silver`）のテーブルを集計し、Gold スキーマ（`kazuki_jedai.gold`）に分析用テーブルを出力する**役割を持つ。

- **プロジェクト:** Discord コミュニティ活動可視化（JEDAI）
- **カタログ:** `kazuki_jedai`
- **Silver スキーマ:** `kazuki_jedai.silver`（定義は `scripts/03_silver/` の DLT を参照）
- **Gold スキーマ:** `kazuki_jedai.gold`

本フォルダで作成する Gold テーブルは **4 本**で、ダッシュボードの「曜日×時間帯ヒートマップ」「時系列トレンド」「ユーザ別活動」「チャンネル別活動・カテゴリ Exclude」に対応する。

---

## 共通事項

- **複数ギルド対応:** 全 Gold テーブルに **guild_id**（および表示用 **guild_name**）を持つ。集計キーに guild_id を含め、guild_dim と JOIN して guild_name を付与する。
- **集計カラムの命名:** 集計値を表すカラムには **_aggregated** サフィックスを用いる（**message_count_aggregated**, **voice_duration_seconds_aggregated**）。
- **ボイス使用時間:** Silver には秒数カラムがない。`voice_chat_fact` の **`left_at - joined_at`** を秒で計算し、集計時に **SUM** する。
- **日付・曜日・時間:** タイムゾーンはプロジェクト方針に従う。`timestamp` / `joined_at` 等から `activity_date`・`weekday`・`hour_slot` を導出する際は、同一方針で統一する。
- **ボイスセッションの跨ぎ（曜日×時間帯集計時）:** ボイスは数時間・日をまたぐことが多い。**(weekday, hour_slot)** で集計する場合、セッション全体を `joined_at` の 1 時間に乗せると他時間帯が過少になる。そのため **「その 1 時間のうち何秒（何割）アクティブだったか」を算出し、重なった各 (weekday, hour_slot) に按分してから SUM する**。例: 21:30 参加・22:45 退出なら、21 時台に 30 分ぶん（0.5 時間相当）、22 時台に 45 分ぶん（0.75 時間相当）を配分する。日跨ぎ（例: 23:00〜翌 01:30）も同様に、各時間帯に属する秒数だけを足す。
- **ボイスセッションの跨ぎ（日次集計時）:** **activity_daily** でも、日をまたいだセッションは **「その日に属する秒数」だけを各 activity_date に配分**する。例: 金曜 23:00 参加・土曜 02:00 退出なら、金曜に 1 時間ぶん、土曜に 2 時間ぶんを配分する。セッション全体を `joined_at` の日（または `session_date`）にだけ乗せない。
- **voice_duration_seconds_aggregated の型:** 按分ロジックで秒の端数（小数）が発生するため、DDL（`01_create_gold_tables.sql`）では **DOUBLE** に統一する。集計ジョブも DOUBLE で投入すること。
- **パーティション:** **activity_daily** は **activity_date** でパーティション分割（日付範囲クエリの I/O 削減）。それ以外の 3 本（activity_by_weekday_hour, user_activity, channel_activity）は日付カラムがないためパーティション未指定。将来「集計時点日」等のカラムを追加する場合は PARTITIONED BY の検討を推奨する。
- **DLT パイプライン:** `01_gold_aggregation_dlt.py` は Delta Live Tables で実行する。ソースは **カタログ kazuki_jedai の Silver テーブル**（`kazuki_jedai.silver.message_fact`, `kazuki_jedai.silver.voice_chat_fact`）を 3 レベル名で参照する。ターゲットは `kazuki_jedai.gold`。Full refresh 運用を推奨。
- **タイムゾーン:** 曜日・時間帯・日付の導出は Spark セッション（クラスタ）のタイムゾーンに依存する。プロジェクト方針（例: UTC）に合わせて設定すること。

---

## コーディング参照（Coding Reference）

- **weekday（INT）:** 曜日。0=月曜, 1=火曜, 2=水曜, 3=木曜, 4=金曜, 5=土曜, 6=日曜。Spark の DAYOFWEEK を (DAYOFWEEK + 5) % 7 で変換した値。
- **hour_slot（INT）:** 時間帯（0〜23）。0 = 0:00〜0:59、23 = 23:00〜23:59。タイムゾーンはプロジェクト方針（例: UTC）に合わせる。

---

## 1. activity_by_weekday_hour

**粒度:** 1 行 = 1 ギルド × 1 曜日 × 1 時間帯（集計期間中の合計）  
**PK:** (guild_id, weekday, hour_slot)

| 項目 | 内容 |
|------|------|
| **役割** | 曜日×時間帯ごとのメッセージ数・ボイス時間を集計し、ヒートマップ・曜日別 Bar 用のデータを提供する。 |
| **対応ダッシュボード** | 曜日×時間帯ヒートマップ、曜日別 Bar chart |

### 元になる Silver テーブル

- **message_fact**（`timestamp` から weekday / hour_slot を導出。guild_id は集計キー）
- **voice_chat_fact**（ボイスは **時間帯按分** で集計。後述。guild_id は集計キー）
- **guild_dim**（guild_name 取得用）

### Gold カラム一覧

| カラム名 | 型 | 意味 |
|----------|-----|------|
| guild_id | BIGINT | ギルド ID。集計キー。 |
| guild_name | STRING | ギルド表示名（guild_dim と JOIN で取得） |
| weekday | INT | 曜日（0=月曜〜6=日曜。コーディング参照） |
| hour_slot | INT | 時間帯（0〜23。コーディング参照） |
| message_count_aggregated | BIGINT | メッセージ数（集計値） |
| voice_duration_seconds_aggregated | DOUBLE | ボイス使用時間の合計（秒）。按分時は端数を含む。 |

### Casting・導出

- **message_fact**
  - **weekday:** `timestamp` から曜日を取得（例: `dayofweek(timestamp)` や `date_format(timestamp, 'u')`）。
  - **hour_slot:** `hour(timestamp)`（0〜23）。
  - 1 メッセージは 1 つの (weekday, hour_slot) にのみ属するので、そのまま GROUP BY で COUNT すればよい。
- **voice_chat_fact（時間帯按分）**
  - ボイスセッションは **数時間・日をまたぐ** ため、セッション全体を `joined_at` の 1 時間に乗せない。
  - **手順:** 各セッションについて、`joined_at` と `left_at` が **重なるすべての (日付, 時)** を列挙し、その時間帯内に含まれる秒数（＝その 1 時間における「何割いたか」に相当）を計算する。例: 21:30 参加・22:45 退出 → 21 時台に 1800 秒、22 時台に 2700 秒を配分。日跨ぎ（23:00〜翌 01:30）なら 23 時台・0 時台・1 時台にそれぞれ属する秒数を配分。
  - 各 (日付, 時) から **weekday** と **hour_slot** を導出し、**(weekday, hour_slot)** ごとに **SUM(配分された秒数)** する。つまり「その時間帯にアクティブだったら 1」ではなく「その 1 時間のうち何秒いたか（0.5 時間なら 0.5 相当）」を足し合わせる。

### 集計ロジック

- **GROUP BY:** `guild_id`, `weekday`, `hour_slot`
- **message_count_aggregated:** `message_fact` を `(guild_id, weekday, hour_slot)` で **COUNT(\*)** または COUNT(message_id)。
- **voice_duration_seconds_aggregated:** `voice_chat_fact` を上記の **時間帯按分** で展開したうえで、`(guild_id, weekday, hour_slot)` で **SUM(配分秒数)**。実装では、セッションごとに「重なった各 (date, hour) とその時間帯内の秒数」を行にした DataFrame を作り、date から weekday を導出してから GROUP BY する。
- メッセージ集計とボイス集計を **(guild_id, weekday, hour_slot)** で JOIN し、**guild_dim** と JOIN して guild_name を付与する。

---

## 2. activity_daily

**粒度:** 1 行 = 1 ギルド × 1 日  
**PK:** (guild_id, activity_date)

| 項目 | 内容 |
|------|------|
| **役割** | 日付ごとのメッセージ数・ボイス時間を集計し、時系列トレンド・今月 KPI 用のデータを提供する。 |
| **対応ダッシュボード** | 時系列トレンド（Time series）、今月 KPI |

### 元になる Silver テーブル

- **message_fact**（`message_date` を使用。guild_id は集計キー）
- **voice_chat_fact**（ボイスは **日跨ぎの場合は日ごとに按分**。後述。guild_id は集計キー）
- **guild_dim**（guild_name 取得用）

### Gold カラム一覧

| カラム名 | 型 | 意味 |
|----------|-----|------|
| guild_id | BIGINT | ギルド ID。集計キー。 |
| guild_name | STRING | ギルド表示名（guild_dim と JOIN で取得） |
| activity_date | DATE | 活動日（本テーブルはこのカラムでパーティション分割） |
| message_count_aggregated | BIGINT | メッセージ数（集計値） |
| voice_duration_seconds_aggregated | DOUBLE | ボイス使用時間の合計（秒）。按分時は端数を含む。 |

### Casting・導出

- **message_fact**
  - **activity_date:** `message_date` をそのまま使用。1 メッセージは 1 日ののみ属するので、そのまま GROUP BY で COUNT すればよい。
- **voice_chat_fact（日按分）**
  - ボイスセッションは **日をまたぐ** ため、セッション全体を `joined_at` の日（または `session_date`）にだけ乗せない。
  - **手順:** 各セッションについて、`joined_at` と `left_at` が **重なるすべての (日付)** を列挙し、その日に含まれる秒数（＝その日における「何秒いたか」）を計算する。例: 金曜 23:00 参加・土曜 02:00 退出 → 金曜に 3600 秒（1 時間）、土曜に 7200 秒（2 時間）を配分。
  - 各 (日付) を **activity_date** とし、**activity_date** ごとに **SUM(配分された秒数)** する。

### 集計ロジック

- **GROUP BY:** `guild_id`, `activity_date`
- **message_count_aggregated:** `message_fact` を **(guild_id, message_date)** で **COUNT(\*)** または COUNT(message_id)。
- **voice_duration_seconds_aggregated:** `voice_chat_fact` を上記の **日按分** で展開したうえで、**(guild_id, activity_date)** で **SUM(配分秒数)**。実装では、セッションごとに「重なった各 (date) とその日に属する秒数」を行にした DataFrame を作り、(guild_id, activity_date) で GROUP BY する。
- 両者を **(guild_id, activity_date)** で JOIN し、**guild_dim** と JOIN して guild_name を付与する。

**補足:** 日付ごとのトレンド用。曜日×時間帯のパターン集計（日付なし）は activity_by_weekday_hour を参照する。ボイスは **日按分** を行う（日をまたいだセッションはその日に属する秒数だけを各 activity_date に配分）。

---

## 3. user_activity

**粒度:** 1 行 = 1 ギルド × 1 ユーザ（ギルド別ユーザ活動）  
**PK:** (guild_id, user_id)

| 項目 | 内容 |
|------|------|
| **役割** | ユーザごとのメッセージ数・ボイス時間を集計し、ユーザ別活動ランキング等に使う。 |
| **対応ダッシュボード** | ユーザ別メッセージ数・ボイス時間 |

### 元になる Silver テーブル

- **message_fact**（guild_id, user_id で COUNT）
- **voice_chat_fact**（guild_id, user_id で SUM(duration)）
- **user_dim**（user_name 取得用）
- **guild_dim**（guild_name 取得用）

### Gold カラム一覧

| カラム名 | 型 | 意味 |
|----------|-----|------|
| guild_id | BIGINT | ギルド ID。集計キー。 |
| guild_name | STRING | ギルド表示名（guild_dim と JOIN で取得） |
| user_id | STRING | ユーザ ID（Silver の user_id と同一） |
| user_name | STRING | ユーザ表示名（user_dim と JOIN で取得） |
| message_count_aggregated | BIGINT | メッセージ数（集計値） |
| voice_duration_seconds_aggregated | DOUBLE | ボイス使用時間の合計（秒） |

### Casting・導出

- **voice_duration_seconds_aggregated:** `voice_chat_fact` で `unix_timestamp(left_at) - unix_timestamp(joined_at)` を秒として計算し、(guild_id, user_id) ごとに SUM。

### 集計ロジック

- **GROUP BY:** `guild_id`, `user_id`
- **message_count_aggregated:** `message_fact` を **(guild_id, user_id)** で **COUNT(\*)** または COUNT(message_id)。
- **voice_duration_seconds_aggregated:** `voice_chat_fact` を **(guild_id, user_id)** で **SUM(duration_seconds)**。  
  両者を **(guild_id, user_id)** で JOIN し、**user_dim** と JOIN して user_name、**guild_dim** と JOIN して guild_name を取得する。

---

## 4. channel_activity

**粒度:** 1 行 = 1 ギルド × 1 チャンネル × 1 カテゴリ（ギルド別チャンネル活動）  
**PK:** (guild_id, channel_id, category_id)

| 項目 | 内容 |
|------|------|
| **役割** | チャンネル（およびカテゴリ）ごとのメッセージ数・ボイス時間を集計する。ダッシュボードでチャンネル別比較や **カテゴリ Exclude**（特定カテゴリを除いた集計）に利用する。 |
| **対応ダッシュボード** | チャンネル別メッセージ数・ボイス時間、カテゴリ Exclude 用 Filter |

### 元になる Silver テーブル

- **message_fact**（guild_id, channel_id, category_id）
- **voice_chat_fact**（guild_id, channel_id, category_id）
- **channel_dim**（channel_name 取得用）
- **category_dim**（category_name 取得用）
- **guild_dim**（guild_name 取得用）

### Gold カラム一覧

| カラム名 | 型 | 意味 |
|----------|-----|------|
| guild_id | BIGINT | ギルド ID。集計キー。 |
| guild_name | STRING | ギルド表示名（guild_dim と JOIN で取得） |
| channel_id | STRING | チャンネル ID |
| category_id | STRING | カテゴリ ID（Exclude 用 Filter に使用、NULL 可） |
| channel_name | STRING | チャンネル表示名（channel_dim と JOIN で取得） |
| category_name | STRING | カテゴリ表示名（category_dim と JOIN で取得） |
| message_count_aggregated | BIGINT | メッセージ数（集計値） |
| voice_duration_seconds_aggregated | DOUBLE | ボイス使用時間の合計（秒） |

### Casting・導出

- **voice_duration_seconds_aggregated:** `voice_chat_fact` で `left_at - joined_at` を秒で計算し、(guild_id, channel_id, category_id) ごとに SUM。

### 集計ロジック

- **GROUP BY:** `guild_id`, `channel_id`, `category_id`
- **message_count_aggregated:** `message_fact` を **(guild_id, channel_id, category_id)** で **COUNT(\*)** または COUNT(message_id)。
- **voice_duration_seconds_aggregated:** `voice_chat_fact` を **(guild_id, channel_id, category_id)** で **SUM(duration_seconds)**。  
  両者を **(guild_id, channel_id, category_id)** で JOIN し、**channel_dim**, **category_dim**, **guild_dim** と JOIN して channel_name, category_name, guild_name を取得する。

**カテゴリ Exclude:** ダッシュボード側で `category_id` または category_name に Filter をかけ、除外したいカテゴリを外して集計・表示する。Gold は guild_id × channel_id × category_id の粒度で保持する。

---

## 参照

- **Gold Data Dictionary:** **docs/gold_data_dictionary.md**（承認済み仕様・カラム定義）
- **Gold DDL:** テーブル定義は **scripts/04_gold/01_create_gold_tables.sql**（Delta、PARTITIONED BY は activity_daily のみ）。
- Silver テーブル定義・DLT パイプライン: **scripts/03_silver/** を参照（本 README では 03_silver のファイルは変更しない）。
- Dimension: `guild_dim`, `category_dim`, `channel_dim`, `user_dim`（名前取得用）
- Fact: `message_fact`（guild_id, timestamp, message_date, channel_id, user_id, category_id 等）, `voice_chat_fact`（guild_id, joined_at, left_at, session_date, channel_id, user_id, category_id 等）
