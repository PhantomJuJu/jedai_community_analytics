import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@databricks/appkit-ui/react";
import { useAnalyticsQuery } from "@databricks/appkit-ui/react";
import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
} from "recharts";
import { AnnouncementPanel } from "./AnnouncementPanel.js";
import { VoiceAnalyticsTab } from "./VoiceAnalytics.js";

type WeekdayHourRow = {
  weekday_display?: string;
  hour_slot?: number | string;
  message_count_aggregated?: number | string;
  voice_duration_hours?: number | string;
};

const WEEKDAY_ORDER = ["1. 月", "2. 火", "3. 水", "4. 木", "5. 金", "6. 土", "7. 日"];

function toNumber(value: number | string | undefined): number {
  return Number(value ?? 0);
}

const CARD = "rounded-xl border border-white/[0.07] bg-[#1a1b2e] transition-colors hover:bg-[#1e2035]";

function KpiStrip() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_summary_kpis", params);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  const row = data?.[0] as
    | { total_messages?: string | number; total_voice_hours?: string | number }
    | undefined;
  if (!row) {
    return <p className="text-sm text-[#9898b8]">サマリー未取得</p>;
  }
  const messages = Number(row.total_messages ?? 0);
  const hours = Number(row.total_voice_hours ?? 0);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            今月の合計メッセージ数
          </CardDescription>
          <CardTitle className="mt-2 text-4xl font-semibold tabular-nums text-[#f0f0ff]">
            {messages.toLocaleString()}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            今月の合計ボイス時間（時間）
          </CardDescription>
          <CardTitle className="mt-2 text-4xl font-semibold tabular-nums text-[#f0f0ff]">
            {hours.toFixed(2)}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

