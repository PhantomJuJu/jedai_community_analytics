## 失注リスク補助モデル（サバイバル分析）の収束問題ガイド

このドキュメントは、`13_churn_risk_survival_analysis.py` で使用している  
**Cox 比例ハザードモデル（lifelines.CoxPHFitter）** が「収束しない」ケースについて、

- 今回のデータで実際に起きていること
- なぜ lifelines が `ConvergenceWarning` / `ConvergenceError` を出しているのか
- どういうデータを用意すれば収束しやすくなるのか
- このリポジトリ内でどのような変更（データ or スクリプト）をすればよいか

を整理したものです。

---

### 1. 今回のエラーメッセージの意味

`13_churn_risk_survival_analysis.py` 実行時に、次のような警告／エラーが出ていました。

- `ConvergenceWarning: Column(s) ['opportunity_age_days', 'weekly_activity_frequency', 'event_count_last_30days', 'meeting_count_last_30days'] have very low variance. This may harm convergence.`
- `ConvergenceWarning: Column activity_count_last_30days have very low variance when conditioned on death event present or not. This may harm convergence. This could be a form of 'complete separation'.`
- `ConvergenceError: delta contains nan value(s). Convergence halted.`

lifelines の意味するところは次の通りです。

- **low variance（分散が極端に小さい）**:
  - ある共変量（特徴量）が、ほぼ同じ値しか取っていない  
    例: `weekly_activity_frequency` がほとんど 0.0、たまに 0.1 くらい
  - その列を入れてもモデルが「情報」を得られず、推定すべきパラメータが不安定になる
- **conditioned on death event present or not（イベント有無での分散が低い）**:
  - 失注 (`event_lost = 1`) と非失注 (`event_lost = 0`) を分けたとき、  
    どちらかのグループでほぼ同じ値になっている
  - あるいは、ある値レンジに入ると必ず `event_lost = 1` / 常に `0` になる  
    → **完全分離（complete separation）** と呼ばれ、ロジスティック回帰でも CoxPH でも典型的に収束問題を起こす
- 結果として、対数尤度の勾配更新量 `delta` に `NaN` が含まれ、最適化が停止します。

---

### 2. 今回のパイプラインで対象にしているデータ

`13_churn_risk_survival_analysis.py` では、以下のような流れでサバイバル用データを構築しています。

1. `sf_poc.gold.opportunity_features` ＋ `sf_poc.gold.activity_features` を JOIN して `features_df` を作成
2. そこから以下の列を抜き出して `survival_df` を作成

   - `duration_days`:
     - `is_closed == true` の場合: `CloseDate - CreatedDate`
     - それ以外: `current_date - CreatedDate`
   - `event_lost`:
     - `is_closed == true` かつ `is_won == false` の場合: `1`（失注）
     - それ以外: `0`（打ち切り）
   - 共変量（covariates）:
     - `stage_duration_days`
     - `opportunity_age_days`
     - `days_since_last_activity`
     - `activity_count_last_30days`
     - `weekly_activity_frequency`
     - `task_count_last_30days`
     - `open_task_count`
     - `overdue_task_count`
     - `event_count_last_30days`
     - `meeting_count_last_30days`
     - `amount_variance`
     - `history_record_count`
     - `stage_change_count`

3. `is_closed == true` のレコードを pandas に落として `closed_pdf` を作り、  
   `duration_days` / `event_lost` / covariates を使って CoxPH を学習

lifelines の警告は、**この `closed_pdf` の中で、上記のいくつかの共変量が「ほとんど同じ値 or イベント有無とほぼ完全に一致している」** ことを示しています。

---

### 3. なぜ今回のデータで収束しないのか（典型パターンの整理）

この PoC データの性質上、以下のような構造になっている可能性が高いです。

- 多くのクローズ済商談が、`activity_count_last_30days = 0` か、ごく小さい値に偏っている
- 一方で「活動が多い」ケースは、ほぼすべて成約 (`is_won = true`, `event_lost = 0`) かその逆、というように、  
  **活動量が事実上の「決定要因」になっている**
- `weekly_activity_frequency`, `event_count_last_30days`, `meeting_count_last_30days` も  
  `activity_count_last_30days` のスケール違いに近く、情報として非常に重複している

その結果、

- `event_lost` を説明しようとする際に、
  - ある特徴量の係数が「発散」（非常に大きな絶対値）しようとする
  - そこに数値スケーリングや分散の小ささが組み合わさって、  
    ヘッセ行列の条件数が悪化 → `LinAlgWarning: Ill-conditioned matrix` → `ConvergenceError`

という流れになっています。

---

### 4. どういうデータがあれば収束しやすくなるか

理想的には、以下のようなデータ分布があると CoxPH は安定します。

1. **各共変量に十分な分散がある**
   - 例: `activity_count_last_30days` が 0〜100 くらいに広がっていて、
     - `event_lost = 1` の中にも 0〜100 が
     - `event_lost = 0` の中にも 0〜100 が
     混ざっている状態。

2. **どの特徴量も「それ単体では生死を完全には決めない」**
   - 「この列が 0 なら必ず失注」「この列が >0 なら必ず成約」のような決定的な境界がない。
   - 多少のノイズや例外があり、**統計的に傾向を学習する余地がある**こと。

