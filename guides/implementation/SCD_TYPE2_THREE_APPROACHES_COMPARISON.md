# SCD Type 2実装方式の3パターン比較

## 概要

SCD Type 2を実装する3つの方式の比較です。

1. **方式1**: DLTで`_dlt`テーブルを作成 → リネーム方式（現在の実装）
2. **方式2**: DLTを使わない、直接SCD Type 2で書き込み
3. **方式3**: DLTパイプラインを使いつつ、直接本番テーブルに書き込む（リネームなし）

---

## 方式1: DLTで`_dlt`テーブルを作成 → リネーム方式（現在の実装）

### 実装フロー

1. **DLTパイプライン実行**
   - DLTパイプラインが `silver_*_cleaned_dlt` という一時テーブルを作成
   - DLT Expectations（`@dlt.expect_or_drop`）で無効データを自動的にドロップ
   - 別途Quarantineテーブル（`quarantine_*`）に無効データを書き込み
   - SCD Type 2の `is_current=1` レコードのみを保持

2. **既存テーブルの退避（98スクリプト）**
   - 既存の `silver_*_cleaned` を `silver_*_cleaned_legacy` にリネーム
   - メタデータ（Description、Properties、Permissions、Column masking）を保持

3. **DLTテーブルの本番化（99スクリプト）**
   - `silver_*_cleaned_dlt` を `silver_*_cleaned` にリネーム
   - メタデータを再設定（legacyテーブルから取得）

4. **SCD Type 2補助処理（99_scd_type2_merge.py）**
   - DLTパイプライン実行後に別途実行
   - 既存の履歴レコード（`is_current=0`）と統合
   - 変更検出（ハッシュ値比較）で履歴レコードを生成

### メリット

✅ **DLTのExpectations機能を完全に活用**
   - `@dlt.expect_or_drop` で自動的に無効データをドロップ
   - SQL式で簡潔にデータ品質ルールを定義可能
   - 検証ルールの変更が容易（デコレータを追加・削除するだけ）

✅ **DLTの自動最適化機能を活用**
   - `pipelines.autoOptimize.managed` で自動的にテーブル最適化
   - Z-ordering、Compactionが自動実行

✅ **DLTのデータ品質モニタリングを活用**
   - DLTのメトリクスとダッシュボードでデータ品質を監視
   - Expectationsの違反件数を自動的に記録

✅ **ロールバックが容易**
   - `_legacy` テーブルが残っているため、問題があれば即座にロールバック可能
   - 本番テーブルを `_legacy` に戻し、`_dlt` を削除するだけ

✅ **既存テーブルへの影響なし**
   - DLTパイプラインは `_dlt` テーブルに書き込むため、既存テーブルに影響なし
   - 既存のワークフローやダッシュボードに影響なし
   - データ確認後にリネームするため、安全

✅ **メタデータの保持**
   - リネーム処理でメタデータ（Description、Properties、Permissions、Column masking）を保持
   - History（Delta Lakeの履歴）も保持される（通常のテーブルの場合）

✅ **段階的な移行**
   - DLTパイプライン実行 → データ確認 → リネーム、という段階的な移行が可能
   - 各段階でデータ整合性を確認できる

✅ **DLTパイプラインの自動化機能**
   - Databricks Workflowsと統合して自動実行可能
   - リトライ、エラー通知が自動化
   - パイプライン実行履歴が自動記録

### デメリット

❌ **複雑な処理フロー**
   - 4つのステップ（DLT実行 → 98 → 99 → SCD Type 2補助処理）が必要
   - 90スクリプト（オーケストレーション）で統合しているが、それでも複雑

❌ **テーブル名の一時的な重複**
   - `_dlt` と本番名が一時的に共存
   - 混乱を招く可能性

❌ **SCD Type 2の履歴管理が分離**
   - DLTパイプラインでは `is_current=1` のみ
   - 履歴レコード（`is_current=0`）は別処理（99_scd_type2_merge.py）で統合
   - 2段階の処理が必要

❌ **リネーム処理のリスク**
   - Materialized Viewの場合、Historyが失われる可能性
   - リネーム処理中にエラーが発生するリスク

❌ **メタデータの再設定が必要**
   - 99スクリプトでメタデータを再設定する必要がある
   - PermissionsやColumn maskingが正しく再設定されない可能性

