import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@databricks/appkit-ui/react";
import { useAnalyticsQuery } from "@databricks/appkit-ui/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LineChart as RechartsLineChart,
} from "recharts";
import { AnnouncementPanel } from "./AnnouncementPanel.js";
import {
  VoiceChannelHhiCard,
  VoiceChurnRiskTable,
  VoiceHeatmapCard,
  VoiceLtvRankingTable,
  VoiceSessionScatterCard,
} from "./VoiceAnalytics.js";

const CARD = "rounded-xl border border-white/[0.07] bg-[#1a1b2e] transition-colors hover:bg-[#1e2035]";
const ALL_GUILDS = "__ALL_GUILDS__";
const DEFAULT_MAX_RANK_ROWS = 10;

type FilterState = {
  selectedMonth: string;
  guildName: string;
  categoryNames: string[];
};

type FilterContextValue = {
  filters: FilterState;
  setFilters: Dispatch<SetStateAction<FilterState>>;
  resetFilters: () => void;
};

const DEFAULT_FILTERS: FilterState = {
  selectedMonth: "",
  guildName: "",
  categoryNames: [],
};

const FilterContext = createContext<FilterContextValue | null>(null);

function useFilterContext(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilterContext must be used inside FilterContext provider");
  }
  return context;
}

function toNumber(value: number | string | undefined): number {
  return Number(value ?? 0);
}

function inSelectedMonth(dateValue: string | undefined, month: string): boolean {
  if (!month) return true;
  return (dateValue ?? "").startsWith(month);
}

function matchGuild(guildName: string | undefined, filterGuild: string): boolean {
  if (!filterGuild) return true;
  return guildName === filterGuild;
}

function matchCategory(categoryName: string | undefined, categories: string[]): boolean {
  if (categories.length === 0) return true;
  return categories.includes(categoryName ?? "");
}

function formatMonthLabel(month: string): string {
  const [year, monthPart] = month.split("-");
  return `${year}年${monthPart}月`;
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-1 mt-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#5a5a7a]">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold text-[#f0f0ff]">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-[#9898b8]">{description}</p> : null}
    </div>
  );
}

function FilterBar() {
  const { filters, setFilters, resetFilters } = useFilterContext();
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const categoryPanelRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedMonth = useRef(false);

  return (
    <FilterBarContent
      key={refreshKey}
      filters={filters}
      setFilters={setFilters}
      resetFilters={resetFilters}
      isCategoryOpen={isCategoryOpen}
      setIsCategoryOpen={setIsCategoryOpen}
      categoryPanelRef={categoryPanelRef}
      hasInitializedMonth={hasInitializedMonth}
      onRefresh={() => setRefreshKey((prev) => prev + 1)}
    />
  );
}

