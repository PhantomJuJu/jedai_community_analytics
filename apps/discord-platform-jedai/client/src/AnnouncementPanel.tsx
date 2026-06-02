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
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  CHIP_ACTIVE,
  CHIP_INACTIVE,
  HEADER_BORDER,
  INPUT_SURFACE,
  LABEL_UPPER,
  SELECT_CONTENT,
  SELECT_TRIGGER,
  SURFACE_ELEVATED,
  SURFACE_MUTED,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_SUBTLE,
  TEXT_TITLE,
} from "./theme";

const TONE_OPTIONS = [
  { value: "真面目", label: "真面目" },
  { value: "おふざけ", label: "おふざけ" },
  { value: "カジュアル", label: "カジュアル" },
] as const;

const LENGTH_OPTIONS = [
  { value: "short", label: "短め" },
  { value: "medium", label: "標準" },
  { value: "long", label: "長め" },
] as const;

const FORMALITY_OPTIONS = [
  { value: "ですます", label: "です・ます" },
  { value: "タメ口", label: "タメ口" },
  { value: "敬語", label: "敬語" },
] as const;

const EMOJI_OPTIONS = [
  { value: "なし", label: "なし" },
  { value: "少なめ", label: "少なめ" },
  { value: "普通", label: "普通" },
  { value: "多め", label: "多め" },
] as const;

const STRUCTURE_OPTIONS = [
  { value: "箇条書き中心", label: "箇条書き" },
  { value: "段落中心", label: "段落" },
  { value: "見出し＋本文", label: "見出し付き" },
] as const;

const CTA_OPTIONS = [
  { value: "控えめ", label: "控えめ" },
  { value: "普通", label: "普通" },
  { value: "強め", label: "強め" },
] as const;