❌ **実行時間が長い**
   - DLTパイプライン実行 → 98 → 99 → SCD Type 2補助処理、と複数ステップ
   - 各ステップでテーブルスキャンが発生

---

## 方式2: DLTを使わない、直接SCD Type 2で書き込み

### 実装フロー

1. **Bronze層からデータを読み込み**
   - `bronze_*_raw` テーブルから最新データを取得

2. **Quarantine検証（手動実装）**
   - `quarantine_utils.py` を使用して無効データを検出
   - 無効データを `quarantine_*` テーブルに書き込み

3. **SCD Type 2で現行テーブルに直接書き込み**
   - 現行テーブル（`silver_*_cleaned`）を読み込み
   - 変更検出（ハッシュ値比較）で履歴レコードを生成
   - Delta LakeのMERGE操作で既存の `is_current=1` レコードを `is_current=0` に更新
   - 新規・更新レコードを `is_current=1` でINSERT

### メリット

✅ **シンプルな処理フロー**
   - 1つのノートブック/スクリプトで完結
   - リネーム処理が不要

✅ **SCD Type 2とQuarantineが統合**
   - 1つの処理で両方を実装
   - 処理の一貫性が保たれる

✅ **既存テーブルに直接書き込み**
   - テーブル名の重複がない
   - 混乱が少ない

✅ **実行時間が短い**
   - リネーム処理が不要
   - 1回の処理で完結

✅ **メタデータの保持が容易**
   - 既存テーブルに直接書き込むため、メタデータが自動的に保持される
   - リネーム処理によるメタデータの再設定が不要

✅ **履歴管理の一貫性**
   - SCD Type 2の履歴レコード（`is_current=0`）も同じテーブルに保持
   - 履歴管理が1つの処理で完結

✅ **Delta LakeのMERGE操作を活用**
   - Delta LakeのMERGE操作で効率的にSCD Type 2を実装
   - ACIDトランザクション保証

### デメリット

❌ **DLTのExpectations機能を活用できない**
   - DLTパイプラインを使用しないため、`@dlt.expect_or_drop` が使えない
   - Quarantine検証を手動で実装する必要がある

❌ **データ検証の実装コストが高い**
   - `quarantine_utils.py` を使用して手動で検証ルールを実装
   - DLTのExpectations機能と比較して、実装コストが高い
   - 検証ルールの変更時にコード修正が必要

❌ **DLTパイプラインの機能を活用できない**
   - DLTの自動最適化（`pipelines.autoOptimize.managed`）が使えない
   - DLTのデータ品質モニタリング機能が使えない
   - DLTのパイプライン実行履歴やメトリクスが使えない

❌ **ロールバックが困難**
   - 既存テーブルに直接書き込むため、問題があってもロールバックが困難
   - 履歴レコード（`is_current=0`）から復元する必要がある
   - トランザクションログから復元する必要がある場合もある

❌ **既存テーブルへの影響**
   - 既存テーブルに直接書き込むため、処理中にテーブルがロックされる可能性
   - 既存のワークフローやダッシュボードに影響する可能性
   - MERGE操作中に読み取りがブロックされる可能性

❌ **エラーハンドリングが複雑**
   - MERGE操作中にエラーが発生した場合の処理が複雑
   - 部分的な更新が発生する可能性
   - トランザクション管理が必要

❌ **初回実行時の考慮**
   - 既存テーブルが存在しない場合の処理が必要
   - 初回実行時は全レコードが新規として扱われる

❌ **開発・運用の負担**
   - DLTパイプラインの自動化機能（スケジューリング、リトライ、エラー通知など）が使えない
   - 手動でスケジューリングやエラーハンドリングを実装する必要がある

---

## 方式3: DLTパイプラインを使いつつ、直接本番テーブルに書き込む（リネームなし）

### 実装フロー

1. **DLTパイプラインで本番テーブル名を指定**
   - `@dlt.table(name="silver_*_cleaned")` で本番テーブル名を指定
   - DLTのExpectations機能（`@dlt.expect_or_drop`）を使用可能
   - 別途Quarantineテーブル（`quarantine_*`）に無効データを書き込み

2. **DLTパイプライン内で既存テーブルを読み込んで統合**
   - DLTパイプライン内で既存テーブル（`silver_*_cleaned`）を読み込み
   - 既存の履歴レコード（`is_current=0`）を保持
   - 既存の `is_current=1` レコードと新規データを比較
   - 変更検出（ハッシュ値比較）で履歴レコードを生成
   - 既存の `is_current=1` レコードを `is_current=0` に更新（`valid_to` を設定）
   - 新規・更新レコードを `is_current=1` でINSERT

