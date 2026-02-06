# ダッシュボードスクリプト一覧

`scripts/06_dashboards/`フォルダ内の各スクリプトの役割と実行順序を説明します。

**場所**: `scripts/06_dashboards/`

## 採番ルール

- **00-09**: ビュー作成系（ビューの作成・削除）
- **20-29**: ダッシュボード用クエリ提供系（ダッシュボードで使用するクエリ）
- **80-89**: メンテナンス系（定期実行・リフレッシュ・オーケストレーション）

## スクリプト一覧と役割

### 00_drop_existing_views.sql
**役割**: 既存のダッシュボード用ビューを削除  
**用途**: ビューを再作成する前に、既存のビュー（通常ビューとマテリアライズドビューの両方）を削除  
**実行タイミング**: ビュー作成前のクリーンアップ  
**削除対象**:
- 売上最大化ダッシュボード用ビュー
- マイアクションダッシュボード用ビュー
- A/Bテスト結果ダッシュボード用ビュー
- データ品質ダッシュボード用ビュー

---

### 01_create_dashboard_views.sql
**役割**: すべてのダッシュボード用マテリアライズドビューを作成  
**用途**: ダッシュボードで使用するビューを一括作成  
**実行タイミング**: 初回セットアップ時、またはビュー定義変更時  
**作成するビュー**:
- **セクション1**: 売上最大化ダッシュボード用ビュー
  - `priority_prospects`（優先度の高い見込み顧客）
  - `priority_existing_customers`（優先度の高い既存顧客）
  - `priority_regions`（優先度の高い地域）
  - `priority_industries`（優先度の高い業種）
  - `sales_rep_upsell_recommendations`（営業担当者別アップセル推奨）
  - `monthly_revenue_forecast`（月別売上予測）
  - `quarterly_revenue_forecast`（四半期別売上予測）
  - `annual_revenue_forecast`（年別売上予測）
- **セクション2**: マイアクションダッシュボード用ビュー
  - `gold_sales_rep_recommended_actions`（営業担当者別推奨アクション）
  - `sales_rep_risk_summary`（営業担当者別リスクサマリー）
- **セクション3**: 売上予測ビュー（設計書準拠版）
- **セクション4**: A/Bテスト結果ダッシュボード用ビュー
  - `ab_test_summary`（A/Bテスト結果サマリー）
  - `ab_test_daily_trend`（A/Bテスト日次推移）
  - `ab_test_by_product`（商品別A/Bテスト結果）
  - `ab_test_by_customer_segment`（顧客セグメント別A/Bテスト結果）
  - `ab_test_by_recommendation_score`（推奨スコア別A/Bテスト結果）
  - `ab_test_results_detail`（A/Bテスト結果詳細）
- **セクション5**: データ品質・Quarantine監視用ビュー
  - `data_quality_summary`（データ品質サマリー）
  - `quarantine_reason_summary`（Quarantine理由別サマリー）
  - `quarantine_samples`（Quarantineサンプル一覧）

---

### 20_sales_maximization_dashboard.sql
**役割**: 売上最大化ダッシュボード用のクエリを提供  
**用途**: Databricks SQL Editorで実行し、各クエリの結果をビジュアライゼーションとして設定  
**実行タイミング**: ダッシュボード作成時、またはクエリ更新時  
**提供するクエリ**:
- 月別売上予測（折れ線グラフ）
- 四半期別売上予測（折れ線グラフ）
- 年別売上予測（折れ線グラフ）
- 優先度の高い見込み顧客（テーブル）
- 優先度の高い既存顧客（テーブル）
- 地域別優先度（棒グラフ）
- 業種別優先度（棒グラフ）
- 営業担当者別アップセル推奨（テーブル）

---

### 21_my_action_dashboard.sql
**役割**: マイアクションダッシュボード用のクエリを提供  
**用途**: Databricks SQL Editorで実行し、各クエリの結果をビジュアライゼーションとして設定  
**実行タイミング**: ダッシュボード作成時、またはクエリ更新時  
**提供するクエリ**:
- 営業担当者別リスクサマリー（棒グラフ）
- 営業担当者別推奨アクション（テーブル）
- リスクレベルの分布（円グラフ）
- アクションタイプ別の推奨数（棒グラフ）

---

### 22_ab_test_results_dashboard.sql
**役割**: A/Bテスト結果ダッシュボード用のクエリを提供  
**用途**: Databricks SQL Editorで実行し、各クエリの結果をビジュアライゼーションとして設定  
**実行タイミング**: ダッシュボード作成時、またはクエリ更新時  
**前提条件**: `01_create_dashboard_views.sql`のセクション4で作成されたビューが存在すること  
**提供するクエリ**:
- A/Bテスト結果サマリー（カード/テーブル）
- A/Bテスト日次推移（折れ線グラフ）
- 商品別A/Bテスト結果（棒グラフ）
- 顧客セグメント別A/Bテスト結果（棒グラフ）
- 推奨スコア別A/Bテスト結果（棒グラフ）
- A/Bテスト結果詳細（テーブル）

