# ダッシュボード指標の算出ロジック

このドキュメントでは、ダッシュボードで表示している各指標がどのように算出されているかを説明します。

## 目次

1. [リスク関連指標](#リスク関連指標)
   - risk_score
   - risk_level
   - risk_factor_1, risk_factor_2, risk_factor_3
   - priority_level
2. [確率・予測関連指標](#確率予測関連指標)
   - win_probability
   - upsell_probability
   - crosssell_probability
   - priority_score
3. [売上関連指標](#売上関連指標)
   - actual_revenue
   - expected_revenue
   - bestcase_revenue
   - worstcase_revenue
   - moderate_case_revenue
   - 四半期別確度別売上（prob_90_plus, prob_70_90, prob_50_70, prob_30_50）
   - predicted_revenue
   - opportunity_count
   - achievement_rate（達成率）
   - variance_to_target（ターゲットとの乖離）

---

## リスク関連指標

### risk_score（リスクスコア）

**データソース**: `sf_poc.gold.churn_risk_predictions` テーブル

**算出ロジック**:
1. **基本スコア算出** (`../scripts/05_models/02_churn_risk_inference.py`):
   - MLflow に登録されたモデル（ロジスティック回帰 or LightGBM）から、  
     各商談の「失注確率」を `churn_risk_score` (0.0〜1.0) として取得:
   ```python
   # MLflow からモデルをロードして推論（簡略イメージ）
   ml_model = mlflow_spark.load_model("models:/churn_risk_model/Production")
   pred_df = ml_model.transform(feature_df)
   churn_risk_score = pred_df["probability"][:, 1]  # クラス1=失注の確率
   ```
   - モデルが利用できない場合のみ、従来のルールベースロジック（ステージ変更回数・金額変動率・経過日数など）にフォールバック。

2. **スコア変換** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
   - `risk_score = churn_risk_score * 100` (0〜100の範囲に変換)

**使用する特徴量**:
- `stage_change_count`: ステージ変更回数 (`sf_poc.gold.opportunity_features`)
- `amount_variance`: 金額変動率 (`sf_poc.gold.opportunity_features`)
- `days_since_created`: 作成から経過日数 (`sf_poc.gold.opportunity_features`)
- `days_until_close`: 締切日までの日数 (`sf_poc.gold.opportunity_features`)

**特徴量の算出元**:
- `stage_change_count`: `sf_poc.silver.silver_opportunity_history_cleaned` から `COUNT(DISTINCT StageName)` で集計
- `amount_variance`: `(max_amount_in_history - min_amount_in_history) / max_amount_in_history`
- `days_since_created`: `DATEDIFF(CURRENT_DATE(), CreatedDate)`
- `days_until_close`: `DATEDIFF(CloseDate, CURRENT_DATE())`

---

### risk_level（リスクレベル）

**データソース**: `sf_poc.gold.churn_risk_predictions` テーブル

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
CASE 
    WHEN cr.churn_risk_category = '高' THEN 'Critical'
    WHEN cr.churn_risk_category = '中' THEN 'High'
    ELSE 'Medium'
END AS risk_level
```

**元のカテゴリ算出** (`../scripts/05_models/02_churn_risk_inference.py`):
```python
CASE
    WHEN churn_risk_score >= 0.7 THEN '高'
    WHEN churn_risk_score >= 0.4 THEN '中'
    ELSE '低'
END AS churn_risk_category
```

**マッピング**:
- `churn_risk_score >= 0.7` (risk_score >= 70) → `'Critical'`
- `churn_risk_score >= 0.4` (risk_score >= 40) → `'High'`
- `churn_risk_score < 0.4` (risk_score < 40) → `'Medium'`

---

### survival_prob_30d, survival_prob_60d, survival_prob_90d（サバイバル生存確率）

**データソース**: 
- `sf_poc.gold.churn_risk_survival` テーブル  
- および同カラムを含む `sf_poc.gold.churn_risk_predictions` テーブル

**算出ロジック** (`../scripts/05_models/13_churn_risk_survival_analysis.py`):

1. **サバイバル用データセットの作成**:
   - 元テーブル: `sf_poc.gold.opportunity_features`, `sf_poc.gold.activity_features`
   - 主要カラム:
     - `duration_days`:
       ```sql
       CASE 
         WHEN is_closed = true 
           THEN DATEDIFF(CAST(close_date AS DATE), CAST(created_date AS DATE))
         ELSE DATEDIFF(CURRENT_DATE, CAST(created_date AS DATE))
       END
       ```
     - `event_lost`:
       ```sql
       CASE 
         WHEN is_closed = true AND is_won = false THEN 1
         ELSE 0
       END
       ```
     - 説明変数（共変量）:
       - `stage_duration_days`, `opportunity_age_days`, `days_since_last_activity`
       - `activity_count_last_30days`, `weekly_activity_frequency`
       - `task_count_last_30days`, `open_task_count`, `overdue_task_count`
       - `event_count_last_30days`, `meeting_count_last_30days`
       - `amount_variance`, `history_record_count`, `stage_change_count`

2. **CoxPH モデルの学習**:
   - `lifelines.CoxPHFitter` を用いて、クローズ済み商談（`is_closed = true`）のみで学習。
   - `duration_col = 'duration_days'`, `event_col = 'event_lost'`。

3. **進行中商談の生存確率予測**:
   - `is_closed = false` の商談に対して、
   ```python
   survival_prob_30d = cph.predict_survival_function(X, times=[30])
   survival_prob_60d = cph.predict_survival_function(X, times=[60])
   survival_prob_90d = cph.predict_survival_function(X, times=[90])
   ```
   - 得られた確率を `sf_poc.gold.churn_risk_survival` に保存し、  
     さらに `sf_poc.gold.churn_risk_predictions` に JOIN して `survival_prob_30d/60d/90d` カラムとして利用。

**解釈**:
- `survival_prob_30d`:
  - 「今後30日間、この商談が **失注せずに進行し続ける** 確率」
- `1 - survival_prob_30d`:
  - 「今後30日以内に **失注しそう** である度合い」の補助指標として利用可能。

---

### hybrid_risk_score（ハイブリッドリスクスコア）

**データソース**: `sf_poc.gold.churn_risk_predictions` テーブル

**算出ロジック** (`../scripts/05_models/13_churn_risk_survival_analysis.py`):

- MLモデルによる失注確率とサバイバル生存確率を組み合わせた補助的なリスクスコア。

```python
hybrid_risk_score = (
    churn_risk_score * 0.6
    + (1.0 - survival_prob_30d) * 0.4
)
```

- `churn_risk_score`: MLモデル（ロジスティック回帰 or LightGBM）による失注確率（0〜1）
- `survival_prob_30d`: 今後30日間の生存確率（0〜1）
- `1 - survival_prob_30d`: 「30日以内に失注しそうな度合い」

**解釈**:
- `hybrid_risk_score` は 0〜1 の連続値で、
  - 「**モデルが見ている静的な特徴量ベースの失注確率**」と
  - 「**時間軸（あと30日以内に落ちそうか）**」
  を加味した総合的なリスクスコアとして利用できる。
- ダッシュボード上では、既存の `risk_score`（= `churn_risk_score * 100`）と併せて比較表示したり、  
  将来的に `risk_score` をこのハイブリッド版に置き換える検討も可能。

---

### risk_factor_1, risk_factor_2, risk_factor_3（リスク要因）

**データソース**: `sf_poc.gold.churn_risk_explanations` テーブル

**算出ロジック**:

1. **SHAP値の計算** (`../scripts/05_models/11_churn_risk_explainability.py`):

   学習済みの失注リスクモデル（もしくは説明用に再学習した LightGBM モデル）に対して、
   Gold層の特徴量を用いて SHAP TreeExplainer を適用し、各商談・各特徴量ごとの SHAP 値を計算します。

2. **主要リスク要因トップ3の抽出**:

   ```python
   shap_abs = np.abs(shap_values_for_loss)
   order = np.argsort(shap_abs[i])[::-1]
   risk_factor_1 = feature_cols[order[0]]
   risk_factor_2 = feature_cols[order[1]]
   risk_factor_3 = feature_cols[order[2]]
   ```

   - 行ごとに \|SHAP値\| が大きい特徴量上位3件を `risk_factor_1〜3` として保存
   - 出力先テーブル: `sf_poc.gold.churn_risk_explanations`

3. **ダッシュボード用ビューでの利用** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):

   ```sql
   LEFT JOIN sf_poc.gold.churn_risk_explanations ex ON o.Id = ex.opportunity_id

   ex.risk_factor_1 AS risk_factor_1,
   ex.risk_factor_2 AS risk_factor_2,
   ex.risk_factor_3 AS risk_factor_3
   ```

   - `sf_poc.gold.gold_sales_rep_recommended_actions` ビュー内で JOIN し、  
     マイアクションダッシュボードの `risk_factor_1〜3` として利用

**リスク要因の例（特徴量名）**:
- `days_since_last_activity`: 最終アクティビティからの経過日数
- `activity_count_last_30days`: 直近30日の活動回数
- `stage_duration_days`: 現ステージでの滞留日数
- `opportunity_age_days`: 商談開始からの経過日数
- `amount_variance`: 商談金額の変動率
- `task_count_last_30days`, `open_task_count`, `overdue_task_count`: タスクの量・滞留状況
- `meeting_count_last_30days`, `event_count_last_30days`: 面談（イベント）頻度

---

### priority_level（優先度レベル）

**注意**: 現在のコードでは `priority_level` というカラムは直接定義されていませんが、`priority_score` に基づいて以下のように分類できます。

**データソース**: `sf_poc.gold.gold_sales_rep_recommended_actions` ビューの `priority_score` カラム

**priority_score の算出ロジック**: 詳細は [priority_score（優先度スコア）](#priority_score優先度スコア) を参照

**推奨される priority_level 分類** (実装されていない場合の参考):
```sql
CASE
    WHEN priority_score >= 100 THEN 'Critical'
    WHEN priority_score >= 50 THEN 'High'
    WHEN priority_score >= 20 THEN 'Medium'
    ELSE 'Low'
END AS priority_level
```

**注意**: `priority_score` は用途によって算出方法が異なります（失注リスクベースまたはアップセル・クロスセルベース）。詳細は [priority_score（優先度スコア）](#priority_score優先度スコア) を参照してください。

---

### pass_rate / quarantine_rate（データ品質指標）

**データソース**: `sf_poc.gold.data_quality_summary` ビュー（`../scripts/06_dashboards/01_create_dashboard_views.sql` セクション5）

**算出ロジック**:

- 各オブジェクトの本番テーブル（例: `sf_poc.silver.silver_opportunity_cleaned`）と  
  対応する Quarantineテーブル（例: `sf_poc.silver.quarantine_opportunity`）から集計

```sql
-- 例: Opportunity の場合
total_records      = COUNT(*)                                 -- silver_opportunity_cleaned
quarantine_records = (SELECT COUNT(*) FROM sf_poc.silver.quarantine_opportunity)
passed_records     = total_records - quarantine_records

pass_rate       = CASE WHEN total_records = 0 THEN 0
                  ELSE passed_records * 100.0 / total_records END
quarantine_rate = CASE WHEN total_records = 0 THEN 0
                  ELSE quarantine_records * 100.0 / total_records END
```

**意味**:
- `pass_rate`:
  - Silverクレンジングを通過したレコードの割合（高いほどデータ品質が良い）
- `quarantine_rate`:
  - Quarantineに送られたレコードの割合（高いほどルール見直しや元データ修正が必要）

**ダッシュボードでの利用**:
- `scripts/06_dashboards/07_data_quality_dashboard.sql` で以下の用途に利用:
  - オブジェクト別データ品質サマリー（テーブル）
  - Pass rate / Quarantine率の棒グラフ
  - Quarantine率が閾値を超えるオブジェクトの検出

---

## 確率・予測関連指標

### win_probability（成約確度）

**データソース**: `sf_poc.gold.win_probability_predictions` テーブルの `win_probability` カラム

**算出ロジック** (`../scripts/05_models/04_win_probability_inference.py`):
1. **MLflowモデルによる推論**（推奨）:
   - MLflowに登録されたロジスティック回帰モデル（`sf_poc.feature_store.win_probability_model`）を使用
   - 特徴量（`opportunity_features` + `activity_features`）を入力として、成約確率（0〜1）を予測
   ```python
   ml_model = mlflow_spark.load_model("models:/sf_poc.feature_store.win_probability_model@staging")
   pred_df = ml_model.transform(feature_df)
   win_probability = pred_df["probability"][:, 1]  # クラス1=成約の確率
   ```

2. **ルールベースフォールバック**（モデルが利用できない場合）:
   ```python
   CASE
       WHEN stage_name IN ('Closed Won', 'Negotiation/Review') THEN 0.9
       WHEN stage_name IN ('Proposal/Price Quote', 'Value Proposition') THEN 0.7
       WHEN stage_name IN ('Qualification', 'Needs Analysis') THEN 0.5
       WHEN stage_name IN ('Prospecting') THEN 0.3
       ELSE 0.2
   END AS win_probability
   ```

**使用する特徴量**:
- `opportunity_features`: 商談特徴量（金額、ステージ、履歴情報など）
- `activity_features`: 活動特徴量（活動頻度、最終活動日など）

**データの流れ**:
1. Silver層: `sf_poc.silver.silver_opportunity_cleaned` (商談データ)
2. Gold層: `sf_poc.gold.opportunity_features` + `sf_poc.gold.activity_features` (特徴量)
3. Gold層: `sf_poc.gold.win_probability_predictions` (予測結果)
4. Gold層: ダッシュボードビューで使用

**関連カラム** (`sf_poc.gold.win_probability_predictions` テーブル):
- `win_probability`: 成約確度（成約確率、0〜1のDOUBLE型、MLモデルが予測した確率値）
- `predicted_close_date`: 予測締切日（DATE型、商談の平均成約日数から算出、またはCloseDateをそのまま使用）
- `confidence_interval_lower`: 信頼区間の下限値（DOUBLE型、簡易版として `win_probability - 0.1` を計算）
- `confidence_interval_upper`: 信頼区間の上限値（DOUBLE型、簡易版として `win_probability + 0.1` を計算）
- `probability_category`: 確度カテゴリ（STRING型、Very High (90%+)/High (70-90%)/Medium (50-70%)/Low (30-50%)/Very Low (<30%)）
- `prediction_date`: 予測を実行した日時（TIMESTAMP型、推論スクリプト実行日時）

---

### upsell_probability（アップセル確率）

**データソース**: `sf_poc.gold.gold_priority_existing_customers` ビュー

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
MAX(r.purchase_score) AS upsell_probability
```

**ロジックの詳細**:
- `gold_upsell_crosssell_recommendations`テーブルの`purchase_score`（購入スコア）の最大値を`upsell_probability`として使用
- `purchase_score`は機械学習モデル（GBT）の`rawPrediction`から算出された相対スコア
- 顧客ごとに複数の推奨商品がある場合、最も高いスコアを採用

**使用するデータ**:
- `purchase_score`: 購入スコア (`sf_poc.gold.gold_upsell_crosssell_recommendations`)

**purchase_score の算出ロジック** (`../scripts/05_models/01_upsell_crosssell_inference.py`):
```python
# GBTモデルのrawPredictionからスコアを抽出
get_raw_score_udf(F.col("rawPrediction"))
```

**データの流れ**:
1. Silver層: `sf_poc.silver.silver_opportunity_cleaned` (商談データ)
2. Gold層: `sf_poc.gold.customer_features` (顧客特徴量)
3. Gold層: `sf_poc.gold.gold_upsell_crosssell_recommendations` (推論結果)
4. Gold層: `sf_poc.gold.gold_priority_existing_customers` (ビュー、upsell_probabilityを計算)

---

### crosssell_probability（クロスセル確率）

**データソース**: `sf_poc.gold.gold_priority_existing_customers` ビュー

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
CAST(NULL AS DOUBLE) AS crosssell_probability
```

**ロジックの詳細**:
- 現状は`NULL`として設定（将来のクロスセルモデル追加時に利用予定）
- 将来的には、クロスセル専用の機械学習モデルから算出される予定

**使用するデータ**:
- 現状は使用されていない（将来実装予定）

**データの流れ**:
1. Silver層: `sf_poc.silver.silver_contact_cleaned` (連絡先データ)
2. Silver層: `sf_poc.silver.silver_opportunity_cleaned` (商談データ)
3. Gold層: `sf_poc.gold.customer_features` (顧客特徴量)
4. Gold層: `sf_poc.gold.gold_upsell_crosssell_recommendations` (推論結果)
5. Gold層: `sf_poc.gold.gold_priority_existing_customers` (ビュー、crosssell_probabilityは現状NULL)

---

### priority_score（優先度スコア）

**データソース**: 用途によって異なる

**算出ロジック**:

1. **失注リスクベース** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
   ```sql
   (cr.churn_risk_score * 100 * o.Amount / 1000000) AS priority_score
   ```
   - `risk_score * Amount / 1,000,000` で算出
   - リスクスコアが高く、金額が大きい商談ほど優先度が高い

2. **アップセル・クロスセルベース** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
   ```sql
   GREATEST(ucp.upsell_probability, ucp.crosssell_probability) * 100 AS priority_score
   ```
   - アップセル確率とクロスセル確率の大きい方 × 100
   - 確率が高い顧客ほど優先度が高い

**使用するデータ**:
- 失注リスクベース: `sf_poc.gold.gold_churn_risk_predictions` + `sf_poc.silver.silver_opportunity_cleaned`
- アップセル・クロスセルベース: `sf_poc.gold.gold_priority_existing_customers` (upsell_probability, crosssell_probabilityを含む)

---

## 売上関連指標

### actual_revenue（実績売上）

**データソース**: 
- `sf_poc.silver.silver_opportunity_cleaned` テーブル（直接集計）
- `sf_poc.gold.monthly_revenue_forecast` ビューの `actual_revenue` カラム（月次）
- `sf_poc.gold.quarterly_revenue_forecast` ビューの `actual_revenue` カラム（四半期）
- `sf_poc.gold.annual_revenue_forecast` ビューの `h1_actual` カラム（年度）

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 月別実績
SUM(o.Amount) AS actual_revenue
FROM sf_poc.silver.silver_opportunity_cleaned o
WHERE o.IsClosed = true
  AND o.IsWon = true
  AND o.is_current = 1
  AND o.CloseDate >= DATEADD(MONTH, -6, CURRENT_DATE())
GROUP BY DATE_TRUNC('MONTH', o.CloseDate)

-- 四半期別実績
SUM(CASE WHEN o.IsClosed AND o.IsWon THEN o.Amount ELSE 0 END) AS actual_revenue

-- 年度別実績（H1のみ）
SUM(CASE 
    WHEN o.IsClosed AND o.IsWon 
         AND MONTH(o.CloseDate) BETWEEN 1 AND 6 
    THEN o.Amount 
    ELSE 0 
END) AS h1_actual
```

**条件**:
- `IsClosed = true`: 商談がクローズ済み
- `IsWon = true`: 商談が獲得済み
- `is_current = 1`: 現在有効なレコード（SCD Type 2）
- `CloseDate`: 指定期間内の締切日

**関連カラム**:
- **月次**: `sf_poc.gold.monthly_revenue_forecast.actual_won_count` - 当該月に成約した商談の実績件数（過去実績のみ）

**データの流れ**:
1. Bronze層: `sf_poc.bronze.bronze_opportunity_raw` (生データ)
2. Silver層: `sf_poc.silver.silver_opportunity_cleaned` (クレンジング済み)
3. Gold層: ダッシュボードビューで集計（`monthly_revenue_forecast`, `quarterly_revenue_forecast`, `annual_revenue_forecast`）

---

### expected_revenue（期待売上）

**データソース**: 
- `sf_poc.gold.monthly_revenue_forecast` ビュー（月次）
- `sf_poc.gold.quarterly_revenue_forecast` ビュー（四半期）
- `sf_poc.gold.annual_revenue_forecast` ビュー（年度）

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):

1. **月次期待売上**:
   ```sql
   -- 確度ベース見込み（Amount × win_probability の合計）
   SUM(o.Amount * wp.win_probability) AS expected_revenue
   FROM sf_poc.silver.silver_opportunity_cleaned o
   JOIN sf_poc.gold.win_probability_predictions wp ON o.Id = wp.opportunity_id
   WHERE NOT o.IsClosed
     AND o.is_current = 1
     AND COALESCE(wp.predicted_close_date, o.CloseDate) >= CURRENT_DATE()
   GROUP BY DATE_TRUNC('MONTH', COALESCE(wp.predicted_close_date, o.CloseDate))
   ```

2. **四半期期待売上**:
   ```sql
   -- 実績 + 確度別予測の合計
   SUM(CASE 
       WHEN o.IsClosed AND o.IsWon THEN o.Amount 
       WHEN NOT o.IsClosed THEN o.Amount * wp.win_probability
       ELSE 0 
   END) AS expected_revenue
   ```

3. **年度期待売上** (`sf_poc.gold.annual_revenue_forecast` ビュー):
   ```sql
   -- H1実績 + H2予測
   COALESCE(aa.actual_revenue, 0) + cf.expected_revenue AS full_year_expected
   ```
   - `h1_actual`: 上半期（H1、1月〜6月）の実績売上金額（DECIMAL型、過去実績のみ）
   - `full_year_expected`: 通期の期待売上金額（DOUBLE型、H1実績 + H2予測、または過去年度の実績）

**使用するデータ**:
- `win_probability`: 成約確度 (`sf_poc.gold.win_probability_predictions`)
- `Amount`: 商談金額 (`sf_poc.silver.silver_opportunity_cleaned`)
- `predicted_close_date`: 予測締切日 (`sf_poc.gold.win_probability_predictions`)

**データの流れ**:
1. Gold層: `sf_poc.gold.win_probability_predictions` (成約確度予測)
2. Silver層: `sf_poc.silver.silver_opportunity_cleaned` (商談データ)
3. Gold層: `sf_poc.gold.monthly_revenue_forecast` / `quarterly_revenue_forecast` / `annual_revenue_forecast` (集計ビュー)
4. ダッシュボードで表示

---

### bestcase_revenue（ベストケース売上）

**データソース**: 
- `sf_poc.gold.monthly_revenue_forecast` ビューの `best_case_revenue` カラム
- `sf_poc.gold.quarterly_revenue_forecast` ビューの `best_case_revenue` カラム
- `sf_poc.gold.annual_revenue_forecast` ビューの `full_year_best_case` カラム

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 確度30%以上の商談金額を合計（楽観的な予測）
SUM(CASE WHEN wp.win_probability >= 0.3 THEN o.Amount ELSE 0 END) AS best_case_revenue
FROM sf_poc.silver.silver_opportunity_cleaned o
JOIN sf_poc.gold.win_probability_predictions wp ON o.Id = wp.opportunity_id
WHERE NOT o.IsClosed
  AND o.is_current = 1
  AND COALESCE(wp.predicted_close_date, o.CloseDate) >= CURRENT_DATE()
GROUP BY DATE_TRUNC('MONTH', COALESCE(wp.predicted_close_date, o.CloseDate))
```

**ロジックの説明**:
- `win_probability >= 0.3` の商談の金額を合計
- 確度が30%以上の商談も含めた楽観的な予測
- すべての可能性のある商談を考慮した最大売上見込み

**条件**:
- `IsClosed = false`: 未クローズの商談のみ
- `is_current = 1`: 現在有効なレコード（SCD Type 2）
- `win_probability >= 0.3`: 成約確度30%以上の商談

**データソース別の詳細**:
- **月次**: `sf_poc.gold.monthly_revenue_forecast.best_case_revenue`
- **四半期**: `sf_poc.gold.quarterly_revenue_forecast.best_case_revenue`（確度30%以上の商談金額合計）
- **年度**: `sf_poc.gold.annual_revenue_forecast.full_year_best_case`（H1実績 + H2ベストケース予測）

---

### worstcase_revenue（ワーストケース売上）

**データソース**: 
- `sf_poc.gold.monthly_revenue_forecast` ビューの `worst_case_revenue` カラム
- `sf_poc.gold.quarterly_revenue_forecast` ビューの `worst_case_revenue` カラム
- `sf_poc.gold.annual_revenue_forecast` ビューの `full_year_worst_case` カラム

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 確度90%以上の商談金額を合計（保守的な予測）
SUM(CASE WHEN wp.win_probability >= 0.9 THEN o.Amount ELSE 0 END) AS worst_case_revenue
FROM sf_poc.silver.silver_opportunity_cleaned o
JOIN sf_poc.gold.win_probability_predictions wp ON o.Id = wp.opportunity_id
WHERE NOT o.IsClosed
  AND o.is_current = 1
  AND COALESCE(wp.predicted_close_date, o.CloseDate) >= CURRENT_DATE()
GROUP BY DATE_TRUNC('MONTH', COALESCE(wp.predicted_close_date, o.CloseDate))
```

**ロジックの説明**:
- `win_probability >= 0.9` の商談の金額を合計
- 確度が非常に高い（90%以上）商談のみを考慮した保守的な予測
- ほぼ確実に成約する商談のみを考慮した最小売上見込み

**条件**:
- `IsClosed = false`: 未クローズの商談のみ
- `is_current = 1`: 現在有効なレコード（SCD Type 2）
- `win_probability >= 0.9`: 成約確度90%以上の商談

**注意**: `best_case_revenue` は確度30%以上の商談を含む楽観的な予測、`worst_case_revenue` は確度90%以上の商談のみを含む保守的な予測です。通常の意味とは逆の命名になっていますが、実装に合わせてこの命名を使用しています。

**データソース別の詳細**:
- **月次**: `sf_poc.gold.monthly_revenue_forecast.worst_case_revenue`
- **四半期**: `sf_poc.gold.quarterly_revenue_forecast.worst_case_revenue`（確度90%以上の商談金額合計）
- **年度**: `sf_poc.gold.annual_revenue_forecast.full_year_worst_case`（H1実績 + H2ワーストケース予測）

---

### moderate_case_revenue（中間ケース売上）

**データソース**: 
- `sf_poc.gold.monthly_revenue_forecast` ビューの `moderate_case_revenue` カラム

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 確度60%以上の商談金額を合計（中間的な予測）
SUM(CASE WHEN wp.win_probability >= 0.6 THEN o.Amount ELSE 0 END) AS moderate_case_revenue
FROM sf_poc.silver.silver_opportunity_cleaned o
JOIN sf_poc.gold.win_probability_predictions wp ON o.Id = wp.opportunity_id
WHERE NOT o.IsClosed
  AND o.is_current = 1
  AND COALESCE(wp.predicted_close_date, o.CloseDate) >= CURRENT_DATE()
GROUP BY DATE_TRUNC('MONTH', COALESCE(wp.predicted_close_date, o.CloseDate))
```

**ロジックの説明**:
- `win_probability >= 0.6` の商談の金額を合計
- 確度が60%以上の商談を含む中間的な予測
- `best_case_revenue` と `worst_case_revenue` の中間値として使用

**条件**:
- `IsClosed = false`: 未クローズの商談のみ
- `is_current = 1`: 現在有効なレコード（SCD Type 2）
- `win_probability >= 0.6`: 成約確度60%以上の商談

**データソース**:
- **月次**: `sf_poc.gold.monthly_revenue_forecast.moderate_case_revenue`（確度60%以上の商談金額合計）
- **四半期**: `sf_poc.gold.quarterly_revenue_forecast` には `moderate_case_revenue` カラムは含まれていません（確度別集計のみ）

---

### 四半期別確度別売上（prob_90_plus, prob_70_90, prob_50_70, prob_30_50）

**データソース**: 
- `sf_poc.gold.quarterly_revenue_forecast` ビューの確度別カラム

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 確度90%以上の商談金額
SUM(CASE WHEN wp.win_probability >= 0.9 THEN o.Amount ELSE 0 END) AS prob_90_plus

-- 確度70〜90%の商談金額
SUM(CASE WHEN wp.win_probability >= 0.7 AND wp.win_probability < 0.9 THEN o.Amount ELSE 0 END) AS prob_70_90

-- 確度50〜70%の商談金額
SUM(CASE WHEN wp.win_probability >= 0.5 AND wp.win_probability < 0.7 THEN o.Amount ELSE 0 END) AS prob_50_70

-- 確度30〜50%の商談金額
SUM(CASE WHEN wp.win_probability >= 0.3 AND wp.win_probability < 0.5 THEN o.Amount ELSE 0 END) AS prob_30_50
```

**ロジックの説明**:
- 四半期単位で、成約確度別に商談金額を集計
- 確度の高い商談から低い商談まで、段階的に売上を見通すために使用
- `prob_90_plus` + `prob_70_90` + `prob_50_70` + `prob_30_50` = 四半期の総予測売上（概算）

---

### predicted_revenue（予測売上）

**データソース**: 
- `sf_poc.gold.priority_regions` ビューの `predicted_revenue` カラム
- `sf_poc.gold.priority_industries` ビューの `predicted_revenue` カラム

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 地域別・業種別
SUM(o.Amount * COALESCE(wp.win_probability, 0.5)) AS predicted_revenue
FROM sf_poc.silver.silver_opportunity_cleaned o
LEFT JOIN sf_poc.gold.win_probability_predictions wp ON o.Id = wp.opportunity_id
WHERE o.IsClosed = false
  AND o.is_current = 1
GROUP BY a.BillingState  -- または a.Industry__c
```

**ロジックの説明**:
- `expected_revenue` と同様の計算式
- `Amount * win_probability` を合計
- 地域別や業種別の集計で使用される

**win_probability のデフォルト値**:
- `win_probability` が NULL の場合は `0.5` を使用

**使用するデータ**:
- `Amount`: 商談金額 (`sf_poc.silver.silver_opportunity_cleaned`)
- `win_probability`: 成約確度 (`sf_poc.gold.win_probability_predictions`)

**データの流れ**:
1. Silver層: `sf_poc.silver.silver_opportunity_cleaned` (商談データ)
2. Gold層: `sf_poc.gold.win_probability_predictions` (成約確度予測)
3. Gold層: `sf_poc.gold.priority_regions` / `priority_industries` (集計ビュー)

---

### opportunity_count（商談数）

**データソース**: `sf_poc.silver.silver_opportunity_cleaned` テーブル

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 地域別・業種別
COUNT(DISTINCT o.Id) AS opportunity_count
FROM sf_poc.silver.silver_opportunity_cleaned o
WHERE o.IsClosed = false
  AND o.is_current = 1
GROUP BY a.BillingState  -- または a.Industry__c

-- リスクレベル別
COUNT(*) AS opportunity_count
FROM sf_poc.gold.gold_sales_rep_recommended_actions
GROUP BY risk_level
```

**条件**:
- `IsClosed = false`: 未クローズの商談のみ
- `is_current = 1`: 現在有効なレコード（SCD Type 2）
- `COUNT(DISTINCT o.Id)`: 重複を排除した商談数

**関連カラム**:
- **月次**: `sf_poc.gold.monthly_revenue_forecast.opportunity_count` - 当該月にクローズ予定の進行中商談件数（予測対象のみ）

**データの流れ**:
1. Bronze層: `sf_poc.bronze.bronze_opportunity_raw` (生データ)
2. Silver層: `sf_poc.silver.silver_opportunity_cleaned` (クレンジング済み)
3. Gold層: ダッシュボードビューで集計（`monthly_revenue_forecast`, `quarterly_revenue_forecast`, `priority_regions`, `priority_industries` など）

---

### achievement_rate（達成率）

**データソース**: 
- `sf_poc.gold.monthly_revenue_forecast` ビューの `achievement_rate` カラム（月次）
- `sf_poc.gold.quarterly_revenue_forecast` ビューの `achievement_rate` カラム（四半期）
- `sf_poc.gold.annual_revenue_forecast` ビューの `achievement_rate` カラム（年度）

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 月次達成率
(COALESCE(f.expected_revenue, a.actual_revenue) / NULLIF(t.target_revenue, 0) * 100) AS achievement_rate

-- 四半期達成率
(qd.expected_revenue / NULLIF(st.target_revenue, 0) * 100) AS achievement_rate

-- 年度達成率
CASE 
    WHEN cf.fiscal_year IS NOT NULL 
    THEN (COALESCE(aa.actual_revenue, 0) + cf.expected_revenue) / NULLIF(at.target_revenue, 0) * 100
    ELSE aa.actual_revenue / NULLIF(at.target_revenue, 0) * 100
END AS achievement_rate
```

**ロジックの説明**:
- `(予測売上または実績売上 / ターゲット売上) * 100` で算出
- 100%を超える場合は目標を上回っていることを示す
- 100%未満の場合は目標未達を示す

**算出式の詳細**:
- **月次**: `(expected_revenue / target_revenue) * 100`
- **四半期**: `(expected_revenue / target_revenue) * 100`
- **年度**: `(full_year_expected / target_revenue) * 100`

**使用するデータ**:
- `expected_revenue`: 期待売上（予測）または `actual_revenue`: 実績売上
- `target_revenue`: ターゲット売上（予算、`bronze.sales_target` / `quarterly_sales_target` / `annual_sales_target` から取得）

---

### variance_to_target（ターゲットとの乖離）

**データソース**: 
- `sf_poc.gold.monthly_revenue_forecast` ビューの `variance_to_target` と `variance_to_target_pct` カラム
- `sf_poc.gold.quarterly_revenue_forecast` ビューの `variance_to_target` と `variance_to_target_pct` カラム
- `sf_poc.gold.annual_revenue_forecast` ビューの `variance_to_target` カラム

**算出ロジック** (`../scripts/06_dashboards/01_create_dashboard_views.sql`):
```sql
-- 月次乖離（金額）
(COALESCE(f.expected_revenue, a.actual_revenue) - t.target_revenue) AS variance_to_target

-- 月次乖離（%）
((COALESCE(f.expected_revenue, a.actual_revenue) - t.target_revenue) / NULLIF(t.target_revenue, 0) * 100) AS variance_to_target_pct

-- 四半期乖離（金額）
(qd.expected_revenue - st.target_revenue) AS variance_to_target

-- 四半期乖離（%）
((qd.expected_revenue - st.target_revenue) / NULLIF(st.target_revenue, 0) * 100) AS variance_to_target_pct

-- 年度乖離（金額）
CASE 
    WHEN cf.fiscal_year IS NOT NULL 
    THEN (COALESCE(aa.actual_revenue, 0) + cf.expected_revenue) - at.target_revenue
    ELSE aa.actual_revenue - at.target_revenue
END AS variance_to_target
```

**ロジックの説明**:
- `variance_to_target`: 予測売上（または実績売上）とターゲットの差額（金額、DOUBLE型）
- `variance_to_target_pct`: ターゲットに対する差額の割合（%）、`(variance_to_target / target_revenue) * 100`
- 正の値は目標を上回っていることを示す
- 負の値は目標未達を示す

**算出式の詳細**:
- **月次**: `variance_to_target = expected_revenue - target_revenue`, `variance_to_target_pct = (variance_to_target / target_revenue) * 100`
- **四半期**: `variance_to_target = expected_revenue - target_revenue`, `variance_to_target_pct = (variance_to_target / target_revenue) * 100`
- **年度**: `variance_to_target = full_year_expected - target_revenue`（`variance_to_target_pct` は年度ビューには含まれていません）

**使用するデータ**:
- `expected_revenue`: 期待売上（予測）または `actual_revenue`: 実績売上
- `target_revenue`: ターゲット売上（予算）

---

## データフロー図

```
Bronze層 (生データ)
  ├─ bronze_opportunity_raw
  ├─ bronze_account_raw
  ├─ bronze_contact_raw
  └─ bronze_sales_target_raw
  ↓
Silver層 (クレンジング)
  ├─ silver_opportunity_cleaned
  ├─ silver_account_cleaned
  ├─ silver_contact_cleaned
  └─ silver_opportunity_history_cleaned
  ↓
Gold層 (特徴量エンジニアリング)
  ├─ opportunity_features (商談特徴量)
  ├─ customer_features (顧客特徴量)
  ├─ product_features (商品特徴量)
  └─ cpq_features (CPQ特徴量)
  ↓
Gold層 (モデル推論)
  ├─ churn_risk_predictions (失注リスク推論)
  │   └─ churn_risk_score, risk_factors
  ├─ win_probability_predictions (成約確度予測推論)
  │   └─ win_probability, predicted_close_date, probability_category
  └─ upsell_crosssell_recommendations (アップセル・クロスセル推論)
      └─ purchase_score, rank, cf_score, product_cooccurrence_score
  └─ win_probability_predictions (成約確度予測)
      └─ win_probability, predicted_close_date, confidence_interval_lower, confidence_interval_upper, probability_category, prediction_date
  ↓
Gold層 (ダッシュボードビュー)
  ├─ monthly_revenue_forecast (月次売上予測)
  │   └─ actual_revenue, actual_won_count, expected_revenue, best_case_revenue, worst_case_revenue, moderate_case_revenue, opportunity_count, target_revenue, variance_to_target, variance_to_target_pct, achievement_rate, period_type
  ├─ quarterly_revenue_forecast (四半期別売上予測)
  │   └─ actual_revenue, expected_revenue, best_case_revenue, worst_case_revenue, prob_90_plus, prob_70_90, prob_50_70, prob_30_50, target_revenue, variance_to_target, variance_to_target_pct, achievement_rate
  ├─ annual_revenue_forecast (年度別売上予測)
  │   └─ h1_actual, full_year_expected, full_year_best_case, full_year_worst_case, target_revenue, achievement_rate, variance_to_target, period_type
  ├─ priority_prospects
  │   └─ win_probability, risk_score, expected_revenue, priority_score
  ├─ priority_existing_customers
  │   └─ upsell_probability, crosssell_probability, priority_score
  ├─ priority_regions / priority_industries
  │   └─ predicted_revenue, opportunity_count
  └─ gold_sales_rep_recommended_actions
      └─ risk_score, risk_level, risk_factor_1/2/3, priority_score
  ↓
ダッシュボード表示
```

---

## 関連ファイル

- **リスク推論**: `../scripts/05_models/02_churn_risk_inference.py`
- **成約確度予測推論**: `../scripts/05_models/04_win_probability_inference.py`
- **成約確度予測学習**: `../scripts/05_models/30_win_probability_training.py`
- **アップセル・クロスセル推論**: `../scripts/05_models/01_upsell_crosssell_inference.py`
- **商談特徴量**: `../scripts/04_gold/02_opportunity_features.py`
- **顧客特徴量**: `../scripts/04_gold/01_customer_features.py`
- **ダッシュボードビュー**: `../scripts/06_dashboards/01_create_dashboard_views.sql`
- **売上予測ビュー**: `../scripts/06_dashboards/01_create_dashboard_views.sql`（セクション3）

---

## 更新履歴

- 2025-01-XX: 初版作成
- 2025-01-XX: 確率・予測関連指標（win_probability, upsell_probability, crosssell_probability, priority_score）と売上関連指標（bestcase_revenue, worstcase_revenue, predicted_revenue）を追加
- 2025-01-XX: 売上予測モデル実装に合わせて更新
  - `win_probability` の説明を `win_probability_predictions` テーブルベースに更新
  - `expected_revenue`, `bestcase_revenue`, `worstcase_revenue` の説明を `monthly_revenue_forecast`, `quarterly_revenue_forecast`, `annual_revenue_forecast` ビューベースに更新
  - データフロー図を更新
  - 関連ファイルリストを更新
- 2025-01-XX: コメント定義ファイル更新に合わせて詳細化
  - `win_probability_predictions` テーブルの全カラム説明を追加
  - `annual_revenue_forecast` ビューの詳細説明を追加
  - `monthly_revenue_forecast` の `actual_won_count`, `opportunity_count`, `moderate_case_revenue` の説明を追加
  - `quarterly_revenue_forecast` の `best_case_revenue`, `worst_case_revenue` の説明を追加
  - `achievement_rate`, `variance_to_target` の算出式を詳細化

