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
import { Skeleton } from "@databricks/appkit-ui/react";
import { Textarea } from "@databricks/appkit-ui/react";
import { useAnalyticsQuery } from "@databricks/appkit-ui/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

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
                <SelectTrigger className="border-white/[0.07] bg-[#1a1b2e] text-[#f0f0ff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.07] bg-[#1a1b2e]">
                  {TONE.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className="text-[#f0f0ff] focus:bg-[#2d2f5f] focus:text-[#f0f0ff]"
                    >
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Length">
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger className="border-white/[0.07] bg-[#1a1b2e] text-[#f0f0ff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.07] bg-[#1a1b2e]">
                  {LENGTH.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className="text-[#f0f0ff] focus:bg-[#2d2f5f] focus:text-[#f0f0ff]"
                    >
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Formality">
              <Select value={formality} onValueChange={setFormality}>
                <SelectTrigger className="border-white/[0.07] bg-[#1a1b2e] text-[#f0f0ff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.07] bg-[#1a1b2e]">
                  {FORMALITY.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className="text-[#f0f0ff] focus:bg-[#2d2f5f] focus:text-[#f0f0ff]"
                    >
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Emoji density">
              <Select value={emoji_density} onValueChange={setEmojiDensity}>
                <SelectTrigger className="border-white/[0.07] bg-[#1a1b2e] text-[#f0f0ff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.07] bg-[#1a1b2e]">
                  {EMOJI.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className="text-[#f0f0ff] focus:bg-[#2d2f5f] focus:text-[#f0f0ff]"
                    >
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Structure">
              <Select value={structure} onValueChange={setStructure}>
                <SelectTrigger className="border-white/[0.07] bg-[#1a1b2e] text-[#f0f0ff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.07] bg-[#1a1b2e]">
                  {STRUCTURE.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className="text-[#f0f0ff] focus:bg-[#2d2f5f] focus:text-[#f0f0ff]"
                    >
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="CTA strength">
              <Select value={cta_strength} onValueChange={setCtaStrength}>
                <SelectTrigger className="border-white/[0.07] bg-[#1a1b2e] text-[#f0f0ff]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.07] bg-[#1a1b2e]">
                  {CTA.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      className="text-[#f0f0ff] focus:bg-[#2d2f5f] focus:text-[#f0f0ff]"
                    >
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

        {!pending && result !== null && result.length > 0 ? (
          <DiscordScheduleSection content={result} />
        ) : null}
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

type ScheduledPostRow = {
  post_id: string;
  channel_id: string;
  content: string;
  scheduled_at: string;
  created_by: string;
};

type PostsResponse = {
  scheduled: ScheduledPostRow[];
  recurring: Array<{
    post_id: string;
    channel_id: string;
    content: string;
    frequency: string;
    post_time: string;
  }>;
};

function defaultScheduledLocalValue(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 5);
  return toDatetimeLocalValue(date);
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDatetimeToIso(localValue: string): string {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("送信日時の形式が不正です");
  }
  return parsed.toISOString();
}

function formatScheduledAtJst(isoValue: string): string {
  const normalized = isoValue.replace("Z", "+00:00");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return isoValue;
  }
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });
}

function DiscordScheduleSection({ content }: { content: string }) {
  const params = useMemo(() => ({}), []);
  const { data: channelData, loading: channelsLoading, error: channelsError } = useAnalyticsQuery(
    "discord_channels_list",
    params,
  );

  const channelRows = (channelData ?? []) as Array<{ channel_id?: string; channel_name?: string }>;
  const channelOptions = useMemo(
    () =>
      channelRows
        .filter((row) => row.channel_id)
        .map((row) => ({
          id: String(row.channel_id),
          name: row.channel_name?.trim() || String(row.channel_id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [channelRows],
  );

  const [channelId, setChannelId] = useState("");
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultScheduledLocalValue);
  const [schedulePending, setSchedulePending] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostsResponse | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [cancelPendingId, setCancelPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId && channelOptions.length > 0) {
      setChannelId(channelOptions[0]?.id ?? "");
    }
  }, [channelId, channelOptions]);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(null);
    try {
      const response = await fetch("/api/discord/posts");
      const payload = (await response.json()) as PostsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `一覧の取得に失敗しました (${response.status})`);
      }
      setPosts(payload);
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  async function onSchedule() {
    if (!channelId) {
      setScheduleError("送信先チャンネルを選択してください");
      return;
    }
    setSchedulePending(true);
    setScheduleError(null);
    setScheduleSuccess(null);
    try {
      const scheduledAt = localDatetimeToIso(scheduledAtLocal);
      const response = await fetch("/api/discord/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          content,
          scheduledAt,
        }),
      });
      const payload = (await response.json()) as { postId?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `予約に失敗しました (${response.status})`);
      }
      setScheduleSuccess(`予約を登録しました（ID: ${payload.postId ?? "—"}）`);
      await loadPosts();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : String(err));
    } finally {
      setSchedulePending(false);
    }
  }

  async function onCancel(postId: string) {
    setCancelPendingId(postId);
    setScheduleError(null);
    try {
      const response = await fetch(`/api/discord/posts/${encodeURIComponent(postId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { cancelled?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `キャンセルに失敗しました (${response.status})`);
      }
      if (!payload.cancelled) {
        throw new Error("該当する予約が見つかりませんでした");
      }
      await loadPosts();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelPendingId(null);
    }
  }

  const scheduledRows = posts?.scheduled ?? [];

  return (
    <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#12121e] p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">Discord へ送信</p>
      <p className="mt-1 text-xs text-[#6a6a8a]">
        生成した文章を EC2 上の Discord Bot に予約登録します。指定時刻に自動投稿されます。
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="送信先チャンネル">
          {channelsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : channelsError ? (
            <p className="text-xs text-red-400">{channelsError}</p>
          ) : channelOptions.length === 0 ? (
            <p className="text-xs text-[#9898b8]">チャンネル一覧がありません（discord_channels_raw を確認）</p>
          ) : (
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="border-white/[0.07] bg-[#1a1b2e] text-[#f0f0ff]">
                <SelectValue placeholder="チャンネルを選択" />
              </SelectTrigger>
              <SelectContent className="border-white/[0.07] bg-[#1a1b2e]">
                {channelOptions.map((channel) => (
                  <SelectItem
                    key={channel.id}
                    value={channel.id}
                    className="text-[#f0f0ff] focus:bg-[#2d2f5f] focus:text-[#f0f0ff]"
                  >
                    #{channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="送信日時">
          <input
            type="datetime-local"
            value={scheduledAtLocal}
            onChange={(event) => setScheduledAtLocal(event.target.value)}
            className="h-9 w-full rounded-md border border-white/[0.07] bg-[#12121e] px-3 text-sm text-[#f0f0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cd6]/50"
          />
        </Field>
      </div>

      <Button
        type="button"
        onClick={() => void onSchedule()}
        disabled={schedulePending || channelsLoading || channelOptions.length === 0}
        className="mt-4 bg-[#2f6feb] text-white hover:bg-[#4a82ee] disabled:opacity-50"
      >
        {schedulePending ? "予約中…" : "Discord に予約送信"}
      </Button>

      {scheduleError ? <p className="mt-2 text-xs text-red-400">{scheduleError}</p> : null}
      {scheduleSuccess ? <p className="mt-2 text-xs text-emerald-400">{scheduleSuccess}</p> : null}

      <div className="mt-6 border-t border-white/[0.07] pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#9898b8]">予約一覧</p>
          <button
            type="button"
            onClick={() => void loadPosts()}
            disabled={postsLoading}
            className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs text-[#cfcfeb] hover:bg-white/10 disabled:opacity-50"
          >
            {postsLoading ? "読込中…" : "再読込"}
          </button>
        </div>

        {postsError ? <p className="mt-2 text-xs text-red-400">{postsError}</p> : null}

        {postsLoading && !posts ? <Skeleton className="mt-3 h-20 w-full" /> : null}

        {!postsLoading && scheduledRows.length === 0 ? (
          <p className="mt-2 text-xs text-[#9898b8]">予約中の投稿はありません</p>
        ) : null}

        {scheduledRows.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {scheduledRows.map((row) => (
              <li
                key={row.post_id}
                className="rounded-lg border border-white/[0.07] bg-[#0f0f1a] px-3 py-2 text-xs text-[#d7d7f4]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-mono text-[#9898b8]">{row.post_id.slice(0, 8)}…</span>
                    {" · "}
                    #{channelOptions.find((ch) => ch.id === row.channel_id)?.name ?? row.channel_id}
                    {" · "}
                    {formatScheduledAtJst(row.scheduled_at)} JST
                  </span>
                  <button
                    type="button"
                    onClick={() => void onCancel(row.post_id)}
                    disabled={cancelPendingId === row.post_id}
                    className="rounded border border-red-500/40 px-2 py-0.5 text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {cancelPendingId === row.post_id ? "取消中…" : "キャンセル"}
                  </button>
                </div>
                <p className="mt-1 line-clamp-2 text-[#9898b8]">{row.content}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
