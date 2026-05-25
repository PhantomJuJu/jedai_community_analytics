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

const CARD = "rounded-xl border border-white/[0.07] bg-[#1a1b2e]";

type GenieConfigResponse = {
  configured: boolean;
  alias: string;
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
          <CardTitle className="text-base font-semibold text-[#f0f0ff]">Genie アシスタント</CardTitle>
          <CardDescription className="text-sm text-[#9898b8]">
            Databricks AI/BI Genie Space が未設定のため、チャットは利用できません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[#c9c9e7]">
          <p>
            自然言語でコミュニティ指標を質問し、SQL と可視化結果を Genie から取得できます。利用するには
            Genie Space ID を設定してください。
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs text-[#9898b8]">
            <li>
              ローカル: <code className="text-[#e1e1ff]">.env</code> に{" "}
              <code className="text-[#e1e1ff]">DATABRICKS_GENIE_SPACE_ID</code> を追加
            </li>
            <li>
              Databricks Apps: <code className="text-[#e1e1ff]">app.yaml</code> の env に同変数を設定
            </li>
            <li>Genie Space の About タブから Space ID をコピー</li>
          </ul>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#5a5a7a]">Genie</p>
        <h2 className="mt-1 text-lg font-semibold text-[#f0f0ff]">自然言語でデータを質問</h2>
        <p className="mt-0.5 text-xs text-[#9898b8]">
          例: 「先週いちばん活発だった曜日と時間は？」「ボイス時間が伸びているチャンネルは？」
        </p>
      </div>
      <Card className={`${CARD} overflow-hidden`}>
        <CardContent className="p-0">
          <div className="h-[min(72vh,720px)] min-h-[480px] w-full">
            <GenieChat
              alias={config.alias}
              placeholder="コミュニティデータについて質問してください…"
              className="h-full"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
