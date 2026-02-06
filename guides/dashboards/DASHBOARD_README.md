# ダッシュボードスクリプト

このディレクトリには、Databricks SQL Editorでダッシュボードを作成するためのスクリプトが含まれています。

## ファイル構成

### 00_drop_existing_views.sql
**目的**: 既存のビューを削除（マテリアライズドビューに移行する前に実行）

**実行方法**: Databricks SQL Editorで実行

### 01_create_dashboard_views.sql
**目的**: ダッシュボード用のマテリアライズドビューとテーブルを作成

**作成するマテリアライズドビュー**:
- **セクション1: 売上最大化ダッシュボード用ビュー**
  - `sf_poc.gold.monthly_revenue_forecast` - 月別売上予測
  - `sf_poc.gold.quarterly_revenue_forecast` - 四半期別売上予測
  - `sf_poc.gold.priority_prospects` - 優先度の高い見込み顧客
  - `sf_poc.gold.priority_existing_customers` - 優先度の高い既存顧客
  - `sf_poc.gold.priority_regions` - 地域別分析
  - `sf_poc.gold.priority_industries` - 業種別分析
- **セクション2: マイアクションダッシュボード用ビュー**
  - `sf_poc.gold.gold_sales_rep_recommended_actions` - 営業担当者別推奨アクション
  - `sf_poc.gold.sales_rep_risk_summary` - 営業担当者別リスクサマリー
- **セクション3: 売上予測ビュー（設計書準拠版）**
  - `sf_poc.gold.monthly_revenue_forecast` - 月次売上予測（確度ベース、ターゲット比較含む）
  - `sf_poc.gold.quarterly_revenue_forecast` - 四半期別売上予測（確度別集計含む）
  - `sf_poc.gold.annual_revenue_forecast` - 年度別売上予測（H1実績 + H2予測）
- **セクション4: A/Bテスト結果ダッシュボード用ビュー**
  - `sf_poc.gold.ab_test_summary` - テスト別サマリー
  - `sf_poc.gold.ab_test_daily_trend` - 日別推移
  - `sf_poc.gold.ab_test_by_product` - 商品別結果
  - `sf_poc.gold.ab_test_by_customer_segment` - 顧客セグメント別結果
  - `sf_poc.gold.ab_test_by_recommendation_score` - 推奨スコア別結果
  - `sf_poc.gold.ab_test_results_detail` - 詳細結果（全情報）

- **セクション5: データ品質・Quarantine監視ダッシュボード用ビュー**
  - `sf_poc.gold.data_quality_summary` - オブジェクト別データ品質サマリー  
    （total_records / passed_records / quarantine_records / pass_rate / quarantine_rate）
  - `sf_poc.gold.quarantine_reason_summary` - オブジェクト別 × Quarantine理由別件数サマリー
  - `sf_poc.gold.quarantine_samples` - Quarantine対象レコードのサンプル一覧

**実行方法**: Databricks SQL Editorで実行

**リフレッシュ方法**:
- マテリアライズドビューは自動リフレッシュされません
- `05_refresh_materialized_views.sql` を実行して手動でリフレッシュ
- Databricks Workflowsでスケジュール実行することを推奨

**推奨リフレッシュ頻度**:
- `monthly_revenue_forecast`, `quarterly_revenue_forecast`, `annual_revenue_forecast`, `priority_regions`, `priority_industries`: 毎日1回（例: 毎日0時）
- `priority_prospects`, `priority_existing_customers`: 6時間ごと
- `gold_sales_rep_recommended_actions`, `sales_rep_risk_summary`: 4時間ごと
- A/Bテスト結果ビュー（`ab_test_*`）: 6時間ごと、またはA/Bテスト評価スクリプト実行後

### 02_sales_maximization_dashboard.sql
**目的**: 売上最大化ダッシュボード用のクエリ（8つのクエリ）

**含まれるクエリ**:
1. 月別売上予測（折れ線グラフ）
2. 四半期別売上予測（積み上げ棒グラフ）
3. 優先度の高い見込み顧客トップ20（テーブル）
4. 業種別予測売上（円グラフ）
5. 地域別予測売上（棒グラフ）
6. 優先度の高い既存顧客（テーブル）
7. リスクレベル別商談数（棒グラフ）
8. ステージ別予測売上（積み上げ棒グラフ）