3. **DLTパイプラインが本番テーブルに書き込み**
   - DLTパイプラインが直接本番テーブル（`silver_*_cleaned`）に書き込み
   - リネーム処理は不要

### 実装例（概念）

```python
@dlt.table(
    name="silver_opportunity_cleaned",  # 本番テーブル名を直接指定
    comment="Silver層の商談データ（クレンジング済み・SCD Type 2）",
    table_properties={
        "quality": "silver",
        "pipelines.autoOptimize.managed": "true"
    }
)
@dlt.expect_or_drop("valid_id", "Id IS NOT NULL AND LENGTH(Id) = 18")
@dlt.expect_or_drop("valid_name", "Name IS NOT NULL AND TRIM(Name) != ''")
def silver_opportunity_cleaned():
    """商談データをクレンジングし、SCD Type 2で管理"""
    # Bronze層からデータを読み込み
    source_table = f"{CATALOG_NAME}.bronze.bronze_opportunity_raw"
    source_df = spark.table(source_table)
    
    # データクレンジング
    cleaned_df = (
        source_df
        .withColumn("Id", F.col("Id").cast("string"))
        .withColumn("Name", F.trim(F.col("Name")))
        # ... 他のクレンジング処理
        .withColumn("valid_from", F.current_timestamp())
        .withColumn("valid_to", F.lit(None).cast("timestamp"))
        .withColumn("is_current", F.lit(1).cast("int"))
    )
    
    # 既存テーブルを読み込み（存在する場合）
    existing_table = f"{CATALOG_NAME}.silver.silver_opportunity_cleaned"
    try:
        existing_df = spark.table(existing_table)
        
        # 既存の履歴レコード（is_current=0）を保持
        existing_hist_df = existing_df.filter(F.col("is_current") == 0)
        
        # 既存の現在有効レコード（is_current=1）を取得
        existing_current_df = existing_df.filter(F.col("is_current") == 1)
        
        # 変更検出用のハッシュ値を生成
        exclude_cols = ["valid_from", "valid_to", "is_current"]
        data_cols = [col for col in cleaned_df.columns if col not in exclude_cols]
        hash_expr = F.sha2(
            F.concat_ws("||", *[F.coalesce(F.col(c).cast("string"), F.lit("")) for c in data_cols]),
            256
        )
        cleaned_df = cleaned_df.withColumn("data_hash", hash_expr)
        existing_current_df = existing_current_df.withColumn("data_hash", hash_expr)
        
        # 変更されたレコードを検出して履歴化
        changed_records = (
            cleaned_df.alias("source")
            .join(
                existing_current_df.alias("target"),
                (F.col("source.Id") == F.col("target.Id")) & (F.col("target.is_current") == 1),
                "inner"
            )
            .filter(F.col("source.data_hash") != F.col("target.data_hash"))
            .select(F.col("target.*"))
            .withColumn("valid_to", F.current_timestamp())
            .withColumn("is_current", F.lit(0).cast("int"))
            .drop("data_hash")
        )
        
        # 新規レコード（既存に存在しないId）
        new_records = (
            cleaned_df.alias("source")
            .join(
                existing_current_df.alias("target"),
                F.col("source.Id") == F.col("target.Id"),
                "left_anti"
            )
            .drop("data_hash")
        )
        
        # 更新レコード（既存に存在し、変更されたId）
        updated_records = (
            cleaned_df.alias("source")
            .join(
                existing_current_df.alias("target"),
                (F.col("source.Id") == F.col("target.Id")) & (F.col("source.data_hash") != F.col("target.data_hash")),
                "inner"
            )
            .select(F.col("source.*"))
            .drop("data_hash")
        )
        
        # 既存の現在有効レコードで変更されなかったもの（そのまま保持）
        unchanged_records = (
            existing_current_df.alias("target")
            .join(
                cleaned_df.alias("source"),
                (F.col("source.Id") == F.col("target.Id")) & (F.col("source.data_hash") == F.col("target.data_hash")),
                "left_anti"
            )
            .drop("data_hash")
        )
        
        # すべてのレコードを統合
        # 注意: DLTは通常、テーブルを上書き（overwrite）するため、
        # 履歴レコードを保持するには、既存の履歴レコードも含めて返す必要がある
        result_df = (
            existing_hist_df  # 既存の履歴レコード
            .unionByName(changed_records, allowMissingColumns=True)  # 新たに履歴化されたレコード
            .unionByName(new_records, allowMissingColumns=True)  # 新規レコード
            .unionByName(updated_records, allowMissingColumns=True)  # 更新レコード
            .unionByName(unchanged_records, allowMissingColumns=True)  # 変更されなかったレコード
        )
        
        return result_df
        
    except Exception as e:
        # 既存テーブルが存在しない場合（初回実行時）
        logger.warning(f"既存テーブルが存在しません（初回実行）: {existing_table} - {e}")
        return cleaned_df.drop("data_hash")
```