function MessageTrendCard() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_daily_message_trend", params);

  if (loading) return <Skeleton className="h-[360px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = (data ?? []) as Array<{ activity_date?: string; message_count?: number | string }>;
  const chartData = rows.map((row) => ({
    activity_date: row.activity_date ?? "",
    message_count: toNumber(row.message_count),
  }));

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">メッセージ数トレンド</CardTitle>
        <CardDescription className="text-sm text-[#9898b8]">日次メッセージ数の推移</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis
                dataKey="activity_date"
                tick={{ fill: "#f0f0ff", fontSize: 12 }}
                tickLine={{ stroke: "rgba(255,255,255,0.4)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.4)" }}
              />
              <YAxis
                tick={{ fill: "#f0f0ff", fontSize: 12 }}
                tickLine={{ stroke: "rgba(255,255,255,0.4)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.4)" }}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Line
                type="monotone"
                dataKey="message_count"
                stroke="#7c5cd6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: "#9b7ee8" }}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function VoiceTrendCard() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_daily_voice_trend", params);

  if (loading) return <Skeleton className="h-[360px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = (data ?? []) as Array<{ activity_date?: string; voice_hours?: number | string }>;
  const chartData = rows.map((row) => ({
    activity_date: row.activity_date ?? "",
    voice_hours: toNumber(row.voice_hours),
  }));

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">ボイスチャット時間トレンド</CardTitle>
        <CardDescription className="text-sm text-[#9898b8]">日次ボイス接続時間の推移</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis
                dataKey="activity_date"
                tick={{ fill: "#f0f0ff", fontSize: 12 }}
                tickLine={{ stroke: "rgba(255,255,255,0.4)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.4)" }}
              />
              <YAxis
                tick={{ fill: "#f0f0ff", fontSize: 12 }}
                tickLine={{ stroke: "rgba(255,255,255,0.4)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.4)" }}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Line
                type="monotone"
                dataKey="voice_hours"
                stroke="#5a9cf8"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: "#7fb4ff" }}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekdayMessageBarChart() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_by_weekday_hour", params);

  if (loading) return <Skeleton className="h-[320px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const grouped = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ weekday_display?: string; message_count_aggregated?: number | string }>) {
    const key = row.weekday_display ?? "unknown";
    grouped.set(key, (grouped.get(key) ?? 0) + toNumber(row.message_count_aggregated));
  }
  const chartData = WEEKDAY_ORDER.map((day) => ({ weekday: day, value: grouped.get(day) ?? 0 }));

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">曜日別メッセージ数</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis dataKey="weekday" tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Bar dataKey="value" fill="#7c5cd6" radius={[6, 6, 0, 0]} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekdayVoiceChart() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_by_weekday_hour", params);

  if (loading) return <Skeleton className="h-[320px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const grouped = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ weekday_display?: string; voice_duration_hours?: number | string }>) {
    const key = row.weekday_display ?? "unknown";
    grouped.set(key, (grouped.get(key) ?? 0) + toNumber(row.voice_duration_hours));
  }
  const chartData = WEEKDAY_ORDER.map((day) => ({ weekday: day, value: grouped.get(day) ?? 0 }));

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">曜日別ボイスチャット時間</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis dataKey="weekday" tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Bar dataKey="value" fill="#5a9cf8" radius={[6, 6, 0, 0]} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function UserVoiceRankingChart() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("user_voice_ranking", params);

  if (loading) return <Skeleton className="h-[320px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const chartData = ((data ?? []) as Array<{ user_name?: string; voice_hours?: number | string }>)
    .slice(0, 25)
    .map((row) => ({ name: row.user_name ?? "unknown", value: toNumber(row.voice_hours) }));

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">
          ユーザ別ボイス時間ランキング（上位25）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 30 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#f0f0ff", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={54}
              />
              <YAxis tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Bar dataKey="value" fill="#5a9cf8" radius={[6, 6, 0, 0]} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function UserMessageRankingChart() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("user_messages_ranking", params);

  if (loading) return <Skeleton className="h-[320px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const chartData = ((data ?? []) as Array<{ user_name?: string; message_count?: number | string }>)
    .slice(0, 25)
    .map((row) => ({ name: row.user_name ?? "unknown", value: toNumber(row.message_count) }));

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">
          ユーザ別メッセージランキング（上位25）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 30 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#f0f0ff", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={54}
              />
              <YAxis tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{
                  background: "#12121e",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#f0f0ff",
                }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Bar dataKey="value" fill="#7c5cd6" radius={[6, 6, 0, 0]} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function HeatmapCard({
  title,
  valueField,
  valueFormatter,
}: {
  title: string;
  valueField: "message_count_aggregated" | "voice_duration_hours";
  valueFormatter: (value: number) => string;
}) {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_by_weekday_hour", params);

  if (loading) {
    return <Skeleton className="h-[440px] w-full" />;
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const rows = (data ?? []) as WeekdayHourRow[];

  for (const row of rows) {
    const weekday = WEEKDAY_ORDER.indexOf(row.weekday_display ?? "");
    const hour = Math.max(0, Math.min(23, Math.floor(toNumber(row.hour_slot))));
    if (weekday < 0) continue;
    matrix[weekday][hour] += toNumber(row[valueField]);
  }

  const maxValue = Math.max(1, ...matrix.flat());
  const isMessage = valueField === "message_count_aggregated";

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">{title}</CardTitle>
        <CardDescription className="text-sm text-[#9898b8]">
          曜日・時間帯別のアクティビティ分布
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="mx-auto min-w-[720px] max-w-[860px]">
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
                  const bgColor = hasValue
                    ? isMessage
                      ? `rgba(124, 92, 214, ${alpha})`
                      : `rgba(90, 156, 248, ${alpha})`
                    : "#1e1f30";
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

function RankingTableCard({
  title,
  rows,
  nameColumnLabel,
  valueColumnLabel,
  valueFormatter,
}: {
  title: string;
  rows: Array<{ name: string; value: number }>;
  nameColumnLabel: string;
  valueColumnLabel: string;
  valueFormatter: (value: number) => string;
}) {
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
            {rows.map((row, index) => (
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
      </CardContent>
    </Card>
  );
}

function UserMessageTable() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("user_messages_ranking", params);

  if (loading) return <Skeleton className="h-[300px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = ((data ?? []) as Array<{ user_name?: string; message_count?: number | string }>).map(
    (row) => ({
      name: row.user_name || "unknown",
      value: toNumber(row.message_count),
    }),
  );

  return (
    <RankingTableCard
      title="ユーザ別メッセージランキング"
      rows={rows}
      nameColumnLabel="ユーザ"
      valueColumnLabel="メッセージ数"
      valueFormatter={(value) => value.toLocaleString()}
    />
  );
}

function ChannelActivityTable() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("channel_activity", params);

  if (loading) return <Skeleton className="h-[300px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const merged = new Map<string, number>();
  const rows = (data ?? []) as Array<{
    channel_name?: string;
    message_count_aggregated?: number | string;
  }>;
  for (const row of rows) {
    const key = row.channel_name || "unknown";
    merged.set(key, (merged.get(key) ?? 0) + toNumber(row.message_count_aggregated));
  }
  const aggregatedRows = [...merged.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 25);

  return (
    <RankingTableCard
      title="チャンネル別メッセージランキング"
      rows={aggregatedRows}
      nameColumnLabel="チャンネル"
      valueColumnLabel="メッセージ数"
      valueFormatter={(value) => value.toLocaleString()}
    />
  );
}

function NotesCard() {
  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">補足・凡例</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm text-[#9898b8]">
        <p>メッセージ数: Discord上でのテキストメッセージ送信回数</p>
        <p>ボイスチャット使用時間: ボイスチャンネル接続時間（時間）</p>
        <p>ヒートマップ: 値が大きいほどセルの色が濃くなります</p>
      </CardContent>
    </Card>
  );
}