function FilterBarContent({
  filters,
  setFilters,
  resetFilters,
  isCategoryOpen,
  setIsCategoryOpen,
  categoryPanelRef,
  hasInitializedMonth,
  onRefresh,
}: {
  filters: FilterState;
  setFilters: Dispatch<SetStateAction<FilterState>>;
  resetFilters: () => void;
  isCategoryOpen: boolean;
  setIsCategoryOpen: Dispatch<SetStateAction<boolean>>;
  categoryPanelRef: RefObject<HTMLDivElement | null>;
  hasInitializedMonth: MutableRefObject<boolean>;
  onRefresh: () => void;
}) {
  const params = useMemo(() => ({}), []);
  const { data: channelData, loading: channelLoading } = useAnalyticsQuery("channel_activity", params);
  const { data: trendData, loading: trendLoading } = useAnalyticsQuery("activity_daily_message_trend", params);

  const channelRows = (channelData ?? []) as Array<{
    guild_name?: string;
    category_name?: string;
  }>;
  const trendRows = (trendData ?? []) as Array<{ activity_date?: string }>;

  const monthOptions = useMemo(
    () =>
      [...new Set(trendRows.map((row) => (row.activity_date ?? "").slice(0, 7)).filter((month) => month.length === 7))].sort(),
    [trendRows],
  );

  useEffect(() => {
    if (monthOptions.length > 0 && !hasInitializedMonth.current && filters.selectedMonth === "") {
      hasInitializedMonth.current = true;
      setFilters((prev) => ({
        ...prev,
        selectedMonth: monthOptions[monthOptions.length - 1] ?? "",
      }));
    }
  }, [monthOptions, filters.selectedMonth, setFilters, hasInitializedMonth]);

  const guildOptions = useMemo(
    () =>
      [...new Set(channelRows.map((row) => row.guild_name).filter((name): name is string => Boolean(name)))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [channelRows],
  );

  const categoryOptions = useMemo(() => {
    const scopedRows = filters.guildName
      ? channelRows.filter((row) => row.guild_name === filters.guildName)
      : channelRows;
    return [...new Set(scopedRows.map((row) => row.category_name).filter((name): name is string => Boolean(name)))].sort((a, b) =>
      a.localeCompare(b, "ja"),
    );
  }, [channelRows, filters.guildName]);

  const hasActiveFilters = Boolean(filters.selectedMonth || filters.guildName || filters.categoryNames.length > 0);

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={channelLoading || trendLoading}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-[#d0d0f4] transition-colors hover:bg-white/10 hover:text-[#f0f0ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {channelLoading || trendLoading ? "更新中…" : "更新"}
            </button>
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
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-5 md:grid-cols-3">
        <div
          className={`rounded-xl border bg-[#14152a]/80 p-3 transition ${
            filters.selectedMonth ? "border-[#7c5cd6]/60 ring-1 ring-[#7c5cd6]/40" : "border-white/[0.08]"
          }`}
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#6e6e96]">期間（月）</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, selectedMonth: "" }))}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                filters.selectedMonth === ""
                  ? "border-[#7c5cd6] bg-[#7c5cd6] text-white"
                  : "border-white/[0.15] bg-[#101126] text-[#c9c9e7] hover:border-white/[0.3]"
              }`}
            >
              全期間
            </button>
            {monthOptions.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, selectedMonth: month }))}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  filters.selectedMonth === month
                    ? "border-[#7c5cd6] bg-[#7c5cd6] text-white"
                    : "border-white/[0.15] bg-[#101126] text-[#c9c9e7] hover:border-white/[0.3]"
                }`}
              >
                {formatMonthLabel(month)}
              </button>
            ))}
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
                categoryNames: [],
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
          ref={categoryPanelRef}
          className={`relative rounded-xl border bg-[#14152a]/80 p-3 transition ${
            filters.categoryNames.length > 0 ? "border-[#7c5cd6]/60 ring-1 ring-[#7c5cd6]/40" : "border-white/[0.08]"
          }`}
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#6e6e96]">Category（複数）</p>
          <button
            type="button"
            onClick={() => setIsCategoryOpen((prev) => !prev)}
            className="h-9 w-full rounded-lg border border-white/[0.12] bg-[#101126] px-3 text-left text-xs text-[#f0f0ff]"
          >
            {filters.categoryNames.length === 0 ? "すべてのカテゴリ" : `${filters.categoryNames.length}件選択中`}
          </button>
          {filters.categoryNames.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.categoryNames.map((name) => (
                <span key={name} className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-[#e1e1ff]">
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          {isCategoryOpen ? (
            <div className="absolute left-0 top-[78px] z-20 w-full rounded-lg border border-white/[0.15] bg-[#0f1020] p-2 shadow-xl">
              <button
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    categoryNames: [],
                  }))
                }
                className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-[#cfcfeb] hover:bg-white/10"
              >
                すべて解除
              </button>
              <div className="max-h-48 overflow-y-auto">
                {categoryOptions.map((categoryName) => {
                  const checked = filters.categoryNames.includes(categoryName);
                  return (
                    <label key={categoryName} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-white/10">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setFilters((prev) => ({
                            ...prev,
                            categoryNames: checked
                              ? prev.categoryNames.filter((item) => item !== categoryName)
                              : [...prev.categoryNames, categoryName],
                          }))
                        }
                        className="h-3.5 w-3.5 accent-[#7c5cd6]"
                      />
                      <span className="text-xs text-[#d7d7f4]">{categoryName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiStrip() {
  const { filters } = useFilterContext();
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_by_category_daily", params);
  const { data: weeklyData, loading: weeklyLoading, error: weeklyError } = useAnalyticsQuery("voice_weekly_kpi", params);

  if (loading || weeklyLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (weeklyError) return <p className="text-sm text-destructive">{weeklyError}</p>;

  const rows = (data ?? []) as Array<{
    activity_date?: string;
    guild_name?: string;
    category_name?: string;
    message_count?: number | string;
    voice_duration_hours?: number | string;
    voice_duration_seconds?: number | string;
  }>;

  const filteredRows = rows.filter(
    (row) =>
      inSelectedMonth(row.activity_date, filters.selectedMonth) &&
      matchGuild(row.guild_name, filters.guildName) &&
      matchCategory(row.category_name, filters.categoryNames),
  );

  const messages = filteredRows.reduce((sum, row) => sum + toNumber(row.message_count), 0);
  const hours = filteredRows.reduce((sum, row) => {
    const hoursFromRow = Math.max(toNumber(row.voice_duration_hours), 0);
    if (hoursFromRow !== 0) {
      return sum + hoursFromRow;
    }
    return sum + Math.max(toNumber(row.voice_duration_seconds), 0) / 3600;
  }, 0);

  const weeklyRow = (weeklyData ?? [])[0] as
    | {
        this_week_voice_hours?: number | string;
        last_week_voice_hours?: number | string;
        voice_growth_rate_pct?: number | string | null;
        voice_health_signal?: string;
      }
    | undefined;
  const thisWeekHours = toNumber(weeklyRow?.this_week_voice_hours);
  const lastWeekHours = toNumber(weeklyRow?.last_week_voice_hours);
  const pctRaw = weeklyRow?.voice_growth_rate_pct;
  const growthPct = pctRaw === null || pctRaw === undefined ? null : toNumber(pctRaw);
  const signal = weeklyRow?.voice_health_signal ?? "GREEN";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            選択期間の合計メッセージ数
          </CardDescription>
          <CardTitle className="mt-2 text-4xl font-semibold tabular-nums text-[#f0f0ff]">{messages.toLocaleString()}</CardTitle>
        </CardHeader>
      </Card>
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            選択期間の合計ボイス時間（時間）
          </CardDescription>
          <CardTitle className="mt-2 text-4xl font-semibold tabular-nums text-[#f0f0ff]">{hours.toFixed(2)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            前週比（%） / 健全性シグナル
          </CardDescription>
          <CardTitle className="mt-2 text-3xl font-semibold tabular-nums text-[#f0f0ff]">
            {growthPct === null ? "—" : `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`}
          </CardTitle>
          <p className="mt-1 text-xs text-[#7a7a9a]">
            前週: {lastWeekHours.toFixed(2)}h · signal: {signal}
          </p>
        </CardHeader>
      </Card>
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
            今週のボイス時間（直近7日・時間）
          </CardDescription>
          <CardTitle className="mt-2 text-4xl font-semibold tabular-nums text-[#f0f0ff]">{thisWeekHours.toFixed(2)}</CardTitle>
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
  const chartData = rows
    .filter(
      (row) => inSelectedMonth(row.activity_date, filters.selectedMonth) && matchGuild(row.guild_name, filters.guildName),
    )
    .map((row) => ({
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
              <XAxis dataKey="activity_date" tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.4)" }} />
              <YAxis tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.4)" }} width={48} />
              <Tooltip
                contentStyle={{ background: "#12121e", border: "1px solid rgba(255,255,255,0.18)", color: "#f0f0ff" }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Line type="monotone" dataKey="message_count" stroke="#7c5cd6" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
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
  const chartData = rows
    .filter(
      (row) => inSelectedMonth(row.activity_date, filters.selectedMonth) && matchGuild(row.guild_name, filters.guildName),
    )
    .map((row) => ({
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
              <XAxis dataKey="activity_date" tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.4)" }} />
              <YAxis tick={{ fill: "#f0f0ff", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.4)" }} width={48} />
              <Tooltip
                contentStyle={{ background: "#12121e", border: "1px solid rgba(255,255,255,0.18)", color: "#f0f0ff" }}
                labelStyle={{ color: "#f0f0ff" }}
              />
              <Line type="monotone" dataKey="voice_hours" stroke="#5a9cf8" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            </RechartsLineChart>
          </ResponsiveContainer>
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
  maxRows = DEFAULT_MAX_RANK_ROWS,
  showAllToggle = true,
  description,
}: {
  title: string;
  rows: Array<{ name: string; value: number }>;
  nameColumnLabel: string;
  valueColumnLabel: string;
  valueFormatter: (value: number) => string;
  maxRows?: number;
  showAllToggle?: boolean;
  description?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll ? rows : rows.slice(0, maxRows);
  const canToggle = showAllToggle && rows.length > maxRows;

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">{title}</CardTitle>
        {description ? <CardDescription className="text-xs text-[#9898b8]">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#9898b8]">Rank</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#9898b8]">{nameColumnLabel}</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-widest text-[#9898b8]">{valueColumnLabel}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr key={`${row.name}-${index}`} className="border-b border-white/[0.05] transition-colors hover:bg-[#1e2035]">
                <td className="px-5 py-3 tabular-nums text-[#5a5a7a]">{index + 1}</td>
                <td className="px-5 py-3 text-[#f0f0ff]">{row.name}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#f0f0ff]">{valueFormatter(row.value)}</td>
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

function UserMessageTable() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("user_messages_ranking", params);

  if (loading) return <Skeleton className="h-[300px] w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const rows = ((data ?? []) as Array<{ user_name?: string; message_count?: number | string }>).map((row) => ({
    name: row.user_name || "unknown",
    value: toNumber(row.message_count),
  }));

  return (
    <RankingTableCard
      title="ユーザ別メッセージランキング"
      rows={rows}
      nameColumnLabel="ユーザ"
      valueColumnLabel="メッセージ数"
      valueFormatter={(value) => value.toLocaleString()}
      description="カテゴリフィルタは未対応（このカードは全体集計）"
      maxRows={DEFAULT_MAX_RANK_ROWS}
      showAllToggle
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
    category_name?: string;
    message_count_aggregated?: number | string;
  }>;
  for (const row of rows) {
    if (!matchGuild(row.guild_name, filters.guildName)) continue;
    if (!matchCategory(row.category_name, filters.categoryNames)) continue;
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
      maxRows={DEFAULT_MAX_RANK_ROWS}
      showAllToggle
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
      <div className="min-h-screen px-4 py-6 lg:px-6">
        <div className="mx-auto w-full max-w-[1760px]">
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
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <FilterBar />
              <SectionHeading eyebrow="Summary" title="サマリー KPI" description="選択した期間・Guild・カテゴリで集計" />
              <KpiStrip />
              <SectionHeading eyebrow="Trend" title="トレンド" />
              <div className="grid gap-4 xl:grid-cols-2">
                <MessageTrendCard />
                <VoiceTrendCard />
              </div>
              <VoiceHeatmapCard />
              <SectionHeading eyebrow="Channel" title="チャンネル分析" />
              <div className="grid gap-4 xl:grid-cols-2">
                <ChannelActivityTable />
                <VoiceChannelHhiCard />
              </div>
              <SectionHeading eyebrow="User" title="ユーザ分析" />
              <div className="grid gap-4 xl:grid-cols-2">
                <UserMessageTable />
                <VoiceLtvRankingTable />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <VoiceChurnRiskTable />
                <VoiceSessionScatterCard />
              </div>
            </TabsContent>

            <TabsContent value="announcement" className="mt-0">
              <AnnouncementPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </FilterContext.Provider>
  );
}
