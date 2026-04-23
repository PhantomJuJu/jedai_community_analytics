import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@databricks/appkit-ui/react";
import { useAnalyticsQuery } from "@databricks/appkit-ui/react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const CARD = "rounded-xl border border-white/[0.07] bg-[#1a1b2e] transition-colors hover:bg-[#1e2035]";
const DEFAULT_MAX_RANK_ROWS = 10;

const WEEKDAY_ORDER = ["1. 月", "2. 火", "3. 水", "4. 木", "5. 金", "6. 土", "7. 日"];

function toNumber(value: number | string | undefined): number {
  return Number(value ?? 0);
}

type WeekdayHourDominantRow = {
  weekday_display?: string;
  hour_slot?: number | string;
  voice_dominant_score?: number | string;
};

function RankingTableCard({
  title,
  rows,
  nameColumnLabel,
  valueColumnLabel,
  valueFormatter,
  maxRows = DEFAULT_MAX_RANK_ROWS,
  showAllToggle = true,
}: {
  title: string;
  rows: Array<{ name: string; value: number }>;
  nameColumnLabel: string;
  valueColumnLabel: string;
  valueFormatter: (value: number) => string;
  maxRows?: number;
  showAllToggle?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll ? rows : rows.slice(0, maxRows);
  const canToggle = showAllToggle && rows.length > maxRows;

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                Rank
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                {nameColumnLabel}
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                {valueColumnLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr
                key={`${row.name}-${index}`}
                className="border-b border-white/[0.05] transition-colors hover:bg-[#1e2035]"
              >
                <td className="px-5 py-3 tabular-nums text-[#5a5a7a]">{index + 1}</td>
                <td className="px-5 py-3 text-[#f0f0ff]">{row.name}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#f0f0ff]">
                  {valueFormatter(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canToggle ? (
          <div className="border-t border-white/[0.06] px-4 py-3">
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-xs text-[#cfcfeb] transition hover:bg-white/10"
            >
              {showAll ? `上位${maxRows}件に戻す` : "すべて表示"}
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function churnLevelBadgeClass(level: string): string {
  switch (level) {
    case "離脱済み":
      return "bg-red-500/20 text-red-300 border-red-500/40";
    case "高":
      return "bg-orange-500/20 text-orange-200 border-orange-500/40";
    case "要注意":
      return "bg-amber-500/15 text-amber-200 border-amber-500/35";
    case "活発":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/35";
    default:
      return "bg-white/10 text-[#9898b8] border-white/20";
  }
}

export function VoiceChurnRiskTable() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("voice_churn_risk", params);
  const [showAll, setShowAll] = useState(false);

  if (loading) return <Skeleton className="h-[420px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = (data ?? []) as Array<{
    user_name?: string;
    churn_risk_score?: number | string;
    churn_risk_level?: string;
    days_since_last_voice?: number | string;
  }>;
  const displayRows = showAll ? rows : rows.slice(0, DEFAULT_MAX_RANK_ROWS);
  const canToggle = rows.length > DEFAULT_MAX_RANK_ROWS;

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">ボイス離脱リスク</CardTitle>
        <CardDescription className="text-sm text-[#9898b8]">
          最終参加からの経過日数とリスクスコア（セッション数 2 回以上）
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                Rank
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                ユーザ
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                経過日数
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                スコア
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
                レベル
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr
                key={`${row.user_name}-${index}`}
                className="border-b border-white/[0.05] transition-colors hover:bg-[#1e2035]"
              >
                <td className="px-5 py-3 tabular-nums text-[#5a5a7a]">{index + 1}</td>
                <td className="px-5 py-3 text-[#f0f0ff]">{row.user_name ?? "unknown"}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[#f0f0ff]">
                  {toNumber(row.days_since_last_voice).toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#f0f0ff]">
                  {toNumber(row.churn_risk_score)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${churnLevelBadgeClass(
                      row.churn_risk_level ?? "",
                    )}`}
                  >
                    {row.churn_risk_level ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canToggle ? (
          <div className="border-t border-white/[0.06] px-4 py-3">
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-xs text-[#cfcfeb] transition hover:bg-white/10"
            >
              {showAll ? `上位${DEFAULT_MAX_RANK_ROWS}件に戻す` : "すべて表示"}
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function VoiceWeeklyKpiStrip() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("voice_weekly_kpi", params);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const row = (data ?? [])[0] as
    | {
        this_week_voice_hours?: number | string;
        last_week_voice_hours?: number | string;
        voice_growth_rate_pct?: number | string | null;
        voice_health_signal?: string;
      }
    | undefined;

  if (!row) {
    return <p className="text-sm text-[#9898b8]">週次 KPI 未取得</p>;
  }

  const thisWeek = toNumber(row.this_week_voice_hours);
  const lastWeek = toNumber(row.last_week_voice_hours);
  const pctRaw = row.voice_growth_rate_pct;
  const pct = pctRaw === null || pctRaw === undefined ? null : toNumber(pctRaw);
  const signal = row.voice_health_signal ?? "GREEN";

  const borderClass =
    signal === "RED"
      ? "border-red-500/50"
      : signal === "YELLOW"
        ? "border-amber-500/45"
        : "border-emerald-500/40";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={`${CARD} border-2 ${borderClass}`}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            今週のボイス時間（直近7日・時間）
          </CardDescription>
          <CardTitle className="mt-2 text-4xl font-semibold tabular-nums text-[#f0f0ff]">
            {thisWeek.toFixed(2)}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className={`${CARD} border-2 ${borderClass}`}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            前週比（%） / 健全性シグナル
          </CardDescription>
          <CardTitle className="mt-2 text-3xl font-semibold tabular-nums text-[#f0f0ff]">
            {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
          </CardTitle>
          <p className="mt-1 text-xs text-[#7a7a9a]">
            前週: {lastWeek.toFixed(2)}h · signal: {signal}
          </p>
        </CardHeader>
      </Card>
    </div>
  );
}

export function VoiceHeatmapCard() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("voice_active_timeslots", params);

  if (loading) return <Skeleton className="h-[440px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const rows = (data ?? []) as WeekdayHourDominantRow[];

  for (const row of rows) {
    const weekday = WEEKDAY_ORDER.indexOf(row.weekday_display ?? "");
    const hour = Math.max(0, Math.min(23, Math.floor(toNumber(row.hour_slot))));
    if (weekday < 0) continue;
    const v = toNumber(row.voice_dominant_score);
    matrix[weekday][hour] = Math.max(matrix[weekday][hour], v);
  }

  const maxValue = Math.max(1e-6, ...matrix.flat());
  const valueFormatter = (value: number) => value.toFixed(2);

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">
          ボイス優位スロット（90% ボイス / 10% メッセージ合成スコア）
        </CardTitle>
        <CardDescription className="text-sm text-[#9898b8]">
          ギルド内最大値で正規化した合成指標（セルはギルド間で最大値を表示）
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="w-full min-w-[720px]">
          <div className="mb-2 grid grid-cols-[84px_repeat(24,minmax(18px,1fr))] gap-[4px] text-[10px] text-[#7a7a9a]">
            <div />
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="text-center">
                {hour % 2 === 0 ? hour : ""}
              </div>
            ))}
          </div>
          <div className="space-y-[4px]">
            {WEEKDAY_ORDER.map((day, dayIndex) => (
              <div
                key={day}
                className="grid grid-cols-[84px_repeat(24,minmax(18px,1fr))] items-stretch gap-[4px]"
              >
                <div className="flex items-center text-xs font-medium text-[#b2b2d0]">{day}</div>
                {matrix[dayIndex].map((value, hour) => {
                  const intensity = value / maxValue;
                  const hasValue = value > 0;
                  const alpha = hasValue ? 0.15 + intensity * 0.85 : 0;
                  const bgColor = hasValue ? `rgba(90, 156, 248, ${alpha})` : "#1e1f30";
                  return (
                    <div
                      key={`${day}-${hour}`}
                      title={`${day} ${hour}:00 — ${valueFormatter(value)}`}
                      className="h-8 rounded-[4px] border border-white/[0.07] text-center text-[9px] leading-8 text-white/85"
                      style={{ backgroundColor: bgColor }}
                    >
                      {hasValue && intensity > 0.35 ? valueFormatter(value) : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function VoiceSessionScatterCard() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("voice_session_segment", params);

  if (loading) return <Skeleton className="h-[400px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const raw = (data ?? []) as Array<{
    user_name?: string;
    avg_session_minutes?: number | string;
    active_weeks?: number | string;
  }>;

  const chartData = raw.map((row) => ({
    name: row.user_name ?? "unknown",
    avg_session_minutes: toNumber(row.avg_session_minutes),
    active_weeks: toNumber(row.active_weeks),
  }));

  const mx = median(chartData.map((d) => d.avg_session_minutes));
  const my = median(chartData.map((d) => d.active_weeks));

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">
          セッション深度 × 稼働週数（散布図）
        </CardTitle>
        <CardDescription className="text-sm text-[#9898b8]">
          X: 平均セッション長（分）、Y: アクティブ週数。線は中央値。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis
                type="number"
                dataKey="avg_session_minutes"
                name="平均(分)"
                tick={{ fill: "#f0f0ff", fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="active_weeks"
                name="稼働週"
                tick={{ fill: "#f0f0ff", fontSize: 12 }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                formatter={(value: number, name: string) => [
                  typeof value === "number" ? value.toFixed(name.includes("分") ? 1 : 1) : value,
                  name,
                ]}
                labelFormatter={(_, payload) => (payload?.[0] as { payload?: { name?: string } })?.payload?.name ?? ""}
              />
              <ReferenceLine x={mx} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
              <ReferenceLine y={my} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
              <Scatter name="ユーザ" data={chartData} fill="#9b7ee8" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function VoiceLtvRankingTable() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("voice_ltv_ranking", params);

  if (loading) return <Skeleton className="h-[380px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = ((data ?? []) as Array<{ user_name?: string; voice_ltv_score?: number | string }>).map((row) => ({
    name: row.user_name || "unknown",
    value: toNumber(row.voice_ltv_score),
  }));

  return (
    <RankingTableCard
      title="ボイス LTV スコアランキング"
      rows={rows}
      nameColumnLabel="ユーザ"
      valueColumnLabel="LTV スコア"
      valueFormatter={(value) => value.toFixed(2)}
      maxRows={DEFAULT_MAX_RANK_ROWS}
      showAllToggle
    />
  );
}

export function VoiceChannelHhiCard() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("voice_channel_hhi", params);

  if (loading) return <Skeleton className="h-[400px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = (data ?? []) as Array<{
    channel_name?: string;
    voice_share_pct?: number | string;
    voice_channel_hhi?: number | string;
    hhi_status?: string;
  }>;

  const hhi = rows.length ? toNumber(rows[0]!.voice_channel_hhi) : 0;
  const status = rows.length ? rows[0]!.hhi_status ?? "—" : "—";

  const chartData = [...rows]
    .sort((a, b) => toNumber(b.voice_share_pct) - toNumber(a.voice_share_pct))
    .slice(0, 20)
    .map((row) => ({
      name: row.channel_name ?? "unknown",
      share: toNumber(row.voice_share_pct),
    }));

  return (
    <Card className={CARD}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-[#f0f0ff]">チャンネル集中度（HHI）</CardTitle>
            <CardDescription className="text-sm text-[#9898b8]">
              シェア上位20チャンネル · HHI = Σ(シェア²)×10000
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-[#f0f0ff]">{hhi.toFixed(0)}</p>
            <span className="mt-1 inline-block rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs text-[#9898b8]">
              {status}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis type="number" tick={{ fill: "#f0f0ff", fontSize: 11 }} unit="%" />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "#f0f0ff", fontSize: 10 }}
                interval={0}
              />
              <Tooltip
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "シェア"]}
              />
              <Bar dataKey="share" fill="#5a9cf8" radius={[0, 6, 6, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

