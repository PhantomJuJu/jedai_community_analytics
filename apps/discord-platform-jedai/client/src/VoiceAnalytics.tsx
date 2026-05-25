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
import {
  CARD,
  CHART_AXIS,
  CHART_GRID,
  CHART_TOOLTIP,
  LABEL_UPPER,
  LINE_SECONDARY,
  TABLE_BORDER,
  TABLE_HEAD,
  TABLE_ROW_HOVER,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_SUBTLE,
  TEXT_TITLE,
} from "./theme.js";

const DEFAULT_MAX_RANK_ROWS = 10;

const WEEKDAY_ORDER = ["1. 月", "2. 火", "3. 水", "4. 木", "5. 金", "6. 土", "7. 日"];

const WEEKDAY_LABEL_JA = ["月", "火", "水", "木", "金", "土", "日"] as const;

function toNumber(value: number | string | undefined): number {
  return Number(value ?? 0);
}

function formatHourLabel(hourSlot: number): string {
  const hour = Math.max(0, Math.min(23, Math.floor(hourSlot)));
  return `${String(hour).padStart(2, "0")}:00`;
}

/** データ上の weekday (0=月 … 6=日) を JS getDay (0=日 … 6=土) に変換 */
function dataWeekdayToJsDay(weekdayIndex: number): number {
  return weekdayIndex === 6 ? 0 : weekdayIndex + 1;
}

