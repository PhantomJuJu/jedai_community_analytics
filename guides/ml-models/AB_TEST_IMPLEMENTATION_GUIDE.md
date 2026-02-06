# A/Bテスト結果テーブル実装ガイド

## 概要

このガイドでは、アップセル・クロスセル推奨モデルのA/Bテスト結果を記録・分析するための実装について説明します。

## 目的

- **推奨商品を提示した場合の成約率を追跡**
- **推奨商品を提示しなかった場合（コントロールグループ）との比較**
- **推奨商品の提示による売上へのインパクト測定**

## 実装されたスクリプト

### 1. テーブル作成スクリプト

**ファイル**: `../scripts/04_gold/11_upsell_crosssell_ab_test_results.py`

**役割**: A/Bテスト結果を記録するテーブル `sf_poc.gold.upsell_crosssell_ab_test_results` を作成

**実行方法**:
```python
# Databricks Notebook で実行
# パラメータ:
# - catalog_name: カタログ名（デフォルト: "sf_poc"）
```

### 2. A/Bテスト結果記録スクリプト

**ファイル**: `../scripts/05_models/21_upsell_crosssell_ab_test_recording.py`

**役割**: 
- 推奨結果テーブルから推奨商品を取得
- ランダムに treatment（推奨提示）グループと control（非提示）グループに分割
- A/Bテスト結果テーブルに記録

**実行方法**:
```python
# Databricks Notebook で実行
# パラメータ:
# - env: 環境（デフォルト: "dev"）
# - proc_date: 処理日（デフォルト: "2025-11-25"）
# - catalog_name: カタログ名（デフォルト: "sf_poc"）
# - test_id: テストID（必須、例: "test_2025_01"）
# - test_start_date: テスト開始日（空欄 = 今日）
# - treatment_ratio: Treatmentグループの比率（デフォルト: 0.5 = 50%）
```

**使用例**:
```
test_id = "test_2025_01"
test_start_date = "2025-01-15"
treatment_ratio = 0.5  # 50% を treatment グループに
```

### 3. A/Bテスト結果評価・分析スクリプト

**ファイル**: `../scripts/05_models/22_upsell_crosssell_ab_test_evaluation.py`

**役割**:
- 実際の購入結果（商談・契約）をA/Bテスト結果テーブルに反映
- Treatment グループと Control グループの成約率を比較
- 売上インパクトを測定

**実行方法**:
```python
# Databricks Notebook で実行
# パラメータ:
# - env: 環境（デフォルト: "dev"）
# - proc_date: 処理日（デフォルト: "2025-11-25"）
# - catalog_name: カタログ名（デフォルト: "sf_poc"）
# - test_id: テストID（必須、例: "test_2025_01"）
# - lookback_days: 購入検出の遡り日数（デフォルト: 90日）
```

## テーブル構造

### `sf_poc.gold.upsell_crosssell_ab_test_results`

| カラム名 | 型 | 説明 |
|---------|-----|------|
| `test_id` | STRING | A/Bテストの識別子（例: "test_2025_01"） |
| `test_start_date` | DATE | テスト開始日 |
| `test_end_date` | DATE | テスト終了日（NULL = 進行中） |
| `account_id` | STRING | 取引先ID |
| `product_id` | STRING | 商品ID |
| `product_name` | STRING | 商品名 |
| `test_group` | STRING | "treatment"（推奨提示）または "control"（非提示） |
| `recommendation_rank` | INT | 推奨順位（1-5、treatment グループのみ） |
| `purchase_score` | DOUBLE | 購入確率スコア（0-1、treatment グループのみ） |
| `recommendation_date` | DATE | 推奨提示日（treatment グループのみ） |
| `is_purchased` | BOOLEAN | 購入したかどうか（NULL = 未確定） |
| `purchase_date` | DATE | 購入日 |
| `purchase_amount` | DECIMAL(18,2) | 購入金額 |
| `opportunity_id` | STRING | 関連する商談ID |
| `created_at` | TIMESTAMP | レコード作成日時 |
| `updated_at` | TIMESTAMP | レコード更新日時 |
| `customer_segment` | STRING | 顧客セグメント（オプション） |
| `product_category` | STRING | 商品カテゴリ（オプション） |
| `notes` | STRING | 備考・メモ |

**パーティション**: `test_id`, `test_start_date`

## 実行フロー

### ステップ1: テーブル作成