export default function App() {
  return (
    <div className="min-h-screen px-6 py-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1500px]">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-[#5a5a7a]">
          Community Analytics
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[#f0f0ff]">JEDAI Discord</h1>
        <p className="mt-1 text-sm text-[#9898b8]">コミュニティ活動の統計ダッシュボード</p>
      </header>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mb-6 h-auto w-full justify-start gap-0 rounded-none border-b border-white/[0.07] bg-transparent p-0">
          <TabsTrigger
            value="dashboard"
            className="rounded-none border-b-2 border-transparent px-5 py-2.5 text-sm font-medium text-[#9898b8] transition-colors data-[state=active]:border-[#7c5cd6] data-[state=active]:bg-transparent data-[state=active]:text-[#f0f0ff]"
          >
            ダッシュボード
          </TabsTrigger>
          <TabsTrigger
            value="announcement"
            className="rounded-none border-b-2 border-transparent px-5 py-2.5 text-sm font-medium text-[#9898b8] transition-colors data-[state=active]:border-[#7c5cd6] data-[state=active]:bg-transparent data-[state=active]:text-[#f0f0ff]"
          >
            告知ジェネレータ
          </TabsTrigger>
          <TabsTrigger
            value="voice"
            className="rounded-none border-b-2 border-transparent px-5 py-2.5 text-sm font-medium text-[#9898b8] transition-colors data-[state=active]:border-[#7c5cd6] data-[state=active]:bg-transparent data-[state=active]:text-[#f0f0ff]"
          >
            ボイス分析
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <KpiStrip />

          <div className="grid gap-4 xl:grid-cols-2">
            <MessageTrendCard />
            <VoiceTrendCard />
          </div>

          <HeatmapCard
            title="曜日 × 時間帯　メッセージ数ヒートマップ"
            valueField="message_count_aggregated"
            valueFormatter={(value) => value.toLocaleString()}
          />
          <HeatmapCard
            title="曜日 × 時間帯　ボイス使用時間ヒートマップ"
            valueField="voice_duration_hours"
            valueFormatter={(value) => value.toFixed(1)}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <WeekdayMessageBarChart />
            <WeekdayVoiceChart />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <UserMessageRankingChart />
            <UserVoiceRankingChart />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <UserMessageTable />
            <ChannelActivityTable />
          </div>

          <NotesCard />
        </TabsContent>

        <TabsContent value="announcement" className="mt-0">
          <AnnouncementPanel />
        </TabsContent>

        <TabsContent value="voice" className="space-y-4">
          <VoiceAnalyticsTab />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