### メリット

✅ **DLTのExpectations機能を完全に活用**
   - `@dlt.expect_or_drop` で自動的に無効データをドロップ
   - SQL式で簡潔にデータ品質ルールを定義可能
   - 検証ルールの変更が容易（デコレータを追加・削除するだけ）

✅ **DLTの自動最適化機能を活用**
   - `pipelines.autoOptimize.managed` で自動的にテーブル最適化
   - Z-ordering、Compactionが自動実行

✅ **DLTのデータ品質モニタリングを活用**
   - DLTのメトリクスとダッシュボードでデータ品質を監視
   - Expectationsの違反件数を自動的に記録

✅ **シンプルな処理フロー**
   - DLTパイプライン実行のみで完結
   - リネーム処理が不要

✅ **SCD Type 2とQuarantineが統合**
   - 1つのDLTパイプラインで両方を実装
   - 処理の一貫性が保たれる

✅ **履歴管理の一貫性**
   - SCD Type 2の履歴レコード（`is_current=0`）も同じテーブルに保持
   - 履歴管理が1つの処理で完結

✅ **メタデータの保持が容易**
   - 既存テーブルに直接書き込むため、メタデータが自動的に保持される
   - リネーム処理によるメタデータの再設定が不要

✅ **DLTパイプラインの自動化機能**
   - Databricks Workflowsと統合して自動実行可能
   - リトライ、エラー通知が自動化
   - パイプライン実行履歴が自動記録

### Quarantineテーブルの動作

**重要**: 方式3では、Quarantineテーブルは**毎回DLTパイプライン実行時に生成されます**。

- **Quarantineテーブルの生成**: DLTパイプライン実行時に、無効なデータが検出されると、`quarantine_*`テーブルが作成または更新されます
- **Quarantineテーブルの上書き**: DLTパイプラインの`@dlt.table`デコレータは、デフォルトで**上書き（overwrite）モード**で動作します
  - つまり、**毎回DLTパイプラインを実行すると、Quarantineテーブルは上書きされ、過去のQuarantineデータが失われます**
  - これは、方式1でも方式3でも同じ動作です

**Quarantineテーブルの履歴を保持したい場合の対処法**:

1. **Quarantineテーブルを手動でバックアップ**
   - DLTパイプライン実行前に、既存のQuarantineテーブルをバックアップ
   - または、Quarantineテーブルを別のテーブルにコピー

2. **Quarantineテーブルを別途管理**
   - DLTパイプライン外で、Quarantineテーブルを管理
   - 例: DLTパイプライン実行後に、Quarantineテーブルを履歴テーブルに統合

3. **QuarantineテーブルをAppendモードで管理（DLTでは困難）**
   - DLTパイプラインでは、`@dlt.table`は上書きモードがデフォルト
   - Appendモードで管理するには、DLTパイプライン外で実装する必要がある

### デメリット

❌ **DLTパイプライン内での処理が複雑**
   - 既存テーブルを読み込んで統合する処理が複雑
   - SCD Type 2の履歴管理をDLTパイプライン内で実装する必要がある
   - ハッシュ値の生成と変更検出のロジックが複雑

❌ **DLTのテーブル上書き動作への対応が必要**
   - DLTパイプラインは通常、テーブルを上書き（overwrite）する
   - 履歴レコード（`is_current=0`）を保持するには、既存の履歴レコードも含めて返す必要がある
   - 既存テーブルを読み込んで統合する処理が必要

