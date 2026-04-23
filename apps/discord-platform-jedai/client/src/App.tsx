import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@databricks/appkit-ui/react";
import { useAnalyticsQuery } from "@databricks/appkit-ui/react";
import { createContext, useContext, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  guild_name?: string;
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
const ALL_GUILDS = "__ALL_GUILDS__";
const ALL_CHANNELS = "__ALL_CHANNELS__";

type FilterState = {
  dateFrom: string;
  dateTo: string;
  guildName: string;
  channelName: string;
};

type FilterContextValue = {
  filters: FilterState;
  setFilters: Dispatch<SetStateAction<FilterState>>;
  resetFilters: () => void;
};

const DEFAULT_FILTERS: FilterState = {
  dateFrom: "",
  dateTo: "",
  guildName: "",
  channelName: "",
};

const FilterContext = createContext<FilterContextValue | null>(null);

function useFilterContext(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilterContext must be used inside FilterContext provider");
  }
  return context;
}

function inDateRange(dateValue: string | undefined, dateFrom: string, dateTo: string): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!dateValue) return false;
  if (dateFrom && dateValue < dateFrom) return false;
  if (dateTo && dateValue > dateTo) return false;
  return true;
}

function matchGuild(guildName: string | undefined, filterGuild: string): boolean {
  if (!filterGuild) return true;
  return guildName === filterGuild;
}

function matchChannel(channelName: string | undefined, filterChannel: string): boolean {
  if (!filterChannel) return true;
  return channelName === filterChannel;
}

