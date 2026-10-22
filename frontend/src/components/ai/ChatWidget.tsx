import { useState, useRef, useEffect } from "react";
import { useMarket } from "../../context/MarketContext";
import { sendChatMessage } from "../../api/client";
import type { ChatMessage } from "../../api/types";

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm **StockMantra AI** — your personal analyst. Ask me to analyse any stock (fundamentals, technicals, valuation), explain your portfolio risk, interpret earnings, or discuss macro trends.",
};

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-cyan-600 px-3.5 py-2.5 text-sm text-white">
        {text}
      </div>
    </div>
  );
}

function BotBubble({ text, sources }: { text: string; sources?: string[] }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] space-y-1.5">
        <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">
          <FormattedText text={text} />
        </div>
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-1">
            {sources.slice(0, 3).map((s, i) => {
              let label = s;
              try {
                label = new URL(s).hostname.replace(/^www\./, "");
              } catch {
                // keep original
              }
              return (
                <a
                  key={i}
                  href={s}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-cyan-600 dark:border-slate-700"
                >
                  {label}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Markdown renderer: bold, italic, inline-code, bullet lists, numbered lists
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === "") {
      result.push(<div key={i} className="h-1.5" />);
    } else if (/^#{1,3}\s/.test(line)) {
      result.push(<p key={i} className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{renderInline(line.replace(/^#+\s/, ""))}</p>);
    } else if (/^[-*]\s/.test(line)) {
      result.push(<li key={i} className="ml-3 list-disc list-outside">{renderInline(line.replace(/^[-*]\s/, ""))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      result.push(<li key={i} className="ml-3 list-decimal list-outside">{renderInline(line.replace(/^\d+\.\s/, ""))}</li>);
    } else {
      result.push(<p key={i}>{renderInline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5 leading-relaxed text-sm">{result}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={j}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={j} className="rounded bg-slate-200 px-1 py-0.5 text-[11px] font-mono dark:bg-slate-700">{part.slice(1, -1)}</code>;
    return <span key={j}>{part}</span>;
  });
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-3 dark:bg-slate-800">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

interface Msg extends ChatMessage {
  sources?: string[];
}

export function ChatWidget() {
  const { market } = useMarket();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Msg = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    // Build history excluding the welcome message
    const history = nextMessages
      .filter((m) => m !== WELCOME)
      .slice(0, -1) // exclude the message we just added (that's the current message)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await sendChatMessage(market, text, history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, sources: res.sources },
      ]);
    } catch (err: unknown) {
      const detail =
        err instanceof Error ? err.message : "Failed to reach StockBot.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clear() {
    setMessages([WELCOME]);
    setError(null);
  }

  return (
    <>
      {/* ── Floating toggle button ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all sm:bottom-6 ${
          open
            ? "bg-slate-700 text-white dark:bg-slate-600"
            : "bg-cyan-600 text-white hover:bg-cyan-700"
        }`}
        aria-label="Toggle StockBot"
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:bottom-20">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 text-xs font-bold text-white">AI</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">StockMantra AI</span>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
                AI
              </span>
            </div>
            <button
              onClick={clear}
              className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              Clear
            </button>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" style={{ maxHeight: 380 }}>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={i} text={m.content} />
              ) : (
                <BotBubble key={i} text={m.content} sources={m.sources} />
              ),
            )}
            {loading && <TypingDots />}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3 dark:border-slate-800">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Analyse a stock, ask about P/E, RSI, earnings…"
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none dark:text-slate-100"
                style={{ maxHeight: 96, overflowY: "auto" }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-white transition-opacity disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-300 dark:text-slate-600">
              Not financial advice · Stocks &amp; markets only
            </p>
          </div>
        </div>
      )}
    </>
  );
}