function daysUntilWeekday(weekdayIndex: number): number {
  const targetJsDay = dataWeekdayToJsDay(weekdayIndex);
  const todayJsDay = new Date().getDay();
  let delta = (targetJsDay - todayJsDay + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  return delta;
}

function upcomingWeekdayPhrase(weekdayIndex: number): string {
  const label = WEEKDAY_LABEL_JA[weekdayIndex] ?? "該当";
  const days = daysUntilWeekday(weekdayIndex);
  if (days <= 6) {
    return `次の${label}曜`;
  }
  return `来週の${label}曜`;
}

type HeatmapPeakInsight = {
  headline: string;
  detail: string | null;
};

function buildHeatmapPeakInsight(rows: WeekdayHourDominantRow[]): HeatmapPeakInsight {
  const activeRows = rows.filter((row) => toNumber(row.voice_dominant_score) > 0);
  if (activeRows.length === 0) {
    return {
      headline: "十分な活動データがまだありません。期間やフィルタを広げて、もう一度確認してください。",
      detail: null,
    };
  }

  let bestRow = activeRows[0]!;
  for (const row of activeRows) {
    if (toNumber(row.voice_dominant_score) > toNumber(bestRow.voice_dominant_score)) {
      bestRow = row;
    }
  }

  const weekdayIndex = WEEKDAY_ORDER.indexOf(bestRow.weekday_display ?? "");
  const hour = Math.max(0, Math.min(23, Math.floor(toNumber(bestRow.hour_slot))));
  const weekdayPhrase =
    weekdayIndex >= 0 ? upcomingWeekdayPhrase(weekdayIndex) : (bestRow.weekday_display ?? "該当曜日");
  const timeLabel = formatHourLabel(hour);
  const score = toNumber(bestRow.voice_dominant_score);
  const voiceHours = toNumber(bestRow.voice_duration_hours);
  const guildCount = new Set(
    activeRows
      .filter((row) => {
        const rowWeekday = WEEKDAY_ORDER.indexOf(row.weekday_display ?? "");
        const rowHour = Math.floor(toNumber(row.hour_slot));
        return rowWeekday === weekdayIndex && rowHour === hour;
      })
      .map((row) => row.guild_name)
      .filter(Boolean),
  ).size;

  const headline = `${weekdayPhrase}の ${timeLabel} 頃が最も人が集まりやすく、イベントや告知を実施するのに適しています。`;
  const detailParts = [
    `合成スコア ${score.toFixed(2)}`,
    voiceHours > 0 ? `ボイス時間 ${voiceHours.toFixed(1)} 時間` : null,
    guildCount > 0 ? `${guildCount} ギルドで活動シグナル` : null,
  ].filter((part): part is string => Boolean(part));

  return {
    headline,
    detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
  };
}

type WeekdayHourDominantRow = {
  weekday_display?: string;
  hour_slot?: number | string;
  voice_dominant_score?: number | string;
  voice_duration_hours?: number | string;
  guild_name?: string;
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
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[460px] text-sm">
          <thead className="bg-slate-50">
            <tr className={`border-b ${TABLE_BORDER} text-left`}>
              <th className={`px-5 py-3 ${TABLE_HEAD}`}>Rank</th>
              <th className={`px-5 py-3 ${TABLE_HEAD}`}>{nameColumnLabel}</th>
              <th className={`px-5 py-3 text-right ${TABLE_HEAD}`}>{valueColumnLabel}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr
                key={`${row.name}-${index}`}
                className={`border-b border-slate-100 transition-colors ${TABLE_ROW_HOVER}`}
              >
                <td className={`px-5 py-3 tabular-nums ${TEXT_SUBTLE}`}>{index + 1}</td>
                <td className={`px-5 py-3 ${TEXT_BODY}`}>{row.name}</td>
                <td className={`px-5 py-3 text-right font-semibold tabular-nums ${TEXT_TITLE}`}>
                  {valueFormatter(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canToggle ? (
          <div className={`border-t ${TABLE_BORDER} px-4 py-3`}>
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
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
      return "border-red-200 bg-red-50 text-red-800";
    case "高":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "要注意":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "活発":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
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
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>最近ボイス参加が減っているユーザー</CardTitle>
        <CardDescription className={`text-sm ${TEXT_MUTED}`}>
          最後にボイスに参加してからの日数と、離脱の可能性が高い順に表示します。
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50">
            <tr className={`border-b ${TABLE_BORDER} text-left`}>
              <th className={`px-5 py-3 ${TABLE_HEAD}`}>Rank</th>
              <th className={`px-5 py-3 ${TABLE_HEAD}`}>ユーザ</th>
              <th className={`px-5 py-3 text-right ${TABLE_HEAD}`}>経過日数</th>
              <th className={`px-5 py-3 text-right ${TABLE_HEAD}`}>スコア</th>
              <th className={`px-5 py-3 ${TABLE_HEAD}`}>レベル</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr
                key={`${row.user_name}-${index}`}
                className={`border-b border-slate-100 transition-colors ${TABLE_ROW_HOVER}`}
              >
                <td className={`px-5 py-3 tabular-nums ${TEXT_SUBTLE}`}>{index + 1}</td>
                <td className={`px-5 py-3 ${TEXT_BODY}`}>{row.user_name ?? "unknown"}</td>
                <td className={`px-5 py-3 text-right tabular-nums ${TEXT_BODY}`}>
                  {toNumber(row.days_since_last_voice).toLocaleString()}
                </td>
                <td className={`px-5 py-3 text-right font-semibold tabular-nums ${TEXT_TITLE}`}>
                  {toNumber(row.churn_risk_score)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-block rounded-md border px-2.5 py-0.5 text-sm font-medium ${churnLevelBadgeClass(
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
          <div className={`border-t ${TABLE_BORDER} px-4 py-3`}>
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
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
    return <p className={`text-sm ${TEXT_MUTED}`}>週次 KPI 未取得</p>;
  }

  const thisWeek = toNumber(row.this_week_voice_hours);
  const lastWeek = toNumber(row.last_week_voice_hours);
  const pctRaw = row.voice_growth_rate_pct;
  const pct = pctRaw === null || pctRaw === undefined ? null : toNumber(pctRaw);
  const signal = row.voice_health_signal ?? "GREEN";

  const borderClass =
    signal === "RED"
      ? "border-red-300"
      : signal === "YELLOW"
        ? "border-amber-300"
        : "border-emerald-300";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={`${CARD} border-2 ${borderClass}`}>
        <CardHeader className="pb-3">
          <CardDescription className={LABEL_UPPER}>直近7日間のボイス利用時間</CardDescription>
          <CardTitle className={`mt-2 text-3xl font-semibold tabular-nums ${TEXT_TITLE}`}>
            {thisWeek.toFixed(2)}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className={`${CARD} border-2 ${borderClass}`}>
        <CardHeader className="pb-3">
          <CardDescription className={LABEL_UPPER}>先週とのボイス時間の変化</CardDescription>
          <CardTitle className={`mt-2 text-3xl font-semibold tabular-nums ${TEXT_TITLE}`}>
            {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
          </CardTitle>
          <p className={`mt-1 text-sm ${TEXT_SUBTLE}`}>
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
  const peakInsight = buildHeatmapPeakInsight(rows);

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>イベントを開催しやすい曜日と時間</CardTitle>
        <CardDescription className={`text-sm ${TEXT_MUTED}`}>
          ボイス活動が特に多い曜日・時間帯を色の濃さで表示します。告知やイベントの候補日時の参考にできます。
        </CardDescription>
        <div
          className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
          role="note"
          aria-label="ヒートマップの示唆"
        >
          <p className={`${LABEL_UPPER} text-blue-700`}>インサイト</p>
          <p className={`mt-2 text-sm leading-relaxed ${TEXT_BODY}`}>{peakInsight.headline}</p>
          {peakInsight.detail ? (
            <p className={`mt-1.5 text-sm ${TEXT_MUTED}`}>{peakInsight.detail}</p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="w-full min-w-[720px]">
          <div className={`mb-2 grid grid-cols-[84px_repeat(24,minmax(18px,1fr))] gap-[4px] text-xs ${TEXT_SUBTLE}`}>
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
                <div className={`flex items-center text-sm font-medium ${TEXT_BODY}`}>{day}</div>
                {matrix[dayIndex].map((value, hour) => {
                  const intensity = value / maxValue;
                  const hasValue = value > 0;
                  const alpha = hasValue ? 0.12 + intensity * 0.78 : 0;
                  const bgColor = hasValue ? `rgba(37, 99, 235, ${alpha})` : "#f1f5f9";
                  return (
                    <div
                      key={`${day}-${hour}`}
                      title={`${day} ${hour}:00 — ${valueFormatter(value)}`}
                      className="h-8 rounded border border-slate-200 text-center text-[10px] leading-8 text-slate-800"
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
    <Card className={`${CARD} chart-readable`}>
      <CardHeader>
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>継続的に参加しているユーザーの分布</CardTitle>
        <CardDescription className={`text-sm ${TEXT_MUTED}`}>
          横軸は1回あたりの平均参加時間（分）、縦軸は参加した週数です。点線は全体の中央値です。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="avg_session_minutes"
                name="平均(分)"
                tick={{ fill: CHART_AXIS, fontSize: 12 }}
              />
              <YAxis type="number" dataKey="active_weeks" name="稼働週" tick={{ fill: CHART_AXIS, fontSize: 12 }} />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={CHART_TOOLTIP}
                formatter={(value: number, name: string) => [
                  typeof value === "number" ? value.toFixed(name.includes("分") ? 1 : 1) : value,
                  name,
                ]}
                labelFormatter={(_, payload) => (payload?.[0] as { payload?: { name?: string } })?.payload?.name ?? ""}
              />
              <ReferenceLine x={mx} stroke="rgba(148, 163, 184, 0.6)" strokeDasharray="4 4" />
              <ReferenceLine y={my} stroke="rgba(148, 163, 184, 0.6)" strokeDasharray="4 4" />
              <Scatter name="ユーザ" data={chartData} fill="#2563eb" />
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
      title="ボイス参加の貢献度が高いユーザー"
      rows={rows}
      nameColumnLabel="ユーザー"
      valueColumnLabel="貢献度スコア"
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
    <Card className={`${CARD} chart-readable chart-bar-strong`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>ボイス利用が集中しているチャンネル</CardTitle>
            <CardDescription className={`text-sm ${TEXT_MUTED}`}>
              ボイス利用時間の割合が大きいチャンネル上位20件と、全体の集中度指標です。
            </CardDescription>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-semibold tabular-nums ${TEXT_TITLE}`}>{hhi.toFixed(0)}</p>
            <span className="mt-1 inline-block rounded-md border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-sm text-slate-600">
              {status}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: CHART_AXIS, fontSize: 11 }} unit="%" />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: CHART_AXIS, fontSize: 11 }}
                interval={0}
              />
              <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: number) => [`${v.toFixed(2)}%`, "シェア"]} />
              <Bar dataKey="share" fill={LINE_SECONDARY} radius={[0, 4, 4, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

