# DLTでBronze層からSilver層に単純に書き込む方法

## 概要

このガイドでは、Delta Live Tables (DLT) を使用して、Bronze層からSilver層にデータを**単純に書き込む**基本的な方法を説明します。

複雑な検証やQuarantine機能は不要で、シンプルにデータを転送したい場合の手順です。

---

## 基本的なDLTスクリプトの構造

### 最小限の例

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # Silver層: シンプルなデータ転送

# COMMAND ----------

import dlt
from pyspark.sql import functions as F

# COMMAND ----------

@dlt.table(
    name="silver_event_cleaned",
    comment="Silver層のイベントデータ"
)
def silver_event_cleaned():
    """Bronze層からデータを読み込んでSilver層に書き込む"""
    # Bronze層のテーブルから読み込み
    bronze_df = spark.table("sf_poc.bronze.bronze_event_raw")
    
    # 必要に応じて簡単な変換（オプション）
    silver_df = bronze_df.select(
        "*"  # すべてのカラムをそのまま使用
    )
    
    return silver_df
```

### パラメータを使用する場合

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # Silver層: パラメータ付きデータ転送

# COMMAND ----------

dbutils.widgets.text("catalog_name", "sf_poc", "Catalog Name")

# COMMAND ----------

import dlt
from pyspark.sql import functions as F

CATALOG_NAME = dbutils.widgets.get("catalog_name")

# COMMAND ----------

@dlt.table(
    name="silver_event_cleaned",
    comment="Silver層のイベントデータ"
)
def silver_event_cleaned():
    """Bronze層からデータを読み込んでSilver層に書き込む"""
    # Bronze層のテーブルから読み込み（パラメータを使用）
    bronze_df = spark.table(f"{CATALOG_NAME}.bronze.bronze_event_raw")
    
    return bronze_df
```

---

## ステップバイステップ手順

### ステップ1: シンプルなDLTスクリプトを作成

1. **Repos** で新しいノートブックを作成
   - 例: `scripts/03_silver/dlt/06_clean_event_simple_dlt.py`

2. **基本的なコードを記述**:

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # Silver層: イベントデータ転送（シンプル版）

# COMMAND ----------

dbutils.widgets.text("catalog_name", "sf_poc", "Catalog Name")

# COMMAND ----------

import dlt
from pyspark.sql import functions as F

CATALOG_NAME = dbutils.widgets.get("catalog_name")

# COMMAND ----------

@dlt.table(
    name="silver_event_cleaned",
    comment="Silver層のイベントデータ"
)
def silver_event_cleaned():
    """Bronze層からイベントデータを読み込んでSilver層に書き込む"""
    # Bronze層のテーブルから読み込み
    bronze_df = spark.table(f"{CATALOG_NAME}.bronze.bronze_event_raw")
    
    # 必要に応じて簡単な変換を追加
    silver_df = (
        bronze_df
        .withColumn("Id", F.col("Id").cast("string"))
        .withColumn("Subject", F.trim(F.col("Subject")))
    )
    
    return silver_df
