/** Shared UI tokens — AppKit semantic colors (light + Discord dark via CSS variables). */

/** Discord brand / dark UI reference colors (hex). */
export const DISCORD = {
  blurple: "#5865f2",
  bgBase: "#313338",
  bgMainAlt: "#2c2f33",
  bgSidebar: "#1e1f22",
  bgChannelList: "#23272a",
  bgElevated: "#383a40",
} as const;

/** RGB tuples for chart fills that use rgba(). */
export const HEATMAP_PRIMARY_RGB = {
  light: [37, 99, 235] as const,
  dark: [88, 101, 242] as const,
};

export function getHeatmapPrimaryRgb(isDark: boolean): readonly [number, number, number] {
  return isDark ? HEATMAP_PRIMARY_RGB.dark : HEATMAP_PRIMARY_RGB.light;
}

export const CARD =
  "rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors hover:border-border/80";

export const CARD_FILTER_ACTIVE = "border-primary ring-1 ring-primary/30";

export const PAGE_BG = "min-h-screen bg-background text-foreground";

export const TEXT_TITLE = "text-foreground";
export const TEXT_BODY = "text-base text-muted-foreground";
export const TEXT_MUTED = "text-base text-muted-foreground";
export const TEXT_SUBTLE = "text-base text-muted-foreground/80";

export const LABEL_UPPER =
  "text-base font-semibold uppercase tracking-wide text-muted-foreground";

export const BTN_SECONDARY =
  "rounded-md border border-border bg-card px-3 py-1.5 text-base font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_PRIMARY =
  "rounded-md bg-primary px-3 py-1.5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

export const CHIP_ACTIVE = "border-primary bg-primary text-primary-foreground shadow-sm";
export const CHIP_INACTIVE =
  "border-border bg-card text-foreground hover:border-border/80 hover:bg-accent";

export const SIDEBAR_NAV_LIST =
  "flex h-auto w-full flex-col items-stretch gap-0.5 rounded-lg border border-sidebar-border bg-sidebar p-1.5 shadow-sm";

export const SIDEBAR_NAV_TRIGGER =
  "w-full justify-start rounded-md px-3 py-2.5 text-base font-medium text-sidebar-foreground transition-colors data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:shadow-none";

export const INPUT_SURFACE =
  "border-input bg-input text-foreground placeholder:text-muted-foreground";

export const SELECT_TRIGGER =
  "h-10 border-input bg-input text-base text-foreground";
export const SELECT_CONTENT = "border-border bg-popover text-popover-foreground";

export const TABLE_HEAD =
  "text-base font-semibold uppercase tracking-wide text-muted-foreground";
export const TABLE_ROW_HOVER = "hover:bg-accent";
export const TABLE_BORDER = "border-border";
export const TABLE_HEAD_BG = "bg-muted";
export const TABLE_ROW_BORDER = "border-border/60";

export const SURFACE_MUTED = "border-border bg-muted";
export const SURFACE_ELEVATED =
  "rounded-lg border border-border bg-card text-card-foreground shadow-sm";
export const HEADER_BORDER = "border-border";
export const CODE_INLINE = "rounded bg-muted px-1 text-foreground";

export const INSIGHT_BOX = "mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3";
export const INSIGHT_LABEL = "text-primary";

export const CHART_COLORS_LIGHT = {
  grid: "rgba(148, 163, 184, 0.35)",
  axis: "#64748b",
  axisLine: "rgba(148, 163, 184, 0.6)",
  tooltip: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    color: "#1e293b",
  },
  heatmapEmpty: "#f1f5f9",
  heatmapCellText: "#1e293b",
  referenceLine: "rgba(148, 163, 184, 0.6)",
} as const;

export const CHART_COLORS_DARK = {
  grid: "rgba(79, 84, 92, 0.45)",
  axis: "#b5bac1",
  axisLine: "rgba(79, 84, 92, 0.65)",
  tooltip: {
    background: DISCORD.bgElevated,
    border: `1px solid ${DISCORD.bgMainAlt}`,
    color: "#f2f3f5",
  },
  heatmapEmpty: DISCORD.bgSidebar,
  heatmapCellText: "#f2f3f5",
  referenceLine: "rgba(79, 84, 92, 0.65)",
} as const;

export type ChartColors = typeof CHART_COLORS_LIGHT;

export function getChartColors(isDark: boolean): ChartColors {
  return isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
}

export const LINE_PRIMARY = "#2563eb";
export const LINE_SECONDARY = "#0ea5e9";
export const LINE_PRIMARY_DARK = "#5865f2";
export const LINE_SECONDARY_DARK = "#00a8fc";

export function getLineColors(isDark: boolean): { primary: string; secondary: string } {
  return isDark
    ? { primary: LINE_PRIMARY_DARK, secondary: LINE_SECONDARY_DARK }
    : { primary: LINE_PRIMARY, secondary: LINE_SECONDARY };
}

export function churnLevelBadgeClass(level: string, isDark: boolean): string {
  switch (level) {
    case "離脱済み":
      return isDark
        ? "border-[#ed4245]/50 bg-[#ed4245]/20 text-[#f23f43]"
        : "border-red-200 bg-red-50 text-red-800";
    case "高":
      return isDark
        ? "border-[#faa81a]/50 bg-[#faa81a]/15 text-[#faa81a]"
        : "border-orange-200 bg-orange-50 text-orange-800";
    case "要注意":
      return isDark
        ? "border-[#faa81a]/40 bg-[#faa81a]/10 text-[#f0b232]"
        : "border-amber-200 bg-amber-50 text-amber-900";
    case "活発":
      return isDark
        ? "border-[#3ba55d]/50 bg-[#3ba55d]/15 text-[#3ba55d]"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";
    default:
      return isDark
        ? "border-border bg-accent text-muted-foreground"
        : "border-slate-200 bg-slate-100 text-slate-600";
  }
}