---

### 23_data_quality_dashboard.sql
**役割**: データ品質・Quarantine監視ダッシュボード用のクエリを提供  
**用途**: Databricks SQL Editorで実行し、各クエリの結果をビジュアライゼーションとして設定  
**実行タイミング**: ダッシュボード作成時、またはクエリ更新時  
**前提条件**: `01_create_dashboard_views.sql`のセクション5で作成されたビューが存在すること  
**提供するクエリ**:
- オブジェクト別データ品質サマリー（テーブル）
- オブジェクト別 Pass rate と Quarantine率（棒グラフ）
- Quarantine理由別件数（円グラフ）
- Quarantineサンプル一覧（テーブル）
- Quarantine率が閾値を超えるオブジェクトの検出（カード/テーブル）

---

### 24_data_quality_timeseries_dashboard.sql
**役割**: データ品質時系列ダッシュボード用のクエリを提供  
**用途**: Databricks SQL Editorで実行し、各クエリの結果をビジュアライゼーションとして設定  
**実行タイミング**: ダッシュボード作成時、またはクエリ更新時  
**前提条件**: 
- `sf_poc.gold.data_quality_timeseries`テーブルが作成されていること
- 定期的に`scripts/05_models/40_collect_data_quality_metrics.py`を実行してデータを蓄積  
**提供するクエリ**:
- オブジェクト別Quarantine率の時系列推移（折れ線グラフ）
- 全体のQuarantine率推移（折れ線グラフ）
- オブジェクト別Pass rateの時系列推移（折れ線グラフ）
- 最新のデータ品質サマリー（テーブル）
- Quarantine率の変化率（棒グラフ）
- オブジェクト別Quarantineレコード数の時系列推移（積み上げ棒グラフ）

---

### 80_dashboard_update.py
**役割**: ダッシュボード更新（マテリアライズドビューのリフレッシュ）  
**用途**: すべてのマテリアライズドビューをリフレッシュしてダッシュボードのデータを最新化  
**実行タイミング**: 
- Databricks Workflowsで定期実行（推奨）
- データ更新後
- ダッシュボード表示前に手動実行  
**処理内容**:
- 売上最大化ダッシュボード用マテリアライズドビュー（7個）をリフレッシュ
- マイアクションダッシュボード用マテリアライズドビュー（2個）をリフレッシュ
- A/Bテスト結果ダッシュボード用マテリアライズドビュー（6個）をリフレッシュ
- エラーハンドリングとログ出力

---

### 09_create_quarantine_details_view.sql
**役割**: Quarantine詳細ビュー（`quarantine_details`）を作成  
**用途**: データ修正アクション用の基本情報を提供するビューを作成  
**実行タイミング**: 初回セットアップ時、またはビュー定義変更時  
**作成するビュー**:
- `quarantine_details`（Quarantine詳細ビュー）
  - 全オブジェクトで共通のカラム構造
  - IDでレコードを特定可能
  - `quarantine_reason`から対象カラム名を判別可能
  - 詳細情報が必要な場合は、元のQuarantineテーブルとJOIN

---

## 実行順序

### 初回セットアップ時
1. `00_drop_existing_views.sql` - 既存ビューを削除
2. `01_create_dashboard_views.sql` - 主要なビューを作成
3. `09_create_quarantine_details_view.sql` - Quarantine詳細ビューを作成
4. `20-24` - ダッシュボード用クエリを実行してビジュアライゼーションを設定

### 定期実行（Workflows）
1. `80_dashboard_update.py` - マテリアライズドビューをリフレッシュ

### データ更新後
1. `80_dashboard_update.py` - マテリアライズドビューをリフレッシュ

---

## ファイルタイプ別の分類

### SQLスクリプト（ビュー作成）
- `00_drop_existing_views.sql` - 削除
- `01_create_dashboard_views.sql` - 主要ビュー作成
- `09_create_quarantine_details_view.sql` - 追加ビュー作成

### SQLスクリプト（クエリ提供）
- `20_sales_maximization_dashboard.sql` - 売上最大化ダッシュボード用クエリ
- `21_my_action_dashboard.sql` - マイアクションダッシュボード用クエリ
- `22_ab_test_results_dashboard.sql` - A/Bテスト結果ダッシュボード用クエリ
- `23_data_quality_dashboard.sql` - データ品質ダッシュボード用クエリ
- `24_data_quality_timeseries_dashboard.sql` - データ品質時系列ダッシュボード用クエリ

### Python Notebook（メンテナンス）
- `80_dashboard_update.py` - マテリアライズドビューリフレッシュ

---

## 注意事項

1. **実行順序**: `00` → `01` → `09` の順で実行すること
2. **前提条件**: `20-24`は`01`で作成されたビューが存在する必要がある
3. **定期実行**: `81`または`80`をWorkflowsで定期実行することを推奨
4. **権限**: 各スクリプト実行には適切な権限が必要