```

### ステップ2: DLTパイプラインを作成

1. **Jobs & Pipelines** → **Create** → **ETL Pipeline** を選択

2. **Advanced options** → **Add existing assets** を選択

3. **Pipeline root folder** を設定:
   - **Browse** ボタンをクリック（またはパスを直接入力）
   - `/Repos/{username}/{repo-name}/scripts/03_silver` を選択（**dltフォルダの親フォルダ**）
   - **重要**: `/Repos/` で始まるパスを使用してください

4. **Source code paths** で、作成したスクリプトを追加:
   - **警告メッセージが表示される場合**:
     ```
     Legacy configuration detected. Use files instead of notebooks for an optimal experience.
     ```
     - **この警告について**: これは警告であり、エラーではありません。既存のノートブック（.pyファイル）でも動作します。**この警告を無視して続行して問題ありません**。
   - **Add** ボタンをクリック
   - **ファイルブラウザが表示されます**:
     - 検索バーでファイルを検索できます（⌘ + P）
     - 左側にフォルダツリーが表示されます
     - `dlt` フォルダが表示されます
   - **dltフォルダを展開**:
     - `dlt` フォルダをクリックして展開
     - フォルダ内のすべてのDLTスクリプトが表示されます
   - **個別のファイルを選択**:
     - 例: `dlt/06_clean_event_simple_dlt.py` を選択
     - または、**フォルダ全体を選択**:
       - `dlt` フォルダを選択すると、フォルダ内のすべてのファイルが含まれます

5. **Target** を設定:
   - `sf_poc.silver`（カタログ名.スキーマ名）

6. **Storage location** を設定:
   - `dbfs:/mnt/delta/silver/`（適切なパスに変更）

7. **Configuration** でパラメータを追加（オプション）:
   - **Add** ボタンをクリックしてパラメータを追加
   - または、**Edit JSON** をクリックしてJSON形式で一括入力:
     ```json
     {
       "catalog_name": "sf_poc"
     }
     ```

8. **Advanced settings**（オプション）:
   - **Pipeline mode**: `Triggered`（手動実行またはWorkflowから実行）
   - **Enable autoscaling**: 必要に応じて有効化
   - **Enable Photon**: パフォーマンス向上のため有効化を推奨

9. **Create** をクリック

**詳細な手順**: [DLTパイプライン完全ガイド](./DLT_COMPLETE_GUIDE.md) の「ステップ1: 統合DLTパイプラインの作成」セクションを参照してください。

### ステップ3: パイプラインを実行

1. 作成したパイプラインのページで **Start** をクリック

2. 実行が完了するまで待つ

3. **Runs** タブで実行結果を確認

4. Silver層のテーブルを確認:
   ```sql
   SELECT * FROM sf_poc.silver.silver_event_cleaned LIMIT 10;
   ```

---

## よくあるパターン

### パターン1: すべてのカラムをそのまま転送

```python
@dlt.table(
    name="silver_event_cleaned",
    comment="Silver層のイベントデータ"
)
def silver_event_cleaned():
    """Bronze層からデータをそのまま転送"""
    bronze_df = spark.table(f"{CATALOG_NAME}.bronze.bronze_event_raw")
    return bronze_df
```

### パターン2: 特定のカラムのみ選択

```python
@dlt.table(
    name="silver_event_cleaned",
    comment="Silver層のイベントデータ"
)
def silver_event_cleaned():
    """Bronze層から必要なカラムのみ選択"""
    bronze_df = spark.table(f"{CATALOG_NAME}.bronze.bronze_event_raw")
    return bronze_df.select(
        "Id",
        "Subject",
        "StartDateTime",
        "EndDateTime",
        "CreatedDate"
    )
```

### パターン3: 簡単な変換を追加

```python
@dlt.table(
    name="silver_event_cleaned",
    comment="Silver層のイベントデータ"
)
def silver_event_cleaned():
    """Bronze層からデータを読み込んで簡単な変換を適用"""
    bronze_df = spark.table(f"{CATALOG_NAME}.bronze.bronze_event_raw")
    
    return (
        bronze_df
        .withColumn("Id", F.col("Id").cast("string"))
        .withColumn("Subject", F.trim(F.col("Subject")))
        .withColumn("StartDateTime", F.to_timestamp(F.col("StartDateTime")))
        .withColumn("EndDateTime", F.to_timestamp(F.col("EndDateTime")))
        .filter(F.col("IsDeleted") == False)  # 削除済みレコードを除外
    )
```

### パターン4: 複数のテーブルを処理

```python
# イベントテーブル
@dlt.table(
    name="silver_event_cleaned",
    comment="Silver層のイベントデータ"
)
def silver_event_cleaned():
    bronze_df = spark.table(f"{CATALOG_NAME}.bronze.bronze_event_raw")
    return bronze_df

