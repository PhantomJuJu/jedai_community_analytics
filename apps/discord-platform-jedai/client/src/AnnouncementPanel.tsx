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
import { trpc } from "./trpcClient.js";
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
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const out = await trpc.generateAnnouncement.mutate({
        tone,
        length,
        formality,
        emoji_density,
        structure,
        cta_strength,
        user_request,
      });
      setResult(out.text ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
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
          と同じハイパーパラメータで{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-xs text-[#9898b8]">
            ai_query
          </code>{" "}
          を実行します。
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