❌ **Quarantineテーブルの履歴が失われる**
   - **毎回DLTパイプライン実行時に、Quarantineテーブルが上書きされる**
   - 過去のQuarantineデータが失われる
   - Quarantineテーブルの履歴を保持するには、別途管理が必要

❌ **ロールバックが困難**
   - 既存テーブルに直接書き込むため、問題があってもロールバックが困難
   - 履歴レコード（`is_current=0`）から復元する必要がある
   - トランザクションログから復元する必要がある場合もある

❌ **既存テーブルへの影響**
   - 既存テーブルに直接書き込むため、処理中にテーブルがロックされる可能性
   - 既存のワークフローやダッシュボードに影響する可能性
   - DLTパイプライン実行中に読み取りがブロックされる可能性

❌ **エラーハンドリングが複雑**
   - DLTパイプライン内で既存テーブルを読み込む処理が失敗した場合の処理が複雑
   - 部分的な更新が発生する可能性
   - トランザクション管理が必要

❌ **初回実行時の考慮**
   - 既存テーブルが存在しない場合の処理が必要
   - 初回実行時は全レコードが新規として扱われる

❌ **パフォーマンスへの影響**
   - 既存テーブル全体を読み込んで統合するため、パフォーマンスへの影響がある可能性
   - 大規模なテーブルの場合、処理時間が長くなる可能性

---

## 3パターン比較表

| 項目 | 方式1（_dlt + リネーム） | 方式2（DLTなし） | 方式3（DLT + 直接書き込み） |
|------|-------------------------|------------------|------------------------------|
| **処理フロー** | ❌ 複雑（4ステップ） | ✅ シンプル（1ステップ） | ✅ シンプル（1ステップ） |
| **DLT機能の活用** | ✅ 完全活用 | ❌ 不可 | ✅ 完全活用 |
| **Expectations機能** | ✅ `@dlt.expect_or_drop` | ❌ 手動実装 | ✅ `@dlt.expect_or_drop` |
| **自動最適化** | ✅ `pipelines.autoOptimize.managed` | ❌ 手動実装 | ✅ `pipelines.autoOptimize.managed` |
| **データ品質モニタリング** | ✅ DLTメトリクス | ❌ 手動実装 | ✅ DLTメトリクス |
| **Quarantine実装** | ✅ DLT Expectations + 手動 | ⚠️ 手動実装のみ | ✅ DLT Expectations + 手動 |
| **SCD Type 2** | ⚠️ 2段階（DLT + 補助処理） | ✅ 1段階（統合） | ✅ 1段階（DLT内で統合） |
| **リネーム処理** | ❌ 必要（98 + 99スクリプト） | ✅ 不要 | ✅ 不要 |
| **ロールバック** | ✅ 容易（_legacyから復元） | ❌ 困難（履歴から復元） | ❌ 困難（履歴から復元） |
| **メタデータ保持** | ⚠️ 再設定が必要 | ✅ 自動保持 | ✅ 自動保持 |
| **実行時間** | ❌ 長い（複数ステップ） | ✅ 短い（1ステップ） | ⚠️ 中（既存テーブル読み込み） |
| **既存テーブルへの影響** | ✅ なし（_dltに書き込み） | ⚠️ あり（直接書き込み） | ⚠️ あり（直接書き込み） |
| **履歴管理の一貫性** | ⚠️ 分離（DLT + 補助処理） | ✅ 統合（1処理） | ✅ 統合（DLT内で1処理） |
| **エラーハンドリング** | ✅ 容易（ロールバック可能） | ⚠️ 複雑（部分更新の可能性） | ⚠️ 複雑（DLT内で処理） |
| **実装コスト** | ⚠️ 中（DLT + リネーム処理） | ⚠️ 中（手動実装） | ⚠️ 高（DLT内で複雑な処理） |
| **自動化機能** | ✅ DLTパイプライン | ❌ 手動実装 | ✅ DLTパイプライン |
| **パフォーマンス** | ✅ 良好（_dltに書き込み） | ✅ 良好（直接MERGE） | ⚠️ 中（既存テーブル読み込み） |
| **テーブル名の重複** | ❌ あり（_dltと本番名） | ✅ なし | ✅ なし |
| **初回実行時の考慮** | ✅ 容易（_dltテーブル作成） | ⚠️ 必要（既存テーブルチェック） | ⚠️ 必要（既存テーブルチェック） |
| **Quarantineテーブルの履歴** | ⚠️ 上書きされる（毎回失われる） | ✅ 手動で管理可能（Appendモード） | ⚠️ 上書きされる（毎回失われる） |