```python
# 初回のみ実行
# ../scripts/04_gold/11_upsell_crosssell_ab_test_results.py を実行
```

### ステップ2: A/Bテスト開始（結果記録）

```python
# 新規A/Bテストを開始する場合
# ../scripts/05_models/21_upsell_crosssell_ab_test_recording.py を実行
# パラメータ:
#   - test_id: "test_2025_01"（新規テストID）
#   - test_start_date: "2025-01-15"
#   - treatment_ratio: 0.5
```

### ステップ3: 購入結果の更新と評価

```python
# 定期的に実行（例: 週次）
# ../scripts/05_models/22_upsell_crosssell_ab_test_evaluation.py を実行
# パラメータ:
#   - test_id: "test_2025_01"
#   - lookback_days: 90（過去90日間の購入を検出）
```

## 評価指標

### 1. 成約率（Purchase Rate）

```
Treatment グループの成約率 = Treatment グループの購入数 / Treatment グループの総数
Control グループの成約率 = Control グループの購入数 / Control グループの総数
```

### 2. 成約率リフト（Purchase Rate Lift）

```
成約率リフト（絶対値）= Treatment 成約率 - Control 成約率
成約率リフト（相対値）= (Treatment 成約率 / Control 成約率 - 1) × 100%
```

### 3. 売上インパクト（Revenue Impact）

```
売上リフト（絶対値）= Treatment グループの総売上 - Control グループの総売上
売上リフト（相対値）= (Treatment グループの総売上 / Control グループの総売上 - 1) × 100%
```

## 使用例

### 例1: 新規A/Bテストの開始

```python
# 1. テーブル作成（初回のみ）
# 11_upsell_crosssell_ab_test_results.py を実行

# 2. A/Bテスト開始
# 21_upsell_crosssell_ab_test_recording.py を実行
# パラメータ:
#   test_id = "test_2025_01"
#   test_start_date = "2025-01-15"
#   treatment_ratio = 0.5
```

### 例2: 既存テストの継続（追加レコード）

```python
# 既存の test_id を指定して実行
# 21_upsell_crosssell_ab_test_recording.py を実行
# パラメータ:
#   test_id = "test_2025_01"  # 既存のテストID
#   treatment_ratio = 0.5
```

### 例3: 購入結果の更新と評価

```python
# 週次で実行
# 22_upsell_crosssell_ab_test_evaluation.py を実行
# パラメータ:
#   test_id = "test_2025_01"
#   lookback_days = 90
```

## 注意事項

### 1. テストIDの命名規則

- 一意性を保つため、日付やバージョンを含めることを推奨
- 例: `test_2025_01`, `test_2025_01_v2`, `test_2025_q1_product_a`

### 2. ランダム分割の再現性

- ランダム分割は `test_id` をシードとして使用しているため、同じ `test_id` で実行すると同じ分割結果になります
- 異なる分割結果が必要な場合は、新しい `test_id` を使用してください

### 3. 購入結果の検出期間

- `lookback_days` パラメータで、過去何日間の購入を検出するかを指定できます
- デフォルトは 90 日ですが、テスト期間に応じて調整してください

### 4. 統計的有意性

- 現在の実装では、基本的な統計（成約率、売上）のみを計算しています
- 統計的有意性検定（t検定、カイ二乗検定など）が必要な場合は、追加の分析スクリプトを作成してください

### 5. データ品質

- 購入結果の検出は、商談（Opportunity）の `IsWon = true` と `CloseDate` に基づいています
- データ品質が低い場合、購入結果が正しく検出されない可能性があります

## 今後の拡張項目

### 1. 週次モニタリング

- 週次で自動的に評価を実行するワークフロー
- Precision@K の推移
- モデルスコアの分布変化（データドリフト検知）

### 2. 統計的有意性検定

- t検定、カイ二乗検定の実装
- 信頼区間の計算

### 3. フィードバックループ

- 実際の購入結果を学習データに反映
- 定期的なモデル再学習の自動化

### 4. ダッシュボード連携

- A/Bテスト結果を可視化するダッシュボード
- リアルタイムでのモニタリング

## 関連ドキュメント

- `../solutions/ソリューション（MLモデル）ガイド.md` - アップセル・クロスセル推奨モデルの全体像
- `../scripts/05_models/01_upsell_crosssell_inference.py` - 推論スクリプト
- `../scripts/05_models/20_upsell_crosssell_training.py` - モデル学習スクリプト

