import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  GenieChat,
  Skeleton,
} from "@databricks/appkit-ui/react";
import { useEffect, useState } from "react";
import { CARD, TEXT_BODY, TEXT_MUTED, TEXT_TITLE } from "./theme";

type GenieConfigResponse = {
  configured: boolean;
  alias: string;
  basePath?: string;
};

export function GeniePanel() {
  const [config, setConfig] = useState<GenieConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/genie/config");
        if (!res.ok) {
          throw new Error(`設定の取得に失敗しました (${res.status})`);
        }
        const body = (await res.json()) as GenieConfigResponse;
        if (!cancelled) {
          setConfig(body);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setConfig({ configured: false, alias: "default" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!config && !error) {
    return <Skeleton className="h-[560px] w-full" />;
  }

  if (!config?.configured) {
    return (
      <Card className={CARD}>
        <CardHeader>
          <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>Genie アシスタント</CardTitle>
          <CardDescription className={`text-sm ${TEXT_MUTED}`}>
            Databricks AI/BI Genie Space が未設定のため、チャットは利用できません。
          </CardDescription>
        </CardHeader>
        <CardContent className={`space-y-3 text-sm ${TEXT_BODY}`}>
          <p>
            自然言語でコミュニティ指標を質問し、SQL と可視化結果を Genie から取得できます。利用するには
            Genie Space ID を設定してください。
          </p>
          <ul className={`list-inside list-disc space-y-1 text-sm ${TEXT_MUTED}`}>
            <li>
              ローカル: <code className="rounded bg-slate-100 px-1 text-slate-800">.env</code> に{" "}
              <code className="rounded bg-slate-100 px-1 text-slate-800">DATABRICKS_GENIE_SPACE_ID</code> を追加
            </li>
            <li>
              Databricks Apps: <strong>Genie Space リソース</strong>（名前{" "}
              <code className="rounded bg-slate-100 px-1 text-slate-800">genie-space</code>）をアプリに追加し、
              <code className="rounded bg-slate-100 px-1 text-slate-800">app.yaml</code> の{" "}
              <code className="rounded bg-slate-100 px-1 text-slate-800">valueFrom: genie-space</code> と対応させる
            </li>
            <li>
              あわせて User authorization にスコープ{" "}
              <code className="rounded bg-slate-100 px-1 text-slate-800">dashboards.genie</code> を付与（
              <code className="rounded bg-slate-100 px-1 text-slate-800">scripts/app-update-genie.json</code> 参照）
            </li>
            <li>反映後に再デプロイ。Space ID は Genie Space の About タブからコピー</li>
          </ul>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className={`${CARD} overflow-hidden`}>
        <CardContent className="p-0">
          <div className="h-[min(72vh,720px)] min-h-[480px] w-full">
            <GenieChat
              alias={config.alias}
              basePath="/api/genie-sp"
              placeholder="コミュニティデータについて質問してください…"
              className="h-full"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