---

## シルバー層におけるマテリアライズドビュー (MV) とテーブルの使い分け

Databricksのシルバー層では、一般的に**マテリアライズドビュー (Materialized View; MV)** の使用が推奨されます。  
これは、分析のためのデータ変換（クレンジング、エンリッチ、非正規化）を宣言的かつ効率的に行うことができ、  
**パフォーマンスと管理の手間を大幅に削減できる**ためです。

以下に、それぞれの特徴と選択基準をまとめます。

### マテリアライズドビュー (Materialized View: MV) を選択すべき理由

- **パフォーマンスの向上**  
  MVはクエリ結果を物理的に保存（キャッシュ）するため、複雑な結合や集計を含むクエリの実行速度が大幅に向上します。  
  シルバー層以降の分析クエリの高速化に最適です。

- **増分更新の自動化**  
  ソーステーブルの変更に応じて、Databricksが自動的かつ増分的にMVを更新します。  
  これにより、手動での複雑なETLパイプライン管理（MERGE操作など）が不要になります。

- **コスト効率**  
  必要な変更のみを計算するため、テーブル全体の再構築よりも処理コストと時間を削減できます。

- **シンプルさ**  
  宣言的なSQL構文やDLTの宣言的パイプラインで構築でき、運用管理が簡素化されます。

### マネージドテーブル (Managed Table) を選択すべき理由

- **リアルタイムの鮮度が必要な場合**  
  MVの更新は非同期で行われるため、常にミリ秒単位の最新データが必要な低レイテンシーのユースケースには向きません。

- **特定のDelta機能が必要な場合**  
  現在、MVは**タイムトラベル**や**変更データフィード (Change Data Feed; CDF)** などの一部のDelta Lake機能に対応していません。  
  これらの機能が必須な場合は、マネージドテーブルを直接管理する必要があります。

- **複雑すぎるクエリ**  
  MVは一部の複雑なクエリ（特定の関数や多数の結合など）をサポートしていない場合があります。  
  ただし、シルバー層の一般的なクレンジングやエンリッチメントのユースケースでは問題になることは稀です。

### 結論

- シルバー層の目的が **データのクレンジング、エンリッチメント、分析準備** であり、  
  BIダッシュボードやダウンストリームの分析を高速化したい場合は、**マテリアライズドビューが最適な選択肢**です。
- Databricksは、**MVとストリーミングテーブルを組み合わせることで、効率的な宣言型パイプラインの構築**を推奨しています。
- MVで要件を満たせない（例: 厳密なリアルタイム性、特定のDelta機能が必須）場合にのみ、  
  従来のマネージドテーブルと手動のETLプロセスを検討してください。

---

## 推奨事項

### 方式1（_dlt + リネーム）を推奨する場合

- **本番環境で安全に移行したい場合**
  - ロールバックが容易
  - 既存テーブルへの影響がない
  - 段階的な移行が可能

- **DLTパイプラインの機能を最大限活用したい場合**
  - DLTのExpectations機能、自動最適化、モニタリングを活用したい
  - パイプライン実行履歴やメトリクスを活用したい

- **既存のワークフローやダッシュボードに影響を与えたくない場合**
  - DLTパイプラインは`_dlt`テーブルに書き込むため、既存テーブルに影響なし
  - データ確認後にリネームするため、安全

### 方式2（DLTなし）を推奨する場合

- **DLTパイプラインの機能が不要な場合**
  - シンプルな処理フローを重視
  - 実行時間を短縮したい
  - リネーム処理の複雑さを避けたい

- **小規模なデータセットや開発環境**
  - パフォーマンスへの影響が少ない
  - ロールバックの必要性が低い

### 方式3（DLT + 直接書き込み）を推奨する場合

- **DLTパイプラインの機能を活用しつつ、シンプルな処理フローを実現したい場合**
  - DLTのExpectations機能、自動最適化、モニタリングを活用したい
  - リネーム処理を避けたい

- **既存テーブルへの影響を許容できる場合**
  - 処理中にテーブルがロックされても問題ない
  - 既存のワークフローやダッシュボードへの影響を許容できる

- **DLTパイプライン内での複雑な処理を実装できる場合**
  - 既存テーブルを読み込んで統合する処理を実装できる
  - SCD Type 2の履歴管理をDLTパイプライン内で実装できる

