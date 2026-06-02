import {
  Button,
  GenieChatMessageList,
  useGenieChat,
} from "@databricks/appkit-ui/react";
import { GENIE_SAMPLE_PROMPTS } from "./genieSamplePrompts";
import { GenieChatInputJa } from "./GenieChatInputJa";
import { BTN_SECONDARY, TEXT_MUTED, TEXT_TITLE } from "./theme";

export const GENIE_AGENT_DISPLAY_NAME = "Kazuki";

type GenieAgentChatProps = {
  alias: string;
  basePath?: string;
  className?: string;
};

function AgentSparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-7 w-7 text-primary"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M9 4.5a1.5 1.5 0 0 1 2.122 0l.707.707 1.06-1.06a1.5 1.5 0 1 1 2.122 2.122l-1.06 1.06.707.707a1.5 1.5 0 0 1-2.122 2.122l-.707-.707-1.06 1.06a1.5 1.5 0 1 1-2.122-2.122l1.06-1.06-.707-.707A1.5 1.5 0 0 1 9 4.5Zm7.5 9a1.5 1.5 0 0 1 2.122 0l.707.707 1.06-1.06a1.5 1.5 0 1 1 2.122 2.122l-1.06 1.06.707.707a1.5 1.5 0 0 1-2.122 2.122l-.707-.707-1.06 1.06a1.5 1.5 0 1 1-2.122-2.122l1.06-1.06-.707-.707a1.5 1.5 0 0 1 2.122-2.122Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GenieEmptyState({
  onSelectPrompt,
  disabled,
}: {
  onSelectPrompt: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
        <AgentSparkleIcon />
      </div>
      <h2 className={`mt-5 text-2xl font-semibold tracking-tight ${TEXT_TITLE}`}>
        こんにちは、{GENIE_AGENT_DISPLAY_NAME} さん！
      </h2>
      <p className={`mt-2 max-w-md text-base ${TEXT_MUTED}`}>
        コミュニティデータについて、自然言語で質問できます
      </p>
      <div className="mt-8 flex w-full max-w-2xl flex-col items-center gap-2">
        <div className="flex w-full flex-wrap justify-center gap-2">
          {GENIE_SAMPLE_PROMPTS.slice(0, 2).map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSelectPrompt(prompt)}
              className="rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectPrompt(GENIE_SAMPLE_PROMPTS[2])}
          className="rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {GENIE_SAMPLE_PROMPTS[2]}
        </button>
        <div className="flex w-full flex-wrap justify-center gap-2">
          {GENIE_SAMPLE_PROMPTS.slice(3).map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSelectPrompt(prompt)}
              className="rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GenieAgentChat({ alias, basePath, className = "" }: GenieAgentChatProps) {
  const {
    messages,
    status,
    error,
    sendMessage,
    reset,
    hasPreviousPage,
    fetchPreviousPage,
  } = useGenieChat({ alias, basePath });

  const inputDisabled =
    status === "streaming" || status === "loading-history" || status === "loading-older";
  const showEmptyState = messages.length === 0 && status !== "loading-history";

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-background ${className}`}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-muted/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
            <AgentSparkleIcon />
          </span>
          <span className={`text-base font-semibold ${TEXT_TITLE}`}>AI データ相談</span>
        </div>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className={`text-base ${TEXT_MUTED} hover:text-slate-900 dark:hover:text-[#f2f3f5]`}
          >
            新しい会話
          </Button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {showEmptyState ? (
          <GenieEmptyState onSelectPrompt={sendMessage} disabled={inputDisabled} />
        ) : (
          <GenieChatMessageList
            messages={messages}
            status={status}
            hasPreviousPage={hasPreviousPage}
            onFetchPreviousPage={fetchPreviousPage}
            className="min-h-0 flex-1"
          />
        )}
      </div>

      {error ? (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-base text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <GenieChatInputJa
        onSend={sendMessage}
        disabled={inputDisabled}
        placeholder="コミュニティデータについて質問してください…"
      />
    </div>
  );
}