# タスクテーブル
@dlt.table(
    name="silver_task_cleaned",
    comment="Silver層のタスクデータ"
)
def silver_task_cleaned():
    bronze_df = spark.table(f"{CATALOG_NAME}.bronze.bronze_task_raw")
    return bronze_df
```

---

## 現在のDLTスクリプトとの違い

### 現在のDLTスクリプト（複雑版）

現在のDLTスクリプト（例: `06_clean_event_dlt.py`）には以下が含まれています：

- ✅ **Expectations機能**: データ品質検証（`@dlt.expect_or_drop`）
- ✅ **Quarantineテーブル**: 無効なデータを分離
- ✅ **SCD Type 2**: 変更履歴管理
- ✅ **複雑な検証ロジック**: 詳細なデータ品質チェック

### シンプル版との比較

| 機能 | 複雑版 | シンプル版 |
|------|--------|-----------|
| Bronze→Silver転送 | ✅ | ✅ |
| データ品質検証 | ✅ | ❌ |
| Quarantine | ✅ | ❌ |
| SCD Type 2 | ✅ | ❌ |
| 簡単な変換 | ✅ | ✅ |

**シンプル版を使用する場合**:
- データ品質検証は不要
- Quarantine機能は不要
- 変更履歴管理は不要
- 単純にデータを転送したい

---

## トラブルシューティング

### 問題1: テーブルが見つからない

**エラー**: `Table or view not found: sf_poc.bronze.bronze_event_raw`

**解決策**:
1. Bronze層のテーブルが存在するか確認:
   ```sql
   SHOW TABLES IN sf_poc.bronze;
   ```
2. テーブル名が正しいか確認
3. カタログ名が正しいか確認

### 問題2: パイプラインが実行されない

**原因**: Bronze層のテーブルが空の場合、DLTパイプラインは正常に実行されますが、Silver層のテーブルも空になります。

**解決策**:
1. Bronze層にデータが存在するか確認:
   ```sql
   SELECT COUNT(*) FROM sf_poc.bronze.bronze_event_raw;
   ```
2. Bronze層のデータロードパイプラインを実行

### 問題3: カラムが見つからない

**エラー**: `cannot resolve 'ColumnName' given input columns`

**解決策**:
1. Bronze層のテーブル構造を確認:
   ```sql
   DESCRIBE sf_poc.bronze.bronze_event_raw;
   ```
2. カラム名が正しいか確認（大文字小文字に注意）
3. 存在しないカラムを参照していないか確認

---

## 次のステップ

シンプルな転送が動作したら、必要に応じて以下を追加できます：

1. **データ品質検証**: `@dlt.expect_or_drop` デコレータを追加
2. **Quarantine機能**: 無効なデータを分離するテーブルを追加
3. **SCD Type 2**: 変更履歴管理を追加
4. **複雑な変換**: ビジネスロジックを追加

詳細は以下を参照：
- [DLT実装ガイド](./DLT_IMPLEMENTATION_GUIDE.md) - 完全版の実装方法
- [DLTパイプラインGitリポジトリ設定ガイド](./DLT_PIPELINE_GIT_REPOS_SETUP.md) - パイプライン作成方法

---

## まとめ

DLTでBronze層からSilver層に単純に書き込む方法：

1. **シンプルなDLTスクリプトを作成**:
   - `@dlt.table` デコレータを使用
   - `spark.table()` でBronze層から読み込み
   - DataFrameを返す

2. **DLTパイプラインを作成**:
   - **ETL Pipeline** を選択
   - **Add existing assets** でスクリプトを追加
   - **Target** と **Storage location** を設定

3. **パイプラインを実行**:
   - **Start** をクリック
   - 実行結果を確認

**重要**: シンプルな転送から始めて、必要に応じて機能を追加していくことを推奨します。