---

## Quarantineテーブルの動作について（全方式共通）

### DLTパイプラインでのQuarantineテーブルの動作

**重要**: 方式1と方式3では、Quarantineテーブルは**毎回DLTパイプライン実行時に上書きされます**。

- **Quarantineテーブルの生成**: DLTパイプライン実行時に、無効なデータが検出されると、`quarantine_*`テーブルが作成または更新されます
- **Quarantineテーブルの上書き**: DLTパイプラインの`@dlt.table`デコレータは、デフォルトで**上書き（overwrite）モード**で動作します
  - つまり、**毎回DLTパイプラインを実行すると、Quarantineテーブルは上書きされ、過去のQuarantineデータが失われます**

**現在の実装例**:
```python
@dlt.table(
    name="quarantine_opportunity",
    comment="無効な商談データ（検証に失敗したレコード）"
)
def quarantine_opportunity():
    # 無効なレコードをフィルタリングして返す
    # このテーブルは毎回上書きされる
    return filter_invalid_records(invalid_df)
```

### Quarantineテーブルの履歴を保持する方法

1. **Quarantineテーブルを手動でバックアップ**
   - DLTパイプライン実行前に、既存のQuarantineテーブルをバックアップ
   - または、Quarantineテーブルを別の履歴テーブルにコピー

2. **Quarantineテーブルを別途管理**
   - DLTパイプライン外で、Quarantineテーブルを管理
   - 例: DLTパイプライン実行後に、Quarantineテーブルを履歴テーブルに統合

3. **QuarantineテーブルをAppendモードで管理（方式2のみ可能）**
   - 方式2（DLTパイプラインを使わない）では、手動でAppendモードを指定可能
   - 例: `invalid_df.write.format("delta").mode("append").saveAsTable("quarantine_opportunity")`

### 方式別のQuarantineテーブルの動作

| 方式 | Quarantineテーブルの動作 | 履歴保持 |
|------|-------------------------|---------|
| **方式1** | 毎回DLTパイプライン実行時に上書き | ❌ 失われる（別途管理が必要） |
| **方式2** | 手動でAppendモードを指定可能 | ✅ 可能（Appendモードで実装） |
| **方式3** | 毎回DLTパイプライン実行時に上書き | ❌ 失われる（別途管理が必要） |

## 実装の考慮事項

### 方式3を実装する場合の注意点

1. **DLTパイプライン内での既存テーブル読み込み**
   - 既存テーブルが存在する場合と存在しない場合の処理を分岐
   - 初回実行時は全レコードが新規として扱われる

2. **履歴レコードの保持**
   - DLTパイプラインは通常、テーブルを上書き（overwrite）する
   - 履歴レコード（`is_current=0`）を保持するには、既存の履歴レコードも含めて返す必要がある

3. **変更検出の実装**
   - ハッシュ値の生成と変更検出のロジックを実装
   - 既存の `is_current=1` レコードと新規データを比較

4. **パフォーマンス最適化**
   - 既存テーブル全体を読み込むため、パフォーマンスへの影響を考慮
   - 大規模なテーブルの場合、処理時間が長くなる可能性

5. **エラーハンドリング**
   - DLTパイプライン内で既存テーブルを読み込む処理が失敗した場合の処理を実装
   - 部分的な更新が発生しないようにトランザクション管理

6. **ロールバック戦略**
   - 履歴レコード（`is_current=0`）から復元する方法を検討
   - トランザクションログから復元する方法を検討

---

## 結論

3つの方式とも実装可能ですが、以下の点を考慮して選択することを推奨します：

- **方式1（_dlt + リネーム）**: 本番環境で安全に移行し、DLTパイプラインの機能を最大限活用したい場合
- **方式2（DLTなし）**: シンプルな処理フローを重視し、DLTパイプラインの機能が不要な場合
- **方式3（DLT + 直接書き込み）**: DLTパイプラインの機能を活用しつつ、シンプルな処理フローを実現したい場合（ただし、実装が複雑）

**推奨**: 
- **本番環境**: 方式1を推奨（安全性とロールバックの容易さ）
- **開発環境や小規模データセット**: 方式2を推奨（シンプルさ）
- **DLT機能を活用しつつシンプルにしたい場合**: 方式3を検討（ただし、実装の複雑さを考慮）