export function AnnouncementPanel() {
  const [tone, setTone] = useState<string>("カジュアル");
  const [length, setLength] = useState<string>("medium");
  const [formality, setFormality] = useState<string>("ですます");
  const [emoji_density, setEmojiDensity] = useState<string>("普通");
  const [structure, setStructure] = useState<string>("箇条書き中心");
  const [cta_strength, setCtaStrength] = useState<string>("普通");
  const [user_request, setUserRequest] = useState<string>(
    "来週土曜21時の練習会告知を作成してください。参加方法はこの投稿へのリアクションでお願いします。",
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
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className={`text-base font-semibold ${TEXT_TITLE}`}>イベント告知AIエージェント</CardTitle>
        <CardDescription className={`${TEXT_MUTED}`}>
          文体や長さを選び、AIへの依頼文を書くだけで告知文を作成できます。生成結果はそのままコピーしたり、Discordへ予約送信できます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-8">
          <section className={`space-y-6 rounded-xl border p-5 ${SURFACE_MUTED}`}>
            <p className={`text-base font-semibold ${TEXT_TITLE}`}>告知文のスタイル</p>
            <p className={`${TEXT_SUBTLE}`}>
              文体・長さ・構成はここで指定します。下の依頼文には日時・内容・参加方法などの事実を書いてください（文体の指定は不要です）。
            </p>
            <div className="grid gap-5 md:grid-cols-2">
              <ChoiceGroup
                label="雰囲気"
                options={TONE_OPTIONS}
                value={tone}
                onChange={setTone}
              />
              <ChoiceGroup
                label="長さ"
                options={LENGTH_OPTIONS}
                value={length}
                onChange={setLength}
              />
              <ChoiceGroup
                label="文体"
                options={FORMALITY_OPTIONS}
                value={formality}
                onChange={setFormality}
              />
              <ChoiceGroup
                label="絵文字の量"
                options={EMOJI_OPTIONS}
                value={emoji_density}
                onChange={setEmojiDensity}
              />
              <ChoiceGroup
                label="文章の構成"
                options={STRUCTURE_OPTIONS}
                value={structure}
                onChange={setStructure}
              />
              <ChoiceGroup
                label="参加を促す強さ"
                hint="「参加してね」の呼びかけをどれだけ強くするか"
                options={CTA_OPTIONS}
                value={cta_strength}
                onChange={setCtaStrength}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <Label htmlFor="user_request" className={`text-base font-semibold ${TEXT_TITLE}`}>
                AIへの依頼
              </Label>
              <p className={`mt-1 ${TEXT_SUBTLE}`}>
                日時、イベント内容、対象者、参加方法などを自然文で書いてください。文体・長さは上のスタイル欄で指定します。
              </p>
            </div>
            <Textarea
              id="user_request"
              value={user_request}
              onChange={(ev) => setUserRequest(ev.target.value)}
              rows={6}
              placeholder="例: 来週土曜21時にGeoguessrの練習会を告知してください。参加はこの投稿へのリアクションでお願いします。"
              className={`min-h-[160px] rounded-xl border px-4 py-3 text-base leading-relaxed focus-visible:ring-primary/40 ${INPUT_SURFACE}`}
            />
            <Button type="submit" disabled={pending || user_request.trim().length === 0} className={`w-full sm:w-auto ${BTN_PRIMARY}`}>
              {pending ? "告知文を作成中…" : "AIに告知文を作ってもらう"}
            </Button>
          </section>
        </form>

        <div className={`mt-8 rounded-xl border p-5 ${SURFACE_MUTED}`}>
          <p className={`text-base font-semibold ${TEXT_TITLE}`}>生成プレビュー</p>
          <p className={`mt-1 ${TEXT_SUBTLE}`}>
            適用スタイル・依頼内容・AIが作成した告知文を確認できます。
          </p>
          <div className="mt-4 space-y-3">
            <AppliedStyleSummary
              tone={tone}
              length={length}
              formality={formality}
              emoji_density={emoji_density}
              structure={structure}
              cta_strength={cta_strength}
            />
            {user_request.trim().length > 0 ? <UserBubble text={user_request} /> : null}
            {pending ? <AgentReplyBubble message="告知文を作成しています。少々お待ちください…" /> : null}
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

function ChoiceGroup<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className={`text-base font-medium ${TEXT_TITLE}`}>{label}</p>
        {hint ? <p className={`mt-0.5 ${TEXT_SUBTLE}`}>{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3.5 py-1.5 text-base font-medium transition ${
              value === option.value ? CHIP_ACTIVE : CHIP_INACTIVE
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className={`text-base font-medium ${TEXT_TITLE}`}>{label}</Label>
      {children}
    </div>
  );
}

function optionLabel(options: ReadonlyArray<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function AppliedStyleSummary({
  tone,
  length,
  formality,
  emoji_density,
  structure,
  cta_strength,
}: {
  tone: string;
  length: string;
  formality: string;
  emoji_density: string;
  structure: string;
  cta_strength: string;
}) {
  const rows = [
    { label: "雰囲気", value: optionLabel(TONE_OPTIONS, tone) },
    { label: "長さ", value: optionLabel(LENGTH_OPTIONS, length) },
    { label: "文体", value: optionLabel(FORMALITY_OPTIONS, formality) },
    { label: "絵文字", value: optionLabel(EMOJI_OPTIONS, emoji_density) },
    { label: "構成", value: optionLabel(STRUCTURE_OPTIONS, structure) },
    { label: "参加を促す強さ", value: optionLabel(CTA_OPTIONS, cta_strength) },
  ];

  return (
    <div className={`rounded-xl border px-4 py-3 text-base shadow-sm ${SURFACE_ELEVATED}`}>
      <p className={`font-medium ${TEXT_TITLE}`}>適用スタイル（生成時に API へ送信）</p>
      <dl className={`mt-2 grid gap-1.5 sm:grid-cols-2 ${TEXT_BODY}`}>
        {rows.map((row) => (
          <div key={row.label} className="flex gap-2">
            <dt className={`shrink-0 ${TEXT_MUTED}`}>{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[90%] rounded-2xl rounded-br-sm border border-primary/40 bg-primary/10 px-4 py-3 ${TEXT_BODY}`}
      >
        {text}
      </div>
    </div>
  );
}

function AgentReplyBubble({ message }: { message: string }) {
  return (
    <div className="flex justify-start gap-2">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        aria-hidden
      >
        AI
      </div>
      <div className={`max-w-[95%] rounded-2xl rounded-bl-sm border px-4 py-3 shadow-sm ${SURFACE_ELEVATED}`}>
        <p className={`${TEXT_BODY}`}>{message}</p>
        <div className="mt-2 flex items-center gap-1">
          {[0, 1, 2].map((idx) => (
            <span
              key={idx}
              className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
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
    <div className="flex justify-start gap-2">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        aria-hidden
      >
        AI
      </div>
      <div className={`relative w-full max-w-[95%] rounded-2xl rounded-bl-sm border p-4 shadow-sm ${SURFACE_ELEVATED}`}>
        <Button
          type="button"
          onClick={onCopy}
          className={`absolute right-3 top-3 h-8 px-2 text-xs ${BTN_PRIMARY}`}
        >
          {copied ? "コピー済み" : "コピー"}
        </Button>
        <pre className={`pr-16 whitespace-pre-wrap font-mono text-base leading-relaxed ${TEXT_BODY}`}>
          {text}
        </pre>
        {copyError ? <p className="mt-2 text-base text-red-600">{copyError}</p> : null}
      </div>
    </div>
  );
}

function ErrorBubble({ message }: { message: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
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
    <div className={`mt-6 rounded-lg border p-4 ${SURFACE_MUTED}`}>
      <p className={LABEL_UPPER}>Discord へ送信</p>
      <p className={`mt-1 ${TEXT_SUBTLE}`}>
        生成した文章を EC2 上の Discord Bot に予約登録します。指定時刻に自動投稿されます。
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="送信先チャンネル">
          {channelsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : channelsError ? (
            <p className="text-base text-red-600">{channelsError}</p>
          ) : channelOptions.length === 0 ? (
            <p className={`${TEXT_MUTED}`}>チャンネル一覧がありません（discord_channels_raw を確認）</p>
          ) : (
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className={SELECT_TRIGGER}>
                <SelectValue placeholder="チャンネルを選択" />
              </SelectTrigger>
              <SelectContent className={SELECT_CONTENT}>
                {channelOptions.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
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
            className={`h-9 w-full rounded-md border px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${INPUT_SURFACE}`}
          />
        </Field>
      </div>

      <Button
        type="button"
        onClick={() => void onSchedule()}
        disabled={schedulePending || channelsLoading || channelOptions.length === 0}
        className={`mt-4 ${BTN_PRIMARY}`}
      >
        {schedulePending ? "予約中…" : "Discord に予約送信"}
      </Button>

      {scheduleError ? <p className="mt-2 text-base text-red-600">{scheduleError}</p> : null}
      {scheduleSuccess ? <p className="mt-2 text-base text-emerald-700">{scheduleSuccess}</p> : null}

      <div className={`mt-6 border-t pt-4 ${HEADER_BORDER}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={LABEL_UPPER}>予約一覧</p>
          <button
            type="button"
            onClick={() => void loadPosts()}
            disabled={postsLoading}
            className={BTN_SECONDARY}
          >
            {postsLoading ? "読込中…" : "再読込"}
          </button>
        </div>

        {postsError ? <p className="mt-2 text-base text-red-600">{postsError}</p> : null}

        {postsLoading && !posts ? <Skeleton className="mt-3 h-20 w-full" /> : null}

        {!postsLoading && scheduledRows.length === 0 ? (
          <p className={`mt-2 ${TEXT_MUTED}`}>予約中の投稿はありません</p>
        ) : null}

        {scheduledRows.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {scheduledRows.map((row) => (
              <li
                key={row.post_id}
                className={`rounded-lg border px-3 py-2 ${SURFACE_ELEVATED} ${TEXT_BODY}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className={`font-mono ${TEXT_MUTED}`}>{row.post_id.slice(0, 8)}…</span>
                    {" · "}
                    #{channelOptions.find((ch) => ch.id === row.channel_id)?.name ?? row.channel_id}
                    {" · "}
                    {formatScheduledAtJst(row.scheduled_at)} JST
                  </span>
                  <button
                    type="button"
                    onClick={() => void onCancel(row.post_id)}
                    disabled={cancelPendingId === row.post_id}
                    className="rounded border border-red-300 px-2 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {cancelPendingId === row.post_id ? "取消中…" : "キャンセル"}
                  </button>
                </div>
                <p className={`mt-1 line-clamp-2 ${TEXT_MUTED}`}>{row.content}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
