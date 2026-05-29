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
import { GeniePanel } from "./GeniePanel.js";
import {
  VoiceChannelHhiCard,
  VoiceChurnRiskTable,
  VoiceHeatmapCard,
  VoiceLtvRankingTable,
  VoiceSessionScatterCard,
} from "./VoiceAnalytics.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { useTheme } from "./ThemeProvider.js";
import {
  BTN_SECONDARY,
  CARD,
  CARD_FILTER_ACTIVE,
  CHIP_ACTIVE,
  CHIP_INACTIVE,
  getChartColors,
  HEADER_BORDER,
  INPUT_SURFACE,
  LABEL_UPPER,
  LINE_PRIMARY,
  LINE_SECONDARY,
  PAGE_BG,
  SELECT_CONTENT,
  SELECT_TRIGGER,
  SIDEBAR_NAV_LIST,
  SIDEBAR_NAV_TRIGGER,
  SURFACE_ELEVATED,
  SURFACE_MUTED,
  TABLE_BORDER,
  TABLE_HEAD,
  TABLE_HEAD_BG,
  TABLE_ROW_BORDER,
  TABLE_ROW_HOVER,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_SUBTLE,
  TEXT_TITLE,
} from "./theme.js";
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
      <p className={LABEL_UPPER}>{eyebrow}</p>
      <h2 className={`mt-1 text-xl font-semibold ${TEXT_TITLE}`}>{title}</h2>
      {description ? <p className={`mt-1 text-base ${TEXT_MUTED}`}>{description}</p> : null}
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
    <Card className={CARD}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardDescription className={LABEL_UPPER}>フィルター</CardDescription>
            <CardTitle className={`mt-2 text-base font-semibold ${TEXT_TITLE}`}>表示条件</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={channelLoading || trendLoading}
              className={BTN_SECONDARY}
            >
              {channelLoading || trendLoading ? "更新中…" : "更新"}
            </button>
            {hasActiveFilters ? (
              <button type="button" onClick={resetFilters} className={BTN_SECONDARY}>
                クリア
              </button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-5">
        <div
          className={`rounded-lg border p-3 transition ${SURFACE_MUTED} ${
            filters.selectedMonth ? CARD_FILTER_ACTIVE : "border-border"
          }`}
        >
          <p className={`mb-2 ${LABEL_UPPER}`}>期間（月）</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, selectedMonth: "" }))}
              className={`rounded-md border px-3 py-1.5 text-base transition ${
                filters.selectedMonth === "" ? CHIP_ACTIVE : CHIP_INACTIVE
              }`}
            >
              全期間
            </button>
            {monthOptions.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, selectedMonth: month }))}
                className={`rounded-md border px-3 py-1.5 text-base transition ${
                  filters.selectedMonth === month ? CHIP_ACTIVE : CHIP_INACTIVE
                }`}
              >
                {formatMonthLabel(month)}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`rounded-lg border p-3 transition ${SURFACE_MUTED} ${
            filters.guildName ? CARD_FILTER_ACTIVE : "border-border"
          }`}
        >
          <p className={`mb-2 ${LABEL_UPPER}`}>Guild</p>
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
            <SelectTrigger className={SELECT_TRIGGER}>
              <SelectValue placeholder="すべてのGuild" />
            </SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
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
          className={`relative rounded-lg border p-3 transition ${SURFACE_MUTED} ${
            filters.categoryNames.length > 0 ? CARD_FILTER_ACTIVE : "border-border"
          }`}
        >
          <p className={`mb-2 ${LABEL_UPPER}`}>Category（複数）</p>
          <button
            type="button"
            onClick={() => setIsCategoryOpen((prev) => !prev)}
            className={`h-9 w-full rounded-md border px-3 text-left text-base ${INPUT_SURFACE}`}
          >
            {filters.categoryNames.length === 0 ? "すべてのカテゴリ" : `${filters.categoryNames.length}件選択中`}
          </button>
          {filters.categoryNames.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.categoryNames.map((name) => (
                <span
                  key={name}
                  className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-base text-primary"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : null}
          {isCategoryOpen ? (
            <div
              className={`absolute left-0 right-0 top-full z-20 mt-1 w-full rounded-lg border p-2 shadow-lg ${SURFACE_ELEVATED}`}
            >
              <button
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    categoryNames: [],
                  }))
                }
                className={`mb-1 w-full rounded px-2 py-1.5 text-left text-base ${TEXT_BODY} hover:bg-accent`}
              >
                すべて解除
              </button>
              <div className="max-h-48 overflow-y-auto">
                {categoryOptions.map((categoryName) => {
                  const checked = filters.categoryNames.includes(categoryName);
                  return (
                    <label
                      key={categoryName}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                    >
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
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className={`text-base ${TEXT_BODY}`}>{categoryName}</span>
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
  if (error) return <p className="text-base text-destructive">{error}</p>;
  if (weeklyError) return <p className="text-base text-destructive">{weeklyError}</p>;

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
          <CardDescription className={LABEL_UPPER}>期間内の投稿数</CardDescription>
          <CardTitle className={`mt-2 text-3xl font-semibold tabular-nums ${TEXT_TITLE}`}>
            {messages.toLocaleString()}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className={LABEL_UPPER}>期間内のボイス利用時間（時間）</CardDescription>
          <CardTitle className={`mt-2 text-3xl font-semibold tabular-nums ${TEXT_TITLE}`}>{hours.toFixed(2)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className={LABEL_UPPER}>先週とのボイス時間の変化</CardDescription>
          <CardTitle className={`mt-2 text-3xl font-semibold tabular-nums ${TEXT_TITLE}`}>
            {growthPct === null ? "—" : `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`}
          </CardTitle>
          <p className={`mt-1 ${TEXT_SUBTLE}`}>
            先週: {lastWeekHours.toFixed(2)} 時間 · 状態: {signal}
          </p>
        </CardHeader>
      </Card>
      <Card className={CARD}>
        <CardHeader className="pb-3">
          <CardDescription className={LABEL_UPPER}>直近7日間のボイス利用時間</CardDescription>
          <CardTitle className={`mt-2 text-3xl font-semibold tabular-nums ${TEXT_TITLE}`}>
            {thisWeekHours.toFixed(2)}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

function MessageTrendCard() {
  const { filters } = useFilterContext();
  const { isDark } = useTheme();
  const chartColors = getChartColors(isDark);
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_daily_message_trend", params);

  if (loading) return <Skeleton className="h-[360px] w-full" />;
  if (error) return <p className="text-base text-destructive">{error}</p>;

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
    <Card className={`${CARD} chart-readable chart-line-strong`}>
      <CardHeader>
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>日別の投稿数の推移</CardTitle>
        <CardDescription className={`${TEXT_MUTED}`}>
          選択した期間のメッセージ投稿数を、日ごとに表示します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="activity_date"
                tick={{ fill: chartColors.axis, fontSize: 14 }}
                axisLine={{ stroke: chartColors.axisLine }}
              />
              <YAxis
                tick={{ fill: chartColors.axis, fontSize: 14 }}
                axisLine={{ stroke: chartColors.axisLine }}
                width={52}
              />
              <Tooltip contentStyle={chartColors.tooltip} labelStyle={{ color: chartColors.axis }} />
              <Line
                type="monotone"
                dataKey="message_count"
                stroke={LINE_PRIMARY}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
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
  const { isDark } = useTheme();
  const chartColors = getChartColors(isDark);
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_daily_voice_trend", params);

  if (loading) return <Skeleton className="h-[360px] w-full" />;
  if (error) return <p className="text-base text-destructive">{error}</p>;

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
    <Card className={`${CARD} chart-readable chart-line-strong`}>
      <CardHeader>
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>日別のボイス利用時間の推移</CardTitle>
        <CardDescription className={`${TEXT_MUTED}`}>
          選択した期間のボイス利用時間を、日ごとに表示します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="activity_date"
                tick={{ fill: chartColors.axis, fontSize: 14 }}
                axisLine={{ stroke: chartColors.axisLine }}
              />
              <YAxis
                tick={{ fill: chartColors.axis, fontSize: 14 }}
                axisLine={{ stroke: chartColors.axisLine }}
                width={52}
              />
              <Tooltip contentStyle={chartColors.tooltip} labelStyle={{ color: chartColors.axis }} />
              <Line
                type="monotone"
                dataKey="voice_hours"
                stroke={LINE_SECONDARY}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
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
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>{title}</CardTitle>
        {description ? <CardDescription className={`${TEXT_MUTED}`}>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[460px] text-base">
          <thead className={TABLE_HEAD_BG}>
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
                className={`border-b ${TABLE_ROW_BORDER} transition-colors ${TABLE_ROW_HOVER}`}
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
            <button type="button" onClick={() => setShowAll((prev) => !prev)} className={BTN_SECONDARY}>
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
  if (error) return <p className="text-base text-destructive">{error}</p>;

  const rows = ((data ?? []) as Array<{ user_name?: string; message_count?: number | string }>).map((row) => ({
    name: row.user_name || "unknown",
    value: toNumber(row.message_count),
  }));

  return (
    <RankingTableCard
      title="投稿で貢献しているユーザー"
      rows={rows}
      nameColumnLabel="ユーザー"
      valueColumnLabel="投稿数"
      valueFormatter={(value) => value.toLocaleString()}
      description="コミュニティ全体の投稿数ランキングです（カテゴリ絞り込みは未対応）。"
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
  if (error) return <p className="text-base text-destructive">{error}</p>;

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
      title="投稿が多いチャンネル"
      rows={aggregatedRows}
      nameColumnLabel="チャンネル"
      valueColumnLabel="メッセージ数"
      valueFormatter={(value) => value.toLocaleString()}
      maxRows={DEFAULT_MAX_RANK_ROWS}
      showAllToggle
    />
  );
}

function DashboardPageHeader() {
  return (
    <header className={`border-b pb-5 ${HEADER_BORDER}`}>
      <p className={LABEL_UPPER}>コミュニティ分析</p>
      <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${TEXT_TITLE}`}>活動ダッシュボード</h1>
      <p className={`mt-1 text-base ${TEXT_MUTED}`}>
        コミュニティの活動状況を、期間・サーバー・カテゴリで絞り込んで確認できます。
      </p>
    </header>
  );
}

function AnnouncementPageHeader() {
  return (
    <header className={`border-b pb-5 ${HEADER_BORDER}`}>
      <p className={LABEL_UPPER}>AI ツール</p>
      <h1 className={`mt-2 text-3xl font-semibold tracking-tight ${TEXT_TITLE}`}>告知文作成</h1>
      <p className={`mt-1 text-base ${TEXT_MUTED}`}>条件を選び、AIに依頼文を書くだけでイベント告知文を作成できます。</p>
    </header>
  );
}

export default function App() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState("dashboard");
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
      <div className={`${PAGE_BG} px-4 py-6 lg:px-6`}>
        <div className="w-full max-w-none">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
              <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                <div className={`px-4 py-4 ${SURFACE_ELEVATED}`}>
                  <p className={LABEL_UPPER}>JEDAI Discord</p>
                  <p className={`mt-2 text-base font-semibold ${TEXT_TITLE}`}>コミュニティ分析</p>
                  <p className={`mt-1 text-base ${TEXT_MUTED}`}>活動データの可視化とAI支援</p>
                  <div className="mt-4">
                    <ThemeToggle />
                  </div>
                </div>

                <nav aria-label="メインメニュー">
                  <TabsList className={SIDEBAR_NAV_LIST}>
                    <TabsTrigger value="dashboard" className={SIDEBAR_NAV_TRIGGER}>
                      活動ダッシュボード
                    </TabsTrigger>
                    <TabsTrigger value="announcement" className={SIDEBAR_NAV_TRIGGER}>
                      告知文作成
                    </TabsTrigger>
                    <TabsTrigger value="genie" className={SIDEBAR_NAV_TRIGGER}>
                      AI データ相談
                    </TabsTrigger>
                  </TabsList>
                </nav>

                {activeTab === "dashboard" ? <FilterBar /> : null}
              </aside>

              <main className="min-w-0 space-y-6">
                <TabsContent value="dashboard" className="mt-0 space-y-6">
                  <DashboardPageHeader />
                  <SectionHeading
                    eyebrow="概要"
                    title="コミュニティの現在地"
                    description="選択した期間・サーバー・カテゴリの活動量をまとめて表示します。"
                  />
                  <KpiStrip />
                  <SectionHeading eyebrow="推移" title="活動量の推移" />
                  <div className="grid gap-4 xl:grid-cols-2">
                    <MessageTrendCard />
                    <VoiceTrendCard />
                  </div>
                  <VoiceHeatmapCard />
                  <SectionHeading eyebrow="場所" title="盛り上がっている場所" />
                  <div className="grid gap-4 xl:grid-cols-2">
                    <ChannelActivityTable />
                    <VoiceChannelHhiCard />
                  </div>
                  <SectionHeading eyebrow="参加者" title="参加者の動き" />
                  <div className="grid gap-4 xl:grid-cols-2">
                    <UserMessageTable />
                    <VoiceLtvRankingTable />
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <VoiceChurnRiskTable />
                    <VoiceSessionScatterCard />
                  </div>
                </TabsContent>

                <TabsContent value="announcement" className="mt-0 space-y-6">
                  <AnnouncementPageHeader />
                  <AnnouncementPanel />
                </TabsContent>

                <TabsContent value="genie" className="mt-0">
                  <GeniePanel />
                </TabsContent>
              </main>
            </div>
          </Tabs>
        </div>
      </div>
    </FilterContext.Provider>
  );
}
