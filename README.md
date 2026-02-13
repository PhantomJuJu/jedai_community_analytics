# Discord コミュニティ活動可視化プラットフォーム

> Phase 1：Discord コミュニティの活動データを Databricks で収集・蓄積・可視化するプロジェクト

[![プロジェクト状況](https://img.shields.io/badge/status-active-green)]()
[![プラットフォーム](https://img.shields.io/badge/platform-Databricks-orange)]()
[![データソース](https://img.shields.io/badge/source-Discord%20API-blue)]()
[![Python](https://img.shields.io/badge/python-3.9+-blue)]()

---

## 概要

本プロジェクトは、Discord コミュニティの活動データを収集・蓄積・可視化するプラットフォームを構築する。

Discord API と Databricks Lakehouse を連携させ、活動データの継続的な取得・集計・可視化を実現する。  
Phase 1 の目的は、活動傾向を「見える化」し、コミュニティ運営の意思決定を**データに基づいて**行えるようにすることである。

本リポジトリは**データ基盤と可視化**に焦点を当てており、自動化や AI による意思決定支援は Phase 1 のスコープ外である。

---

## 要件定義との関係

- **要件定義書**：[要件定義.md](要件定義.md) に、プロジェクトの目的・背景・As-Is/To-Be・スコープ・ゴール・成功基準・成果物を定義している。
- **本 README**：要件定義の要約と、**再現手順・設計意図・開発者向けセットアップ**を記載する。スコープ・ゴール・成果物は要件定義に準拠し、変更時は要件定義と同期する。
- **同期の考え方**：ゴール・成功基準・スコープ・成果物（Definition of Done）は要件定義を正とする。README の「本プロジェクトで作るもの」「スコープ」「プロジェクトサマリ」は要件定義の該当セクションと整合させる。

---

## 本プロジェクトで作るもの

### コミュニティ施策のサイクル（4段階）

本プロジェクトでは、コミュニティ施策を次の **4 段階** に分解して課題整理と To-Be 設計を行っている。

1. **現状把握**（Current State Grasp）— コミュニティの状態を客観的に観測し、変化を検知する  
2. **設計**（Design）— データと仮説に基づき、優先順位と施策設計を行う  
3. **実行**（Execution）— 設計された施策を再現性をもって実行する  
4. **検証・改善**（Validate & Improve）— 施策の実行結果を定量的に検証し、得られた学習を次の設計に反映させる  

課題には前段階との依存関係があるため、**現状把握 → 設計 → 実行 → 検証・改善** の順で段階的に解決する。

### Phase 1（今回のスコープ）：現状把握の基盤整備

**やること**

- Discord API で活動データを取得し、Databricks に継続蓄積する  
- 活動傾向（曜日・時間帯等）の集計ロジックを実装する  
- ダッシュボードで全体アクティビティ・時系列・傾向を可視化する  
- 再現手順・設計意図を本 README 等に記載する  

**成果物（Definition of Done）**

- **GitHub**：データ取り込みアプリケーションのソースコード、README（アーキテクチャ・実行手順・設計判断）  
- **Databricks**：活動ログテーブル、集計ノートブックまたは SQL、ダッシュボード  

### Phase 2・3（今後）

- **Phase 2**：設計のデータ駆動化（施策効果が高そうな日時の予測・レコメンド、データ・仮説に基づくイベント設計など）  
- **Phase 3**：実行の再現性と最適化（告知・クリエイティブのテンプレート化、LLM/RAG、告知タイミング・対象の最適化）  
- **検証・改善**：RAG による自動検証、Action Item Recommendation のような次アクションのレコメンド  

詳細は [要件定義.md](要件定義.md) の「2. As-Is / To-Be」「3. ゴールと成功基準」「4. スコープ定義」を参照。

---

## 目次

- [クイックスタート](#クイックスタート)
- [プロジェクト構成](#プロジェクト構成)
- [ダッシュボード](#ダッシュボード)
- [開発・標準](#開発標準)
- [ロードマップ](#ロードマップ)
- [ドキュメント](#ドキュメント)
- [開発環境セットアップ](#開発環境セットアップ)
- [貢献](#貢献)
- [トラブルシューティング](#トラブルシューティング)
- [プロジェクトサマリ](#プロジェクトサマリ)
- [連絡先](#連絡先)

---

## クイックスタート

### 開発者向け

1. **リポジトリのクローン**
   ```bash
   git clone <リポジトリURL>
   cd jedai_pj
   ```

2. **Databricks 環境の準備**
   - [環境設定ガイド](guides/implementation/ENVIRONMENT_CONFIGURATION.md) に従う
   - Databricks ワークスペースで Unity Catalog が有効であることを確認する

3. **セットアップスクリプトの実行**
   ```bash
   # 順番に実行
   scripts/01_setup/     # 環境構築（カタログ、スキーマ、ロール、メタデータテーブル）
   scripts/02_bronze/    # Bronze 層取り込み（Discord API → Delta）
   scripts/03_silver/    # Silver 層クレンジング
   scripts/04_gold/      # Gold 層特徴量エンジニアリング
   scripts/06_dashboards/ # ダッシュボード用ビュー・クエリ
   ```

4. **ドキュメントの確認**
   - [実装ガイド](guides/implementation/README.md) でセットアップの詳細を確認
   - [標準](standards/00-core/README.md) でコーディング規約を確認

### ステークホルダー向け

ビジネス背景・目的・スコープは下記 [プロジェクトサマリ](#プロジェクトサマリ) および [要件定義.md](要件定義.md) を参照。

---

## 前提条件

### 必須

- **Databricks ワークスペース**（Unity Catalog 有効）
- **Python 3.9+**（ローカル開発用）
- **Databricks CLI** の設定
- **Git**（バージョン管理）

### 推奨

- **Databricks Runtime** 13.3 LTS 以降
- **Discord API アクセス**（活動データ取得用のアプリケーション／ボットトークン）
- **知識**：PySpark / Spark SQL、Delta Live Tables（DLT）、REST API 連携

### 環境変数

以下を設定する（[環境設定ガイド](guides/implementation/ENVIRONMENT_CONFIGURATION.md) 参照）。

- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`
- Discord API の認証情報は Databricks Secrets で管理（ソースコードにハードコードしない）

---

## プロジェクト構成

```
jedai_pj/
├── .cursorrules/              # Cursor プロジェクトルール
├── data/                       # データファイル
│   ├── raw/                    # 生データ
│   └── reference/             # 参照データ
├── scripts/                    # 実装スクリプト
│   ├── 01_setup/               # 環境構築（カタログ、スキーマ、ロール、メタデータテーブル）
│   ├── 02_bronze/              # Bronze 層取り込み（Discord API → Delta）
│   ├── 03_silver/              # Silver 層クレンジング
│   │   ├── common/             # 共通ユーティリティ（検疫、SCD Type 2）
│   │   ├── dlt/                # DLT スクリプト
│   │   └── legacy/             # レガシースクリプト
│   ├── 04_gold/                # Gold 層特徴量エンジニアリング
│   ├── 05_models/              # ML モデル推論
│   ├── 06_dashboards/          # ダッシュボード用ビュー・クエリ
│   │   ├── 00-09/              # ビュー作成
│   │   ├── 20-29/              # ダッシュボードクエリ提供
│   │   └── 80-89/              # 保守
│   ├── 07_workflows/           # Databricks Workflows 定義
│   └── 08_maintenance/         # 保守（OPTIMIZE、VACUUM）
├── standards/                  # 標準・ガイドライン
├── guides/                     # 実装ガイド
├── solutions/                  # ソリューション設計ドキュメント
├── dashboard/                  # ダッシュボード定義ファイル（.lvdash.json）
├── 要件定義.md                 # プロジェクト要件定義（スコープ・ゴール・成果物の正）
└── README.md
```

パイプラインの流れと実行順序の詳細は [プロジェクト構成テンプレート](standards/00-core/PROJECT_STRUCTURE_TEMPLATE.md) を参照。

---

## ダッシュボード

Phase 1 のダッシュボードは、**時間軸での活動パターン**に焦点を当てる。

**例となるビュー**

- **曜日×時間帯ごとの活動量** — メッセージ数や参加数などの時系列
- **異なる時間窓での比較** — スケジュール判断のためのトレンド・パターン

ダッシュボードは探索・説明を支援するもので、自動意思決定は Phase 1 のスコープ外である。  
実装の詳細は [ダッシュボード作成ガイド](guides/dashboards/DASHBOARD_CREATION_GUIDE.md) を参照。

---

## 開発・標準

本プロジェクトは **Databricks Solution Standard Guideline** および `.cursorrules/` のプロジェクトルールに従う。

- **データ変換**はメダリオン構成（Bronze → Silver → Gold）に従う
- **スクリプト・ノートブック**には説明コメントを含める（[コメント標準](standards/01-language/CODE_COMMENTING_STANDARD.md)）
- **シークレット**（トークン、キー）はソースコード外で管理（Databricks Secrets）
- Phase 1 では**再現性**を性能最適化より優先する

### 主な標準

- **命名**：[myteam 命名規則](standards/00-core/myteam_Naming_Conventions.md)
- **コメント**：[コメント標準](standards/01-language/CODE_COMMENTING_STANDARD.md)
- **エラー**：[エラーハンドリング](standards/03-patterns/ERROR_HANDLING_STANDARD.md)
- **パターン**：[実装パターン](standards/03-patterns/IMPLEMENTATION_PATTERNS.md)

### アーキテクチャ

- **Bronze**：追加のみ、生データを保持（例：Discord API レスポンス）
- **Silver**：クレンジング、検証、必要に応じて SCD Type 2、DLT を推奨
- **Gold**：集計・特徴量テーブル、必要に応じて `overwriteSchema` で上書き
- **データ品質**：DLT Expectations、不正データは命名規則に従い検疫テーブルへ

---

## ロードマップ

| Phase | 状況 | 焦点 |
|-------|------|------|
| **Phase 1** | 現在 | データ取り込み、集計、ダッシュボード可視化、JEDAI での紹介 |
| **Phase 2** | 計画中 | 設計のデータ駆動化（施策日時予測・レコメンド、データ・仮説に基づくイベント設計、長期指標） |
| **Phase 3** | 計画中 | 実行の再現性と最適化（LLM/RAG、告知タイミング・対象の最適化）、検証・改善（RAG 自動検証、Action Item Recommendation） |

---

## ドキュメント

### 主なドキュメント

#### 標準
- [コア標準](standards/00-core/README.md) — プロジェクト標準の概要
- [命名規則](standards/00-core/myteam_Naming_Conventions.md) — 命名ルール
- [コメント標準](standards/01-language/CODE_COMMENTING_STANDARD.md) — コメント・docstring
- [実装パターン](standards/03-patterns/IMPLEMENTATION_PATTERNS.md) — 共通パターン
- [データエンジニアリングベストプラクティス](standards/02-platform/Data_Engineering_Best_Practices.md) — プラットフォーム・パイプライン

#### 実装ガイド
- [DLT 完全ガイド](guides/implementation/DLT_COMPLETE_GUIDE.md) — DLT パイプライン
- [環境設定](guides/implementation/ENVIRONMENT_CONFIGURATION.md) — 環境構築
- [SCD Type 2](guides/implementation/SCD_TYPE2_THREE_APPROACHES_COMPARISON.md) — SCD Type 2 実装

#### データ・ダッシュボード
- [データモデルガイド](guides/data-model/) — データモデル・スキーマ
- [ダッシュボードガイド](guides/dashboards/DASHBOARD_CREATION_GUIDE.md) — ダッシュボード作成

### クイックリファレンス

| トピック | ドキュメント |
|----------|----------------|
| **はじめに** | [環境設定](guides/implementation/ENVIRONMENT_CONFIGURATION.md) |
| **DLT パイプライン** | [DLT 完全ガイド](guides/implementation/DLT_COMPLETE_GUIDE.md) |
| **命名ルール** | [命名規則](standards/00-core/myteam_Naming_Conventions.md) |
| **コード標準** | [コメント標準](standards/01-language/CODE_COMMENTING_STANDARD.md) |
| **プロジェクト構成** | [プロジェクト構成テンプレート](standards/00-core/PROJECT_STRUCTURE_TEMPLATE.md) |

---

## 開発環境セットアップ

### 1. リポジトリのクローン

```bash
git clone <リポジトリURL>
cd jedai_pj
```

### 2. Databricks の設定

```bash
pip install databricks-cli
databricks configure --token
```

### 3. 環境の準備

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt   # 存在する場合
```

### 4. 環境変数・シークレット

- `DATABRICKS_HOST`、`DATABRICKS_TOKEN`、カタログ・スキーマを必要に応じて設定
- Discord API の認証情報は Databricks Secrets に保存し、リポジトリにコミットしない

### 5. セットアップスクリプトの実行

以下の順で実行する。

```bash
scripts/01_setup/    # カタログ、スキーマ、ロール、メタデータテーブル
scripts/02_bronze/   # Bronze 取り込み（Discord → Delta）
scripts/03_silver/   # Silver クレンジング（DLT またはレガシー）
scripts/04_gold/     # Gold 特徴量エンジニアリング
scripts/06_dashboards/ # ビュー・ダッシュボードクエリ
```

### 6. 動作確認

- Databricks ワークスペースおよび Unity Catalog へのアクセス
- 少なくとも 1 回のパイプライン実行（Bronze → Silver → Gold）
- ダッシュボードが期待どおりに表示されること

---

## 貢献

1. **フィーチャーブランチの作成**
   ```bash
   git checkout -b feature/ブランチ名
   ```

2. **標準に従う** — 命名、コメント、エラーハンドリング、該当する場合はテスト

3. **プルリクエストの提出** — 説明、関連 Issue、テスト通過

### コードレビューチェックリスト

- [ ] プロジェクト標準に従っている
- [ ] 該当する場合にテストを追加・更新している
- [ ] ドキュメントを更新している
- [ ] シークレットをハードコードしていない
- [ ] エラーを適切に処理し、ログを記録している

---

## トラブルシューティング

### Databricks 接続

- `DATABRICKS_HOST` と `DATABRICKS_TOKEN`（またはプロファイル）を確認
- トークンの有効期限を確認し、再認証後にリトライ
- Unity Catalog およびワークスペースの権限を確認

### DLT / パイプラインエラー

- テーブル名の衝突がないか確認、開発時は必要に応じて `_dlt` を使用
- [DLT 完全ガイド](guides/implementation/DLT_COMPLETE_GUIDE.md) と Expectations を確認
- ドロップされた行は検疫テーブルで確認

### スキーマ・書き込みモード

- Bronze/Silver：`mode("append")` と `option("mergeSchema", "true")`
- Gold：フルリフレッシュを想定する場合は `mode("overwrite")` と `option("overwriteSchema", "true")`
- 本番パイプラインでは DROP TABLE + CREATE TABLE を避ける

### Discord API

- トークンと権限（例：Guild Members Intent）を確認
- レート制限とバックオフを考慮、認証情報は Databricks Secrets に保存

---

## プロジェクトサマリ

本セクションは [要件定義.md](要件定義.md) の要約である。スコープ・ゴール・成果物の正式な定義は要件定義を正とする。

### 1. 概要

本プロジェクトは **Discord コミュニティ活動可視化プラットフォーム** の **Phase 1** を実装する。  
Discord サーバーの活動データを Databricks で収集・蓄積・可視化し、コミュニティ運営の意思決定を**経験や直感ではなくデータ**に基づいて行えるようにする（例：曜日・時間帯ごとの傾向）。

**JEDAI** では、ビジネス以外のデータソース（Discord 活動ログ）を対象に Databricks でデータプラットフォーム・可視化パイプラインを構築する実践事例として紹介する。

### 2. 背景と課題

- **文脈**：大学 e スポーツ系 Discord コミュニティ（600名超）、イベントやエンゲージメントの運営に定量サポートが不足
- **ギャップ**：日時の選定など重要な意思決定が経験・直感に依存しており、観察を定量的に記録・検証・共有する仕組みがない
- **目的**：Discord の活動データを取り込み、Databricks に蓄積し、ダッシュボードで現状把握・仮説形成・計画をデータ駆動で行えるようにする

### 3. ゴールと成功基準（Phase 1）

| ゴール | 2025年3月末まで |
|--------|------------------|
| **成果物** | Discord コミュニティの活動傾向を**曜日**・**時間帯**で説明できるダッシュボードを構築する |

**成功基準（Definition of Done）**

- Discord API により活動データを取得できる
- データが Databricks に継続的に蓄積され、再計算可能である
- 活動傾向がダッシュボードで可視化されている
- 可視化されたデータを用いて運営上の知見を説明できる
- README に再現手順および設計意図が記載されている

### 4. As-Is と To-Be（Phase 1）

| 観点 | As-Is | To-Be（Phase 1） |
|------|--------|------------------|
| **現状把握** | 主観的な活動感覚、定量履歴なし | 継続的な収集・蓄積、曜日・時間帯ごとの傾向をダッシュボードで表示 |
| **仮説** | 経験に基づく（例：「週末の方が多い」） | データに基づく仮説、直感とデータの乖離を確認可能 |
| **計画** | 手作業、根拠が定量化されない | 期待参加率等を踏まえた日程・内容の選択 |
| **検証・改善** | 印象ベース | 施策前後の変化・トレンドをデータで把握可能 |

### 5. スコープ（Phase 1）

**スコープ内**

- Discord API 連携による活動データの取得
- Databricks への蓄積（Bronze/Silver/Gold）
- 集計ロジックの実装
- ダッシュボードによる可視化

**スコープ外（Phase 1）**

- イベント日程・内容の自動提案
- チャットボットによるコミュニティ運営
- 予測・最適化アルゴリズム
- 本番レベルの可用性・監視設計
- GitHub と Databricks の完全な CI/CD 連携

### 6. データアーキテクチャ（概念）

| 段階 | 目的 | 方針 |
|------|------|------|
| **Bronze** | Discord API / イベントの生データ | 追加のみ、`mergeSchema` でスキーマ進化 |
| **Silver** | クレンジング・検証済み活動（ユーザー、チャネル、タイムスタンプ等） | 必要に応じて SCD Type 2、DLT 推奨、不正行は検疫 |
| **Gold** | ダッシュボード用集計（曜日、時間帯等） | フルリフレッシュ時は `overwriteSchema` で上書き |

書き込みモードと命名は [標準](standards/00-core/) および [データエンジニアリングベストプラクティス](standards/02-platform/Data_Engineering_Best_Practices.md) に従う。

### 7. チーム構成

| 役割 | 主な責任 |
|------|----------|
| **PM / データエンジニア** | 要件定義、プロジェクト管理、実装 |
| **テックリード** | 技術設計、レビュー、品質保証 |

意思決定：スコープ・優先度は PM、技術方針はテックリード（要件定義 5.2 に準拠）。

---

## 備考

Phase 1 では意図的に**可観測性と説明可能性**に注力する。  
将来の Phase で自動化や AI 支援を検討するが、Phase 1 では信頼できる基盤の構築を優先する。

---

## 連絡先

- **リポジトリ**：[リポジトリ URL を追加]
- **プロジェクト**：jedai_pj — Discord コミュニティ活動可視化プラットフォーム（Phase 1）

---

**作成**：2025  
**最終更新**：2026  
**著者**：jedai_pj チーム
