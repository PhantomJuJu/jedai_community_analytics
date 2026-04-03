# discord-platform-jedai

AppKit アプリ: `scripts/06_dashboards` の Lakeview SQL / 指標と `scripts/05_models` の few-shot + `ai_query` フローをまとめたものです。

## 開発

```bash
cd apps/discord-platform-jedai
npm install
cp .env.example .env
# .env を開き DATABRICKS_HOST / DATABRICKS_TOKEN / DATABRICKS_WAREHOUSE_ID を設定
npm run dev
```

ブラウザ: **http://localhost:8000**（`DATABRICKS_APP_PORT` 未設定時）

### 起動しないとき

- **`ConfigError: default auth...`** — Databricks 認証が通っていません。`.env` の `DATABRICKS_HOST` と `DATABRICKS_TOKEN`（PAT）、または [CLI 統合認証](https://docs.databricks.com/en/dev-tools/auth.html) で `databricks auth login` 済みのプロファイルを `DATABRICKS_CONFIG_PROFILE` で指定してください。`DATABRICKS_WAREHOUSE_ID` も必須です。
- **`npm error Invalid tag name "#"`** — `npm install` の行に **`# コメント` を付けず**、1 行で `npm install` だけ実行してください（コメントは別行に）。

SQL 型生成（Warehouse に接続できる環境で）:

```bash
npm run typegen
```

ビルド:

```bash
npm run build
npm start
```

## ワークスペースへ同期・デプロイ

```bash
databricks sync --watch . /Workspace/Users/cheng.wang@myteam.com/discord-platform-jedai
databricks apps validate --profile <PROFILE>
databricks apps deploy discord-platform-jedai \
  --source-code-path /Workspace/Users/cheng.wang@myteam.com/discord-platform-jedai \
  --profile <PROFILE>
```

## 付録: 権限（アプリ実行プリンシパル）

アプリ表示名に対応するサービスプリンシパル（例: `access app-…`）へ以下を付与します。

1. **Unity Catalog**: カタログ `kazuki_jedai` のスキーマ `gold` 上の参照テーブルに対する **SELECT**（または従来の適切な権限）。
2. **SQL Warehouse**: アプリにバインドしたウェアハウスへの **CAN USE**。
3. **Foundation Model エンドポイント**（`FOUNDATION_MODEL_ENDPOINT`）: **`ai_query`** 用の **CAN QUERY**。

任意: イベント文脈をサーバのみで渡す場合は `app.yaml` の `env` に `EVENT_CONTEXT_FOR_REQUEST` を追加してください。
