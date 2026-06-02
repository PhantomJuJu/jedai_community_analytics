import { useRef, useState, type KeyboardEvent } from "react";
import { BTN_PRIMARY, INPUT_SURFACE } from "./theme";

type GenieChatInputJaProps = {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
    </svg>
  );
}

/** 日本語 IME 対応の Genie チャット入力（変換確定 Enter では送信しない） */
export function GenieChatInputJa({
  onSend,
  disabled = false,
  placeholder = "コミュニティデータについて質問してください…",
  className = "",
}: GenieChatInputJaProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) return;
    e.preventDefault();
    handleSubmit();
  };

  const MAX_HEIGHT = 200;

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const clamped = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${clamped}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  };

  return (
    <div
      className={`flex shrink-0 items-end gap-3 border-t border-border bg-background px-4 py-4 ${className}`}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`min-h-[44px] flex-1 resize-none overflow-hidden rounded-xl border px-4 py-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${INPUT_SURFACE}`}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        aria-label="送信"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BTN_PRIMARY}`}
      >
        <SendIcon />
      </button>
    </div>
  );
}
