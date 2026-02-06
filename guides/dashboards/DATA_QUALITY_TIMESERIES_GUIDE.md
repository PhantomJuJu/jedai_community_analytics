# データ品質時系列監視システムガイド

Silver層のQuarantineテーブルのデータを定期的に集計し、時系列でデータの汚さの度合いを可視化するシステムです。

## 概要

このシステムは以下のコンポーネントで構成されています：

1. **時系列集計テーブル**: `sf_poc.gold.data_quality_timeseries`
   - Quarantine率、Pass rateなどのメトリクスを時系列で保存
   
2. **メトリクス収集スクリプト**: `scripts/05_models/40_collect_data_quality_metrics.py`
   - 定期的にQuarantineテーブルを集計して、時系列テーブルに記録
   
3. **時系列ダッシュボード**: `08_data_quality_timeseries_dashboard.sql`
   - 時系列データを可視化するためのSQLクエリ集

## セットアップ手順

### 1. 時系列テーブルの作成

```bash
# Databricks Notebookで実行
scripts/01_setup/06_create_data_quality_timeseries_table.py
```

このスクリプトは以下のテーブルを作成します：
- `sf_poc.gold.data_quality_timeseries`

### 2. メトリクス収集スクリプトの実行

#### 手動実行

```bash
# Databricks Notebookで実行
scripts/05_models/40_collect_data_quality_metrics.py
```

#### ワークフローへの組み込み

`scripts/07_workflows/daily_sync_workflow.json` に以下のタスクを追加：

```json
{
  "task_key": "collect_data_quality_metrics",
  "description": "データ品質メトリクス収集",
  "depends_on": [{"task_key": "silver_cleansing"}],
  "job_cluster_key": "gold_cluster",
  "notebook_task": {
    "notebook_path": "/scripts/05_models/40_collect_data_quality_metrics",
    "base_parameters": {
      "env": "dev",
      "catalog_name": "sf_poc"
    }
  },
  "timeout_seconds": 1800,
  "max_retries": 2
}
```

### 3. ダッシュボードの作成

1. Databricks SQL Editorで `scripts/06_dashboards/08_data_quality_timeseries_dashboard.sql` を開く
2. 各クエリを個別のクエリタブで実行
3. 各クエリの結果をビジュアライゼーションとして設定
4. ダッシュボードに追加

詳細は `guides/dashboards/DASHBOARD_CREATION_GUIDE.md` の「セクション4: データ品質時系列ダッシュボードの作成」を参照してください。

## データ構造

### 時系列テーブルスキーマ

```sql
CREATE TABLE sf_poc.gold.data_quality_timeseries (
    snapshot_timestamp TIMESTAMP NOT NULL,      -- スナップショット取得日時
    snapshot_date DATE NOT NULL,                 -- スナップショット取得日（パーティションキー）
    object_name STRING NOT NULL,                 -- オブジェクト名（パーティションキー）
    table_name STRING NOT NULL,                  -- 物理テーブル名
    total_records BIGINT NOT NULL,               -- 全レコード数
    passed_records BIGINT NOT NULL,              -- Passしたレコード数
    quarantine_records BIGINT NOT NULL,          -- Quarantineされたレコード数
    pass_rate DECIMAL(5,2) NOT NULL,             -- Pass rate（%）
    quarantine_rate DECIMAL(5,2) NOT NULL,       -- Quarantine率（%）
    created_at TIMESTAMP NOT NULL                -- レコード作成日時
) USING DELTA
PARTITIONED BY (snapshot_date, object_name);
```

## 監視対象オブジェクト

以下の9つのオブジェクトを監視します：

1. Opportunity（商談）
2. Account（取引先）
3. User（ユーザー）
4. Contact（取引先責任者）
5. Task（タスク）
6. Event（イベント）
7. Contract（契約）
8. Product2（商品）
9. OpportunityLineItem（商談商品）

## メトリクスの説明

### Pass rate（パス率）
- 定義: `(passed_records / total_records) * 100`
- 意味: データ品質チェックを通過したレコードの割合
- 高いほど良い（100%が理想）

### Quarantine率（検疫率）
- 定義: `(quarantine_records / total_records) * 100`
- 意味: データ品質問題により検疫されたレコードの割合
- 低いほど良い（0%が理想）

### データ品質スコア
- 定義: Pass rateをそのまま品質スコアとして使用（0-100点）
- 評価基準:
  - 95点以上: 優秀
  - 90-94点: 良好
  - 80-89点: 普通
  - 70-79点: 要改善
  - 70点未満: 要緊急対応

## 実行頻度の推奨

- **推奨頻度**: 1日1回
- **実行タイミング**: Silver層のクレンジング処理後
- **理由**: クレンジング処理の直後に実行することで、最新のデータ品質状況を記録できます

## トラブルシューティング

### テーブルが存在しないエラー

```
Table or view not found: sf_poc.gold.data_quality_timeseries
```

**解決方法**: `scripts/01_setup/06_create_data_quality_timeseries_table.py` を実行してテーブルを作成してください。

### Quarantineテーブルが存在しない警告

```
Quarantineテーブルが存在しません（データ品質問題なし）: sf_poc.silver.quarantine_opportunity
```

**対処**: これは警告であり、エラーではありません。Quarantineテーブルが存在しない場合、そのオブジェクトにはデータ品質問題がないことを意味します。

### 重複データの確認

同じ日付・オブジェクトの組み合わせで複数回実行した場合、重複データが記録される可能性があります。

**確認方法**:
```sql
SELECT 
    snapshot_date,
    object_name,
    COUNT(*) AS record_count
FROM sf_poc.gold.data_quality_timeseries
WHERE snapshot_date = CURRENT_DATE()
GROUP BY snapshot_date, object_name
HAVING COUNT(*) > 1;
```

**対処**: 必要に応じて、集計スクリプト実行前に既存データを削除するか、UPSERT処理に変更してください。

## 関連ドキュメント

- `guides/dashboards/DASHBOARD_CREATION_GUIDE.md`: ダッシュボード作成ガイド（セクション4: データ品質時系列ダッシュボードの作成を参照）
- `scripts/06_dashboards/07_data_quality_dashboard.sql`: 現在のデータ品質監視ダッシュボード（スナップショット版）
- `scripts/06_dashboards/08_data_quality_timeseries_dashboard.sql`: 時系列データ品質ダッシュボード