**実行方法**: Databricks SQL Editorで各クエリを実行し、ビジュアライゼーションを設定

### 03_my_action_dashboard.sql
**目的**: マイアクションダッシュボード用のクエリ（7つのクエリ）

**実行方法**: Databricks SQL Editorで各クエリを実行し、ビジュアライゼーションを設定

### 04_ab_test_results_dashboard.sql
**目的**: A/Bテスト結果ダッシュボード用のクエリ（10つのクエリ）

**含まれるクエリ**:
1. A/Bテスト結果サマリー（カード/テーブル）
2. Treatment vs Control 成約率比較（棒グラフ）
3. 成約率リフト（バブルチャート/棒グラフ）
4. 日別A/Bテスト結果推移（折れ線グラフ）
5. 商品別A/Bテスト結果（テーブル/棒グラフ）
6. 顧客セグメント別A/Bテスト結果（円グラフ/棒グラフ）
7. 推奨スコア別成約率（棒グラフ）
8. A/Bテスト結果詳細テーブル
9. テスト別比較（複数テストの比較）
10. 統計的有意性チェック（カイ二乗検定用データ）

**実行方法**: Databricks SQL Editorで各クエリを実行し、ビジュアライゼーションを設定

**前提条件**:
- `01_create_dashboard_views.sql` を実行してマテリアライズドビューを作成済み（セクション4: A/Bテスト結果ダッシュボード用ビュー）
- A/Bテスト結果テーブル（`sf_poc.gold.upsell_crosssell_ab_test_results`）にデータが存在

### 07_data_quality_dashboard.sql
**目的**: データ品質・Quarantine監視ダッシュボード用のクエリ

**含まれるクエリ（例）**:
1. オブジェクト別データ品質サマリー（Pass rate / Quarantine率、テーブル）
2. オブジェクト別 Pass rate vs Quarantine率（棒グラフ）
3. Quarantine理由別件数（円グラフ）
4. Quarantineサンプル一覧（修正対象レコードリスト、テーブル）
5. Quarantine率が閾値を超えるオブジェクトの一覧（テーブル / KPI）

**前提条件**:
- `01_create_dashboard_views.sql` を実行して、セクション5のデータ品質ビューを作成済み

### 05_refresh_materialized_views.sql
**目的**: すべてのマテリアライズドビューをリフレッシュ

**実行方法**: 
- Databricks SQL Editorで手動実行
- Databricks Workflowsでスケジュール実行（推奨）

**推奨スケジュール**: 4時間ごと、または必要に応じて実行

**注意事項**:
- A/Bテスト結果ビュー（`ab_test_summary` など）は `01_create_dashboard_views.sql` のセクション4で作成されます
- A/Bテストを実施していない場合は、スクリプト内のA/Bテスト関連のREFRESH文はコメントアウトされています
- A/Bテストビューを作成した後は、コメントを外してリフレッシュに含めてください

### 06_dashboard_update.py
**目的**: ダッシュボード更新用のPythonスクリプト（将来の拡張用）

**実行方法**: Databricks Notebook または Job として実行

### ./DASHBOARD_CREATION_GUIDE.md
**目的**: ダッシュボード作成の詳細な手順ガイド

**内容**:
- 前提条件
- ダッシュボード作成手順
- ビジュアライゼーション設定方法
- ダッシュボードのカスタマイズ
- トラブルシューティング

### MATERIALIZED_VIEW_SETUP_GUIDE.md
**目的**: マテリアライズドビュー設定の詳細ガイド

**内容**:
- SQL ServerlessまたはPro warehouseの設定方法
- マテリアライズドビューの作成手順
- Databricks Workflowsでのリフレッシュスケジュール設定
- トラブルシューティング
- コスト最適化のヒント

**重要**: マテリアライズドビューを使用する場合は、**必ずこのガイドを参照してください**。

### DASHBOARD_LINEAGE_AND_IMPROVEMENT_GUIDE.md
**目的**: ダッシュボードのリネージと改善を統合した完全ガイド（ストーリー仕立て）

