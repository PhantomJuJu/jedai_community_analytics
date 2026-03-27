import {
  BarChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LineChart,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@databricks/appkit-ui/react";
import { useAnalyticsQuery } from "@databricks/appkit-ui/react";
import { useMemo } from "react";
import { AnnouncementPanel } from "./AnnouncementPanel.js";

function KpiStrip() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery("activity_summary_kpis", params);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
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
    return <p className="text-sm text-muted-foreground">サマリー未取得</p>;
  }
  const messages = Number(row.total_messages ?? 0);
  const hours = Number(row.total_voice_hours ?? 0);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>合計メッセージ数</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{messages.toLocaleString()}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>合計ボイス時間（時間）</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{hours.toFixed(2)}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

function MessageTrendCard() {
  const params = useMemo(() => ({}), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>メッセージ数トレンド</CardTitle>
        <CardDescription>gold.activity_daily を日次・ギルド別に集計</CardDescription>
      </CardHeader>
      <CardContent>
        <LineChart
          queryKey="activity_daily_message_trend"
          parameters={params}
          xKey="activity_date"
          yKey="message_count"
          height={320}
          title="メッセージ数"
        />
      </CardContent>
    </Card>
  );
}

function WeekdayVoiceChart() {
  const params = useMemo(() => ({}), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>曜日 × 時間帯のボイス時間</CardTitle>
      </CardHeader>
      <CardContent>
        <BarChart
          queryKey="activity_by_weekday_hour"
          parameters={params}
          xKey="weekday_display"
          yKey="voice_duration_hours"
          height={280}
        />
      </CardContent>
    </Card>
  );
}

function UserVoiceRankingChart() {
  const params = useMemo(() => ({}), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>ユーザ別ボイス時間ランキング（上位25）</CardTitle>
      </CardHeader>
      <CardContent>
        <BarChart
          queryKey="user_voice_ranking"
          parameters={params}
          xKey="user_name"
          yKey="voice_hours"
          height={280}
        />
      </CardContent>
    </Card>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <header className="mb-8 max-w-6xl">
        <h1 className="text-3xl font-semibold tracking-tight">JEDAI Discord platform</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Lakeview「JEDAI コミュニティ活動ダッシュボード」由来のメトリクスと、Notebook 由来の Discord
          告知ジェネレータを同一アプリに集約。
        </p>
      </header>

      <Tabs defaultValue="dashboard" className="max-w-6xl">
        <TabsList>
          <TabsTrigger value="dashboard">ダッシュボード</TabsTrigger>
          <TabsTrigger value="announcement">告知ジェネレータ</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6 space-y-8">
          <KpiStrip />
          <MessageTrendCard />
          <div className="grid gap-6 lg:grid-cols-2">
            <WeekdayVoiceChart />
            <UserVoiceRankingChart />
          </div>
        </TabsContent>

        <TabsContent value="announcement" className="mt-6">
          <AnnouncementPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