function FilterBar() {
  const { filters, setFilters, resetFilters } = useFilterContext();
  const params = useMemo(() => ({}), []);
  const { data } = useAnalyticsQuery("channel_activity", params);

  const rows = (data ?? []) as Array<{ guild_name?: string; channel_name?: string }>;

  const guildOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.guild_name).filter((name): name is string => Boolean(name)))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [rows],
  );

  const channelOptions = useMemo(() => {
    const filteredRows = filters.guildName ? rows.filter((row) => row.guild_name === filters.guildName) : rows;
    return [...new Set(filteredRows.map((row) => row.channel_name).filter((name): name is string => Boolean(name)))].sort(
      (a, b) => a.localeCompare(b, "ja"),
    );
  }, [filters.guildName, rows]);

  const hasActiveFilters = Boolean(filters.dateFrom || filters.dateTo || filters.guildName || filters.channelName);

  return (
    <Card className="rounded-2xl border border-white/[0.08] bg-[#0e0f1e]/80 shadow-[0_14px_60px_-24px_rgba(124,92,214,0.6)] backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#5a5a7a]">
              Filters
            </CardDescription>
            <CardTitle className="mt-2 text-base font-semibold text-[#f0f0ff]">表示条件</CardTitle>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-[#d0d0f4] transition-colors hover:bg-white/10 hover:text-[#f0f0ff]"
            >
              クリア
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-5 md:grid-cols-3">
        <div
          className={`rounded-xl border bg-[#14152a]/80 p-3 transition ${
            filters.dateFrom || filters.dateTo ? "border-[#7c5cd6]/60 ring-1 ring-[#7c5cd6]/40" : "border-white/[0.08]"
          }`}
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#6e6e96]">期間</p>
          <div className="grid gap-2">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  dateFrom: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-white/[0.12] bg-[#101126] px-3 text-xs text-[#f0f0ff] outline-none transition focus:border-[#7c5cd6]"
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  dateTo: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-white/[0.12] bg-[#101126] px-3 text-xs text-[#f0f0ff] outline-none transition focus:border-[#7c5cd6]"
            />
          </div>
        </div>

        <div
          className={`rounded-xl border bg-[#14152a]/80 p-3 transition ${
            filters.guildName ? "border-[#7c5cd6]/60 ring-1 ring-[#7c5cd6]/40" : "border-white/[0.08]"
          }`}
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#6e6e96]">Guild</p>
          <Select
            value={filters.guildName || ALL_GUILDS}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                guildName: value === ALL_GUILDS ? "" : value,
                channelName: "",
              }))
            }
          >
            <SelectTrigger className="h-9 border-white/[0.12] bg-[#101126] text-xs text-[#f0f0ff]">
              <SelectValue placeholder="すべてのGuild" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.12] bg-[#101126] text-[#f0f0ff]">
              <SelectItem value={ALL_GUILDS}>すべてのGuild</SelectItem>
              {guildOptions.map((guildName) => (
                <SelectItem key={guildName} value={guildName}>
                  {guildName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          className={`rounded-xl border bg-[#14152a]/80 p-3 transition ${
            filters.channelName ? "border-[#7c5cd6]/60 ring-1 ring-[#7c5cd6]/40" : "border-white/[0.08]"
          }`}
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#6e6e96]">Channel</p>
          <Select
            value={filters.channelName || ALL_CHANNELS}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                channelName: value === ALL_CHANNELS ? "" : value,
              }))
            }
          >
            <SelectTrigger className="h-9 border-white/[0.12] bg-[#101126] text-xs text-[#f0f0ff]">
              <SelectValue placeholder="すべてのChannel" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.12] bg-[#101126] text-[#f0f0ff]">
              <SelectItem value={ALL_CHANNELS}>すべてのChannel</SelectItem>
              {channelOptions.map((channelName) => (
                <SelectItem key={channelName} value={channelName}>
                  {channelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const { filters } = useFilterContext();
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_daily_message_trend", params);

  if (loading) return <Skeleton className="h-[360px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = (data ?? []) as Array<{ activity_date?: string; guild_name?: string; message_count?: number | string }>;
  const filteredRows = rows.filter(
    (row) => inDateRange(row.activity_date, filters.dateFrom, filters.dateTo) && matchGuild(row.guild_name, filters.guildName),
  );
  const chartData = filteredRows.map((row) => ({
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
  const { filters } = useFilterContext();
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_daily_voice_trend", params);

  if (loading) return <Skeleton className="h-[360px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = (data ?? []) as Array<{ activity_date?: string; guild_name?: string; voice_hours?: number | string }>;
  const filteredRows = rows.filter(
    (row) => inDateRange(row.activity_date, filters.dateFrom, filters.dateTo) && matchGuild(row.guild_name, filters.guildName),
  );
  const chartData = filteredRows.map((row) => ({
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
  const { filters } = useFilterContext();
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_by_weekday_hour", params);

  if (loading) return <Skeleton className="h-[320px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const grouped = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    weekday_display?: string;
    guild_name?: string;
    message_count_aggregated?: number | string;
  }>) {
    if (!matchGuild(row.guild_name, filters.guildName)) continue;
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
  const { filters } = useFilterContext();
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_by_weekday_hour", params);

  if (loading) return <Skeleton className="h-[320px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const grouped = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    weekday_display?: string;
    guild_name?: string;
    voice_duration_hours?: number | string;
  }>) {
    if (!matchGuild(row.guild_name, filters.guildName)) continue;
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
  const { filters } = useFilterContext();
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
    if (!matchGuild(row.guild_name, filters.guildName)) continue;
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
  const { filters } = useFilterContext();
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("channel_activity", params);

  if (loading) return <Skeleton className="h-[300px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const merged = new Map<string, number>();
  const rows = (data ?? []) as Array<{
    guild_name?: string;
    channel_name?: string;
    message_count_aggregated?: number | string;
  }>;
  for (const row of rows) {
    if (!matchGuild(row.guild_name, filters.guildName)) continue;
    if (!matchChannel(row.channel_name, filters.channelName)) continue;
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

export default function App() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const filterContext = useMemo(
    () => ({
      filters,
      setFilters,
      resetFilters: () => setFilters(DEFAULT_FILTERS),
    }),
    [filters],
  );

  return (
    <FilterContext.Provider value={filterContext}>
      <div className="min-h-screen px-6 py-8 lg:px-10">
        <div className="mx-auto w-full max-w-[1500px]">
          <header className="mb-8">
            <p className="text-xs font-medium uppercase tracking-widest text-[#5a5a7a]">Community Analytics</p>
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
              <FilterBar />
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
    </FilterContext.Provider>
  );
}
