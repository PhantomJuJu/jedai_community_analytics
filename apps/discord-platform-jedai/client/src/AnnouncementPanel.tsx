import { Button } from "@databricks/appkit-ui/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@databricks/appkit-ui/react";
import { Label } from "@databricks/appkit-ui/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@databricks/appkit-ui/react";
import { Textarea } from "@databricks/appkit-ui/react";
import { useState, type FormEvent } from "react";

const TONE = ["真面目", "おふざけ", "カジュアル"] as const;
const LENGTH = ["short", "medium", "long"] as const;
const FORMALITY = ["ですます", "タメ口", "敬語"] as const;
const EMOJI = ["なし", "少なめ", "普通", "多め"] as const;
const STRUCTURE = ["箇条書き中心", "段落中心", "見出し＋本文"] as const;
const CTA = ["控えめ", "普通", "強め"] as const;

export function AnnouncementPanel() {
  const [tone, setTone] = useState<string>("カジュアル");
  const [length, setLength] = useState<string>("medium");
  const [formality, setFormality] = useState<string>("ですます");
  const [emoji_density, setEmojiDensity] = useState<string>("普通");
  const [structure, setStructure] = useState<string>("箇条書き中心");
  const [cta_strength, setCtaStrength] = useState<string>("普通");
  const [user_request, setUserRequest] = useState<string>(
    "来週土曜21時の練習会告知を、カジュアルで中くらいの長さ、箇条書き中心で作って",
  );
  /** Maps to prompt [Context facts]; optional — empty uses server env EVENT_CONTEXT_FOR_REQUEST if set. */
  const [context_for_request, setContextForRequest] = useState<string>("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [jobPending, setJobPending] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{
    jobId: number;
    runId: number | null;
    runPageUrl: string | null;
    lifeCycleState: string;
    resultState: string;
    stateMessage: string;
  } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/announcement/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone,
          length,
          formality,
          emoji_density,
          structure,
          cta_strength,
          user_request,
          ...(context_for_request.trim().length > 0
            ? { context_for_request: context_for_request.trim() }
            : {}),
        }),
      });
      let payload: { text?: string; error?: string } = {};
      try {
        payload = (await response.json()) as {
          text?: string;
          error?: string;
        };
      } catch {
        // AppKit/Express sometimes returns HTML error pages; surface the raw body.
        const fallbackText = await response.text().catch(() => "");
        payload = { error: fallbackText || "Non-JSON response from server" };
      }
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      setResult(payload.text ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function onRunNotebookJob() {
    setJobPending(true);
    setJobError(null);
    setJobResult(null);
    try {
      const response = await fetch("/api/notebook-job/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      let payload: {
        error?: string;
        jobId?: number;
        runId?: number | null;
        runPageUrl?: string | null;
        lifeCycleState?: string;
        resultState?: string;
        stateMessage?: string;
      } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        const fallbackText = await response.text().catch(() => "");
        payload = { error: fallbackText || "Non-JSON response from server" };
      }
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }
      setJobResult({
        jobId: payload.jobId ?? -1,
        runId: payload.runId ?? null,
        runPageUrl: payload.runPageUrl ?? null,
        lifeCycleState: payload.lifeCycleState ?? "UNKNOWN",
        resultState: payload.resultState ?? "UNKNOWN",
        stateMessage: payload.stateMessage ?? "",
      });
    } catch (err) {
      setJobError(err instanceof Error ? err.message : String(err));
    } finally {
      setJobPending(false);
    }
  }

  return (
    <Card className="rounded-xl border border-white/[0.07] bg-[#1a1b2e]">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#f0f0ff]">
          イベント告知ジェネレータ
        </CardTitle>
        <CardDescription className="text-sm text-[#9898b8]">
          Notebook{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-xs text-[#9898b8]">
            01_few_shot_discord_event_announcement
          </code>{" "}
          と同様に、ハイパーパラメータ・
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-xs text-[#9898b8]">
            Context facts
          </code>
          （任意）・リクエストを渡して{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-xs text-[#9898b8]">
            ai_query
          </code>{" "}
          を実行します。Context を空にすると、サーバーの{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-xs text-[#9898b8]">
            EVENT_CONTEXT_FOR_REQUEST
          </code>{" "}
          が使われます（未設定なら文脈ブロックなし）。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-2">
            <Field label="Tone">
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Length">
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LENGTH.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Formality">
              <Select value={formality} onValueChange={setFormality}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMALITY.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Emoji density">
              <Select value={emoji_density} onValueChange={setEmojiDensity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMOJI.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Structure">
              <Select value={structure} onValueChange={setStructure}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRUCTURE.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="CTA strength">
              <Select value={cta_strength} onValueChange={setCtaStrength}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CTA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="context_for_request"
              className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]"
            >
              Context facts（任意）
            </Label>
            <Textarea
              id="context_for_request"
              value={context_for_request}
              onChange={(ev) => setContextForRequest(ev.target.value)}
              rows={3}
              placeholder={
                "例: Geoguessr / 5/24（土）21:00 / TitanZz Discord / 参加はこの投稿にリアクション"
              }
              className="border-white/[0.07] bg-[#12121e] text-[#f0f0ff] placeholder:text-[#5a5a7a] focus-visible:ring-[#7c5cd6]/50"
            />
            <p className="text-xs text-[#6a6a8a]">
              Notebook の [Context facts] に相当。入力があると環境変数より優先されます。
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="user_request"
              className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]"
            >
              リクエスト
            </Label>
            <Textarea
              id="user_request"
              value={user_request}
              onChange={(ev) => setUserRequest(ev.target.value)}
              rows={4}
              className="border-white/[0.07] bg-[#12121e] text-[#f0f0ff] placeholder:text-[#5a5a7a] focus-visible:ring-[#7c5cd6]/50"
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="bg-[#7c5cd6] text-white hover:bg-[#9b7ee8] disabled:opacity-50"
          >
            {pending ? "生成中…" : "生成"}
          </Button>
        </form>

        {error ? (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        ) : null}

        {result !== null ? (
          <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-white/[0.07] bg-[#0f0f1a] p-5 font-mono text-sm leading-relaxed text-[#f0f0ff]">
            {result}
          </pre>
        ) : null}

        <div className="mt-8 rounded-lg border border-white/[0.07] bg-[#12121e] p-4">
          <p className="text-sm font-semibold text-[#f0f0ff]">Notebook Job 実行</p>
          <p className="mt-1 text-xs text-[#9898b8]">
            `DATABRICKS_NOTEBOOK_JOB_ID` に設定した Job を実行し、完了まで待機します。
          </p>
          <Button
            type="button"
            onClick={onRunNotebookJob}
            disabled={jobPending}
            className="mt-3 bg-[#2f6feb] text-white hover:bg-[#4a82ee] disabled:opacity-50"
          >
            {jobPending ? "Job実行中…" : "Notebook Job を実行"}
          </Button>

          {jobError ? <p className="mt-3 text-sm text-red-400">{jobError}</p> : null}

          {jobResult ? (
            <div className="mt-3 rounded border border-white/[0.07] bg-[#0f0f1a] p-3 text-xs text-[#d7d7f4]">
              <p>job_id: {jobResult.jobId}</p>
              <p>run_id: {jobResult.runId ?? "N/A"}</p>
              <p>life_cycle_state: {jobResult.lifeCycleState}</p>
              <p>result_state: {jobResult.resultState}</p>
              {jobResult.stateMessage ? <p>message: {jobResult.stateMessage}</p> : null}
              {jobResult.runPageUrl ? (
                <p className="mt-1">
                  run page:{" "}
                  <a
                    href={jobResult.runPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#7ea8ff] underline underline-offset-2"
                  >
                    {jobResult.runPageUrl}
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
        {label}
      </Label>
      {children}
    </div>
  );
}
