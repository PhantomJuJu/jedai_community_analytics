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
import { useState, type FormEvent, type ReactNode } from "react";

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
      // Keep a tiny transition so the loading bubble feels deliberate.
      await new Promise((resolve) => setTimeout(resolve, 600));
      setResult(payload.text ?? "");
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
          パラメータとリクエストを入力して告知文を生成できます。生成中はチャット風の待機表示に切り替わり、
          完了後はそのままコピーできます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-3">
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

        <div className="mt-8 rounded-xl border border-white/[0.07] bg-[#12121e] p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">Preview</p>
          <div className="mt-4 space-y-3">
            <UserBubble text={user_request} />
            {pending ? <TypingIndicator /> : null}
            {!pending && error ? <ErrorBubble message={error} /> : null}
            {!pending && result !== null ? <ResultBubble text={result} /> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-[#2d2f5f] px-4 py-3 text-sm text-[#f0f0ff]">
        {text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm border border-white/[0.07] bg-[#0f0f1a] px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((idx) => (
            <span
              key={idx}
              className="h-2 w-2 rounded-full bg-[#9898b8] animate-bounce"
              style={{ animationDelay: `${idx * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultBubble({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function onCopy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("コピーに失敗しました。手動でコピーしてください。");
    }
  }

  return (
    <div className="flex justify-start">
      <div className="relative w-full max-w-[95%] rounded-2xl rounded-bl-sm border border-white/[0.07] bg-[#0f0f1a] p-4">
        <Button
          type="button"
          onClick={onCopy}
          className="absolute right-3 top-3 h-7 bg-[#2f6feb] px-2 text-xs text-white hover:bg-[#4a82ee]"
        >
          {copied ? "コピー済み" : "コピー"}
        </Button>
        <pre className="pr-16 whitespace-pre-wrap font-mono text-sm leading-relaxed text-[#f0f0ff]">
          {text}
        </pre>
        {copyError ? <p className="mt-2 text-xs text-red-400">{copyError}</p> : null}
      </div>
    </div>
  );
}

function ErrorBubble({ message }: { message: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
        {message}
      </div>
    </div>
  );
}