3. **時間軸（duration_days）とイベントの関係にバリエーションがある**
   - 早期に失注するケース、長く引っ張ってから失注するケース、長く続いても失注しないケースなどが混ざっている。

言い換えると、「活動が 0 なら 100% 失注」「活動が 1 以上なら 100% 成約」のような  
**ルールベースで説明できてしまうような構造だと、統計モデルは逆に不安定**になります。

---

### 5. このリポジトリで取りうる具体的な対策

PoC データの性質上、大きく 2 系統の対応が考えられます。

#### 5-1. モデル側（CoxPH の入力）の調整

1. **低分散 or 完全分離の疑いがある共変量を削る**

   - 例: `weekly_activity_frequency`, `event_count_last_30days`, `meeting_count_last_30days` など、
     lifelines が `low variance` と警告している列をいったん外す。

   ```python
   covariates = [
       "stage_duration_days",
       "opportunity_age_days",
       "days_since_last_activity",
       # "activity_count_last_30days",            # 必要に応じて外す
       # "weekly_activity_frequency",             # 必要に応じて外す
       "task_count_last_30days",
       "open_task_count",
       "overdue_task_count",
       # "event_count_last_30days",              # 必要に応じて外す
       # "meeting_count_last_30days",            # 必要に応じて外す
       "amount_variance",
       "history_record_count",
       "stage_change_count",
   ]
   ```

   - 補助モデルなので、「説明力と安定性のバランス」を優先して変数を絞るのは現実的なトレードオフです。

2. **変数のビニング（カテゴリ化）**

   - 例えば `activity_count_last_30days` を  
     `0 / 1〜3 / 4〜10 / 11+` のようなカテゴリにまとめることで、  
     完全分離を少し崩す・極端なスケールを抑える方法があります。

   ```python
   closed_pdf["activity_bin"] = pd.cut(
       closed_pdf["activity_count_last_30days"],
       bins=[-0.1, 0.5, 3.5, 10.5, np.inf],
       labels=["0", "1-3", "4-10", "11+"],
   )
   covariates = [
       ...,
       "activity_bin",
       ...
   ]
   ```

3. **ペナルティ（L2 正則化）の導入**

   - lifelines の `CoxPHFitter` には `penalizer` 引数があり、  
     小さな L2 ペナルティを入れると、係数の暴走を抑えられることがあります。

   ```python
   cph = CoxPHFitter(penalizer=0.1)
   cph.fit(train_df, duration_col=duration_col, event_col=event_col)
   ```

   - ただし、完全分離が強い場合はペナルティだけでは解決しないことも多いため、  
     上記の「変数削減」「ビニング」との併用が現実的です。

#### 5-2. データ側（CSV / Bronze 層）の拡充・調整

PoC 用 CSV（`data/商談(Opportunity).csv`, `data/行動(Event).csv`, `data/ToDo(Task).csv` など）は、  
かなり偏ったサンプル（特定のパターンが多い）になっている可能性があります。

本番相当の分析を目指す場合、以下のような改善が有効です。

1. **「活動が少ないのに受注」「活動が多いのに失注」といった例外ケースを増やす**
   - 例: `activity_count_last_30days` が 0〜3 でも `is_won = true` のケースを一定数作る
   - 逆に `activity_count_last_30days` が高いのに `is_won = false` のケースも少数含める

2. **観測期間を広げる**
   - 現状の CSV が特定年度／特定キャンペーンに偏っている場合、  
     もう少し長い期間や別セグメントの商談を追加することで、  
     `duration_days` と `event_lost` の組み合わせにバリエーションを持たせる。

3. **極端な商談（amount が 0、duration が 0 など）を多少フィルタする**
   - 学習前に

   ```python
   train_df = train_df[train_df[duration_col] > 0]
   ```

   などの軽いフィルタを入れて、数値的に極端なサンプルを減らす。

---

### 6. 本リポジトリでの現在の実装方針

この PoC/テンプレートでは、以下の方針を採用しています。

- **サバイバル分析は「補助モデル」扱い**:
  - メインの失注リスクスコアは、ロジスティック回帰（`10_churn_risk_training.py`）＋  
    `02_churn_risk_inference.py` で算出している `churn_risk_score`。
  - サバイバル分析は「時間軸の視点」を追加する補助スコアとして設計。

- **CoxPH が収束しない場合は、自動的にスキップ & `hybrid_risk_score ≒ churn_risk_score` にフォールバック**:
  - lifelines の `ConvergenceError` をキャッチし、空の `survival_scores_pdf` を生成。
  - その場合でも `churn_risk_predictions` の更新は行い、  
    `survival_prob_30d/60d/90d = 1.0`・`hybrid_risk_score = churn_risk_score` として一貫性を保つ。

- **将来的に本番データでサバイバル分析を強化したい場合**:
  - 上記 5-1 / 5-2 のような施策（変数削減・ビニング・ペナルティ・データ拡充）を組み合わせて、  
    収束性と説明力のバランスを見ながら、CoxPH モデルを調整してください。

--- 

このガイドは、サバイバル分析の挙動を理解しつつ、  

