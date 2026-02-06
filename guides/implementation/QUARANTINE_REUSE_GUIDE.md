# Quarantine・データクレンジングダッシュボード再利用ガイド

**目的**: 他のプロジェクトでQuarantineの仕組みとデータクレンジングダッシュボードを再利用するための手順

---

## 📋 目次

1. [概要](#概要)
2. [再利用可能なコンポーネント](#再利用可能なコンポーネント)
3. [セットアップ手順](#セットアップ手順)
4. [カスタマイズ手順](#カスタマイズ手順)
5. [検証手順](#検証手順)

---

## 概要

このガイドでは、Quarantineの仕組みとデータクレンジングダッシュボードを他のプロジェクトで再利用する方法を説明します。

### 再利用可能なコンポーネント

1. **Quarantineユーティリティ** (`quarantine_utils.py`)
   - ✅ 完全に再利用可能（プロジェクト固有の名前なし）

2. **Quarantine実装パターン**
   - ✅ 標準化済み（`standards/03-patterns/IMPLEMENTATION_PATTERNS.md`）

3. **Quarantineビュー設計**
   - ✅ 標準化済み（`guides/data-model/QUARANTINE_VIEWS_DESIGN.md`）

4. **データ品質ビュー作成SQLテンプレート**
   - ✅ テンプレート化済み（`standards/03-patterns/DATA_QUALITY_VIEWS_TEMPLATE.sql`）

5. **データ品質ダッシュボードSQLテンプレート**
   - ✅ テンプレート化済み（`standards/03-patterns/DATA_QUALITY_DASHBOARD_TEMPLATE.sql`）

---

## 再利用可能なコンポーネント

### 1. Quarantineユーティリティ

**ファイル**: `scripts/03_silver/common/quarantine_utils.py`

**特徴**:
- プロジェクト固有の名前が一切含まれていない
- 汎用的な関数設計
- パラメータ化されており、任意のプロジェクトで使用可能

**コピー方法**:
```bash
# このファイルをそのままコピーして使用可能
cp scripts/03_silver/common/quarantine_utils.py <新しいプロジェクト>/scripts/03_silver/common/
```

**使用方法**:
```python
from quarantine_utils import (
    add_quarantine_columns,
    validate_id_column,
    validate_name_column,
    filter_invalid_records
)

# 使用例
df = add_quarantine_columns(source_df)
df = validate_id_column(df, "Id", "Invalid_Id")
invalid_df = filter_invalid_records(df)
```

---

### 2. Quarantine実装パターン

**ファイル**: `standards/03-patterns/IMPLEMENTATION_PATTERNS.md`

**参照セクション**:
- Silver層データクレンジングパターン（DLT版）
- Quarantine実装パターン

**使用方法**:
- パターンを参照して、プロジェクトに合わせて実装

---

### 3. Quarantineビュー設計

**ファイル**: `guides/data-model/QUARANTINE_VIEWS_DESIGN.md`

**参照セクション**:
- `quarantine_samples`（サマリー用途）
- `quarantine_details`（詳細用途）
- `quarantine_reason_summary`（理由別集計）

**使用方法**:
- 設計を参照して、プロジェクトに合わせてビューを作成

---

### 4. データ品質ビュー作成SQLテンプレート

**ファイル**: `standards/03-patterns/DATA_QUALITY_VIEWS_TEMPLATE.sql`

**特徴**:
- カタログ名、スキーマ名をパラメータ化（`{CATALOG_NAME}`, `{SILVER_SCHEMA}`, `{GOLD_SCHEMA}`）
- オブジェクトリストをパラメータ化（`{OBJECT_LIST}`）

**使用方法**:
1. テンプレートファイルをコピー
2. `{CATALOG_NAME}`, `{SILVER_SCHEMA}`, `{GOLD_SCHEMA}`を実際の値に置換
3. `{OBJECT_LIST}`セクションをプロジェクトのオブジェクトリストに置換
4. Databricks SQL Editorで実行

---

### 5. データ品質ダッシュボードSQLテンプレート

**ファイル**: `standards/03-patterns/DATA_QUALITY_DASHBOARD_TEMPLATE.sql`

**特徴**:
- カタログ名、スキーマ名をパラメータ化（`{CATALOG_NAME}`, `{GOLD_SCHEMA}`）
- 5つのクエリが含まれている（サマリー、Pass率/Quarantine率、理由別件数、サンプル一覧、閾値超過検出）

**使用方法**:
1. テンプレートファイルをコピー
2. `{CATALOG_NAME}`, `{GOLD_SCHEMA}`を実際の値に置換
3. Databricks SQL Editorで実行
4. 各クエリの結果をビジュアライゼーションとして設定
5. ダッシュボードに追加

---

## セットアップ手順

### ステップ1: Quarantineユーティリティのコピー

```bash
# 新しいプロジェクトのディレクトリに移動
cd <新しいプロジェクト>

# ディレクトリを作成
mkdir -p scripts/03_silver/common

# Quarantineユーティリティをコピー
cp <元のプロジェクト>/scripts/03_silver/common/quarantine_utils.py scripts/03_silver/common/
```

### ステップ2: DLTパイプラインでのQuarantine実装

1. `standards/03-patterns/IMPLEMENTATION_PATTERNS.md`の「Quarantine実装パターン」を参照
2. DLTスクリプトにQuarantineテーブルを作成する関数を追加

**例**:
```python
@dlt.table(
    name="quarantine_{entity}",
    comment="無効な{Entity}データ（検証に失敗したレコード）"
)
def quarantine_{entity}():
    """無効なレコードをQuarantineテーブルに分離"""
    source_table = f"{CATALOG_NAME}.bronze.bronze_{entity}_raw"
    source_df = spark.table(source_table)
    
    from quarantine_utils import (
        add_quarantine_columns,
        validate_id_column,
        validate_name_column,
        filter_invalid_records
    )
    
    df = add_quarantine_columns(source_df)
    df = validate_id_column(df, "Id", "Invalid_Id")
    df = validate_name_column(df, "Name", min_length=2)
    
    return filter_invalid_records(df)
```

### ステップ3: データ品質ビューの作成

1. `standards/03-patterns/DATA_QUALITY_VIEWS_TEMPLATE.sql`をコピー
2. プレースホルダーを実際の値に置換:
   - `{CATALOG_NAME}` → 実際のカタログ名（例: `poc`, `sales`）
   - `{SILVER_SCHEMA}` → Silver層のスキーマ名（例: `silver`）
   - `{GOLD_SCHEMA}` → Gold層のスキーマ名（例: `gold`）
   - `{OBJECT_LIST}` → プロジェクトのオブジェクトリスト

**例（Opportunityオブジェクトの場合）**:
```sql
-- 最初のオブジェクト（UNION ALLなし）
SELECT
    'Opportunity' AS object_name,
    'silver_opportunity_cleaned' AS table_name,
    COUNT(*) + COALESCE((SELECT COUNT(*) FROM poc.silver.quarantine_opportunity), 0) AS total_records,
    COALESCE((SELECT COUNT(*) FROM poc.silver.quarantine_opportunity), 0) AS quarantine_records,
    COUNT(*) AS passed_records,
    CASE
        WHEN COUNT(*) + COALESCE((SELECT COUNT(*) FROM poc.silver.quarantine_opportunity), 0) = 0 THEN 0.0
        ELSE COUNT(*) * 100.0 / (COUNT(*) + COALESCE((SELECT COUNT(*) FROM poc.silver.quarantine_opportunity), 0))
    END AS pass_rate,
    CASE
        WHEN COUNT(*) + COALESCE((SELECT COUNT(*) FROM poc.silver.quarantine_opportunity), 0) = 0 THEN 0.0
        ELSE COALESCE((SELECT COUNT(*) FROM poc.silver.quarantine_opportunity), 0) * 100.0 / (COUNT(*) + COALESCE((SELECT COUNT(*) FROM poc.silver.quarantine_opportunity), 0))
    END AS quarantine_rate
FROM poc.silver.silver_opportunity_cleaned

-- 他のオブジェクトを追加
UNION ALL
SELECT
    'Account' AS object_name,
    ...
```

3. Databricks SQL Editorで実行

### ステップ4: データ品質ダッシュボードの作成

1. `standards/03-patterns/DATA_QUALITY_DASHBOARD_TEMPLATE.sql`をコピー
2. プレースホルダーを実際の値に置換:
   - `{CATALOG_NAME}` → 実際のカタログ名（例: `poc`, `sales`）
   - `{GOLD_SCHEMA}` → Gold層のスキーマ名（例: `gold`）

**例**:
```sql
FROM poc.gold.data_quality_summary
WHERE :object_name = 'All' OR object_name = :object_name
```

3. Databricks SQL Editorで実行
4. 各クエリの結果をビジュアライゼーションとして設定
5. ダッシュボードに追加

---

## カスタマイズ手順

### 1. オブジェクトリストのカスタマイズ

データ品質ビュー作成SQLテンプレートの`{OBJECT_LIST}`セクションを、プロジェクトのオブジェクトリストに置換します。

**オブジェクトリストの確認方法**:
```sql
-- Silver層のテーブル一覧を確認
SHOW TABLES IN {CATALOG_NAME}.{SILVER_SCHEMA};

-- Quarantineテーブル一覧を確認
SHOW TABLES IN {CATALOG_NAME}.{SILVER_SCHEMA} LIKE 'quarantine_*';
```

### 2. 検証ルールのカスタマイズ

`quarantine_utils.py`の検証関数を、プロジェクトの要件に合わせてカスタマイズします。

**例**:
```python
# カスタム検証ルールを追加
def validate_custom_column(df: DataFrame, column_name: str, ...):
    """カスタム検証ルール"""
    # 実装
```

### 3. ダッシュボードクエリのカスタマイズ

データ品質ダッシュボードSQLテンプレートのクエリを、プロジェクトの要件に合わせてカスタマイズします。

**例**:
- 追加のフィルタ条件を追加
- 追加の集計カラムを追加
- カスタムビジュアライゼーション設定を追加

---

## 検証手順

### 1. Quarantineユーティリティの検証

```python
# テストスクリプトを作成
from quarantine_utils import (
    add_quarantine_columns,
    validate_id_column,
    filter_invalid_records
)

# テストデータを作成
test_df = spark.createDataFrame([
    ("001000000000000AAA", "Valid Name"),
    ("001000000000000BBB", ""),  # 無効なName
    ("001", "Valid Name"),  # 無効なId
], ["Id", "Name"])

# 検証を実行
df = add_quarantine_columns(test_df)
df = validate_id_column(df, "Id", "Invalid_Id")
df = validate_name_column(df, "Name", min_length=2)
invalid_df = filter_invalid_records(df)

# 結果を確認
invalid_df.show()
```

### 2. データ品質ビューの検証

```sql
-- ビューが正しく作成されているか確認
SELECT * FROM {CATALOG_NAME}.{GOLD_SCHEMA}.data_quality_summary LIMIT 10;
SELECT * FROM {CATALOG_NAME}.{GOLD_SCHEMA}.quarantine_reason_summary LIMIT 10;
SELECT * FROM {CATALOG_NAME}.{GOLD_SCHEMA}.quarantine_samples LIMIT 10;

-- データが正しく集計されているか確認
SELECT 
    object_name,
    SUM(total_records) AS total,
    SUM(quarantine_records) AS quarantine
FROM {CATALOG_NAME}.{GOLD_SCHEMA}.data_quality_summary
GROUP BY object_name;
```

### 3. ダッシュボードクエリの検証

1. 各クエリを個別に実行
2. 結果が正しく表示されるか確認
3. パラメータが正しく動作するか確認
4. ビジュアライゼーションが正しく設定できるか確認

---

## トラブルシューティング

### 問題1: Quarantineユーティリティがインポートできない

**原因**: パスが正しく設定されていない

**解決方法**:
```python
# パスを追加
import sys
sys.path.append('/Workspace/path/to/common')
from quarantine_utils import ...
```

### 問題2: データ品質ビューが作成できない

**原因**: テーブル名が正しくない、権限が不足している

**解決方法**:
1. Silver層のテーブル名を確認
2. Quarantineテーブルが存在するか確認
3. 権限を確認

### 問題3: ダッシュボードクエリが実行できない

**原因**: ビューが存在しない、カタログ名・スキーマ名が間違っている

**解決方法**:
1. データ品質ビューが作成されているか確認
2. カタログ名・スキーマ名が正しいか確認
3. 権限を確認

---

## 参考資料

- [Quarantine実装パターン](../standards/03-patterns/IMPLEMENTATION_PATTERNS.md)
- [Quarantineビュー設計](../guides/data-model/QUARANTINE_VIEWS_DESIGN.md)
- [データ品質ビュー作成SQLテンプレート](../standards/03-patterns/DATA_QUALITY_VIEWS_TEMPLATE.sql)
- [データ品質ダッシュボードSQLテンプレート](../standards/03-patterns/DATA_QUALITY_DASHBOARD_TEMPLATE.sql)
- [再利用性評価レポート](../standards/03-patterns/QUARANTINE_REUSABILITY_ASSESSMENT.md)

