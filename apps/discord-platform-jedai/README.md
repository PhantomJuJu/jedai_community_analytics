# discord-platform-jedai

AppKit アプリ: `scripts/06_dashboards` の Lakeview SQL / 指標と `scripts/05_models` の few-shot + `ai_query` フローをまとめたものです。

## 開発

```bash
cd apps/discord-platform-jedai
npm install
# .env に DATABRICKS_HOST, DATABRICKS_TOKEN（または CLI プロファイル）, DATABRICKS_WAREHOUSE_ID
npm run dev
```

SQL 型生成（Warehouse に接続できる環境で）:

```bash
npm run typegen
```

ビルド:

```bash
npm run build
npm start
```

## Databricks 内完結デプロイ（Repos 推奨）

```bash
# 1) Databricks Repos で本リポジトリをクローン
#    例: /Workspace/Repos/<your_user>/<your_repo>
#
# 2) source-code-path は必ず apps ディレクトリを指す
databricks apps validate --profile <PROFILE>
databricks apps deploy discord-platform-jedai \
  --source-code-path /Workspace/Repos/<your_user>/<your_repo>/apps/discord-platform-jedai \
  --profile <PROFILE>
```

### ポイント

- この運用では `databricks sync` は不要です（Workspace への反映は Repos の Git 更新で管理）。
- `source-code-path` はリポジトリのルートではなく、`apps/discord-platform-jedai` まで含めて指定してください。
- 反映されない場合は、まず Repos 側が最新コミットに更新されているか確認してください。

## 付録: 権限（アプリ実行プリンシパル）

アプリ表示名に対応するサービスプリンシパル（例: `access app-…`）へ以下を付与します。

1. **Unity Catalog**: カタログ `kazuki_jedai` のスキーマ `gold` 上の参照テーブルに対する **SELECT**（または従来の適切な権限）。
2. **SQL Warehouse**: アプリにバインドしたウェアハウスへの **CAN USE**。
3. **Foundation Model エンドポイント**（`FOUNDATION_MODEL_ENDPOINT`）: **`ai_query`** 用の **CAN QUERY**。

任意: イベント文脈をサーバのみで渡す場合は `app.yaml` の `env` に `EVENT_CONTEXT_FOR_REQUEST` を追加してください。