**内容**:
- **ストーリー仕立て**で各ダッシュボードクエリを説明：「現状の構造 → データの流れと問題 → 改善方法 → 効果」
- 売上最大化ダッシュボード（Q1, Q2, Q3, Q4, Q5, Q6, Q9）とマイアクションダッシュボード（Q1-Q8）の全クエリをカバー
- 各クエリについて：
  - 📐 **現状の構造（リネージ）**: データフローと依存関係
  - 📊 **データの流れと現状の問題**: なぜ問題が起きているか
  - 🔧 **改善方法**: 具体的な改善施策
  - ✅ **改善後の効果**: ビジュアライゼーションの変化
- 改善施策の優先順位と実装チェックリストを含む
- 対象: 売上最大化ダッシュボード（Q1, Q2, Q3, Q4, Q5, Q6, Q9）、マイアクションダッシュボード（Q1〜Q8）
- 改善施策の優先順位・効果測定方法・実装チェックリスト

**用途**:
- データフローと影響範囲の把握
- ダッシュボードの精度向上施策の設計・実行
- データ品質改善の効果検証

## 実行順序

### マテリアライズドビューを使用する場合

**重要**: マテリアライズドビューを使用するには、Databricks SQL ServerlessまたはPro warehouseが必要です。
詳細は `MATERIALIZED_VIEW_SETUP_GUIDE.md` を参照してください。

1. **MATERIALIZED_VIEW_SETUP_GUIDE.md** を参照してSQL ServerlessまたはPro warehouseを設定
2. **00_drop_existing_views.sql** を実行して既存のビューを削除（初回のみ）
3. **01_create_dashboard_views.sql** を実行してすべてのマテリアライズドビューを作成（SQL ServerlessまたはPro warehouseで実行）
   - セクション1: 売上最大化ダッシュボード用ビュー
   - セクション2: マイアクションダッシュボード用ビュー
   - セクション3: 売上予測ビュー（設計書準拠版）
   - セクション4: A/Bテスト結果ダッシュボード用ビュー
4. **02_sales_maximization_dashboard.sql** のクエリを実行して売上最大化ダッシュボードを作成
5. **03_my_action_dashboard.sql** のクエリを実行してマイアクションダッシュボードを作成
6. **04_ab_test_results_dashboard.sql** のクエリを実行してA/Bテスト結果ダッシュボードを作成
7. **07_data_quality_dashboard.sql** のクエリを実行してデータ品質・Quarantine監視ダッシュボードを作成
8. **05_refresh_materialized_views.sql** をDatabricks Workflowsでスケジュール実行（推奨）

### 通常のビューを使用する場合

SQL ServerlessまたはPro warehouseが利用できない場合は、`01_create_dashboard_views.sql`を通常のビュー（`CREATE VIEW`）に変更して使用できます。
この場合、リフレッシュは不要です（実行時に最新データを取得します）。

## 注意事項

### マテリアライズドビューを使用する場合

- **重要**: Databricks SQL ServerlessまたはPro warehouseが必要です。一般のcomputeでは作成できません
- マテリアライズドビュー作成前に、Bronze、Silver、Gold層のデータが準備されている必要があります
- モデル推論（`05_models`）が実行されている必要があります
- マテリアライズドビューは自動リフレッシュされません。`05_refresh_materialized_views.sql`を実行してリフレッシュしてください
- Databricks Workflowsでスケジュール実行することを推奨します
- 個別にリフレッシュする場合: `REFRESH MATERIALIZED VIEW sf_poc.gold.view_name;`
- 詳細は `MATERIALIZED_VIEW_SETUP_GUIDE.md` を参照してください

### 通常のビューを使用する場合

- ビュー作成前に、Bronze、Silver、Gold層のデータが準備されている必要があります
- モデル推論（`05_models`）が実行されている必要があります
- 通常のビューは実行時に最新データを取得するため、リフレッシュは不要です
- パフォーマンスが必要な場合は、マテリアライズドビューの使用を検討してください

### 共通事項

- 各クエリの実行後、ビジュアライゼーションを設定してダッシュボードに追加してください

## 関連ファイル

- `06_dashboard_update.py` - ダッシュボード更新用のPythonスクリプト（将来の拡張用）

