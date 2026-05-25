# discord-platform-jedai

AppKit アプリ: `scripts/06_dashboards` の Lakeview SQL / 指標と `scripts/05_models` の few-shot + `ai_query` フローをまとめたものです。

## 開発

```bash
cd apps/discord-platform-jedai
npm install
cp .env.example .env
# .env を開き DATABRICKS_HOST / DATABRICKS_TOKEN / DATABRICKS_WAREHOUSE_ID を設定
# Notebook Job 実行も使う場合は DATABRICKS_NOTEBOOK_JOB_ID も設定
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
- **注意**: `/Workspace/Users/.../discord-platform-jedai-deploy` は Repos と自動同期されません。Git 更新後は必ず Repos パス（上記）から `apps deploy` してください。

## 付録: 権限（アプリ実行プリンシパル）

アプリ表示名に対応するサービスプリンシパル（例: `access app-…`）へ以下を付与します。

1. **Unity Catalog**: カタログ `kazuki_jedai` のスキーマ `gold` 上の参照テーブルに対する **SELECT**（または従来の適切な権限）。
2. **SQL Warehouse**: アプリにバインドしたウェアハウスへの **CAN USE**。
3. **Foundation Model エンドポイント**（`FOUNDATION_MODEL_ENDPOINT`）: **`ai_query`** 用の **CAN QUERY**。

任意: イベント文脈をサーバのみで渡す場合は `app.yaml` の `env` に `EVENT_CONTEXT_FOR_REQUEST` を追加してください。

### Genie（自然言語クエリ）

- `DATABRICKS_GENIE_SPACE_ID` に AI/BI Genie Space の ID を設定すると、**Genie** タブで自然言語チャットとクエリ結果の可視化が利用できます。
- Space ID は Databricks の Genie Space 画面 → **About** タブで確認できます。
- **Genie を動かすには2つセットで必要**（どちらか欠けるとチャット未設定 or `Invalid scope: genie`）:
  1. **Genie Space リソース**（`app.yaml` の `valueFrom: genie-space`）— Space ID を `DATABRICKS_GENIE_SPACE_ID` に注入し、アプリ SP に Space 権限を付与
  2. **User authorization スコープ** `dashboards.genie`（表示名 `genie`）— ユーザー OAuth 経路用。UI は `/api/genie-sp`（SP）を優先するが、リソース未登録だと Space ID が空になる
- 初回・リソース追加後は次を実行:
  ```bash
  databricks apps update discord-platform-jedai \
    --profile apps-deploy \
    --json @scripts/app-update-genie.json
  databricks apps deploy discord-platform-jedai \
    --source-code-path /Workspace/Repos/cheng.wang@myteam.com/jedai_pj/apps/discord-platform-jedai \
    --profile apps-deploy
  ```
- スコープ追加後はユーザーが **シークレットで再ログイン**（古い同意トークンは `genie` スコープなしのまま）
- スコープ追加後は、**アプリを再デプロイ**し、ブラウザで **再ログイン**（またはシークレットウィンドウ）してユーザー同意を取り直してください。
- アプリ実行プリンシパルと、利用ユーザー双方に、対象 Genie Space への **CAN RUN** 以上の権限が必要です。
- 未設定の場合は Genie タブに設定手順のみ表示されます（ダッシュボードの既存ウィジェットはそのまま利用可能）。

### 告知文スタイルの動作確認

スタイル（雰囲気・長さ・文体など）は `POST /api/announcement/generate` の JSON として送られ、サーバー側でプロンプトの `[Hyperparameter Definitions — この生成の指定値]` に埋め込まれます。生成プレビューには **適用スタイル** として同じ内容が表示されます。

**スタイルだけ変えて差を確認する手順:**

1. 「AIへの依頼」から文体・長さ・構成の記述を除き、**イベントの事実だけ** を書く（例: 「来週土曜21時の練習会告知。参加はこの投稿へのリアクション。」）
2. 上の「告知文のスタイル」だけを変更する（例: 雰囲気「カジュアル」→「真面目」、長さ「標準」→「長め」）
3. 2回生成し、トーン・文量・絵文字・構成の差を比較する

依頼文に「カジュアルで」「短めに」などと書いたままスタイルボタンだけ変えると、モデルが依頼文側を優先しやすく、**出力がほとんど変わらない**ことがあります。スタイルはフォームのボタンで指定し、依頼文は日時・内容・参加方法などに絞るのが推奨です。

プロンプトは `[Hyperparameter Definitions — この生成の指定値]` を few-shot 例より**前**に置き、Output instruction で絵文字数などを厳守するよう指示します（`server/build_prompt.ts` / `server/static_prompt_core.ts`）。**コード変更後は App の再デプロイが必要**です。

**再デプロイ後の確認マトリクス（依頼文は事実のみの短文で固定）:**

| 変更 | 依頼文（例） | 期待 |
|------|----------------|------|
| 絵文字のみ なし ↔ 多め | 来週土曜21時の練習会告知。参加はリアクション。 | なし: 絵文字 0 / 多め: 6 個以上 |
| 雰囲気のみ 真面目 ↔ おふざけ | 同上 | 文体が明確に異なる |
| なし + 真面目 | 同上 | 絵文字 0 かつ丁寧・真面目な文体 |

プロンプトへのスタイル埋め込みは `npm run test:unit` で検証できます（`server/build_prompt.test.ts`）。

### Notebook Job 実行（Apps から）

- `app.yaml` または `.env` に `DATABRICKS_NOTEBOOK_JOB_ID=<job_id>` を設定します。
- 告知ジェネレータタブ内の **Notebook Job を実行** ボタンから、Jobs API の `runNow` を呼び出して完了まで待機します。
- 実行後、`run_id` と `run page URL` が画面に表示されます。
