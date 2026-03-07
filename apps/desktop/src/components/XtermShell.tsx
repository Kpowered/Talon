import { useEffect, useMemo, useRef } from "react";
import type { SessionMode } from "@talon/core";

type XtermShellProps = {
  sessionId: string;
  sessionMode: SessionMode;
  terminalTail: string[];
  draft: string;
  isBusy: boolean;
  onDraftChange: (value: string) => void;
  onSubmitCommand: () => void;
  onRecallPreviousCommand: () => void;
  onRecallNextCommand: () => void;
  onClearDraft: () => void;
  onInterrupt: () => void;
  onSendRawInput: (data: string) => void;
};

function isPrintableKey(event: React.KeyboardEvent<HTMLDivElement>) {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function rawSequenceForKey(event: React.KeyboardEvent<HTMLDivElement>) {
  switch (event.key) {
    case "Enter":
      return "\r";
    case "Backspace":
      return "\u007f";
    case "Tab":
      return "\t";
    case "ArrowUp":
      return "\u001b[A";
    case "ArrowDown":
      return "\u001b[B";
    case "ArrowRight":
      return "\u001b[C";
    case "ArrowLeft":
      return "\u001b[D";
    default:
      return null;
  }
}

export function XtermShell({
  sessionId,
  sessionMode,
  terminalTail,
  draft,
  isBusy,
  onDraftChange,
  onSubmitCommand,
  onRecallPreviousCommand,
  onRecallNextCommand,
  onClearDraft,
  onInterrupt,
  onSendRawInput,
}: XtermShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef(draft.length);

  useEffect(() => {
    cursorRef.current = draft.length;
  }, [sessionId]);

  useEffect(() => {
    cursorRef.current = Math.min(cursorRef.current, draft.length);
  }, [draft]);

  useEffect(() => {
    containerRef.current?.focus();
  }, [sessionId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [draft, isBusy, sessionId, sessionMode, terminalTail]);

  const promptSegments = useMemo(() => {
    const cursor = Math.min(cursorRef.current, draft.length);
    return {
      before: draft.slice(0, cursor),
      after: draft.slice(cursor),
    };
  }, [draft]);

  return (
    <div
      ref={containerRef}
      className="xterm-shell managed-terminal"
      tabIndex={0}
      role="textbox"
      aria-label="SSH terminal"
      onClick={() => containerRef.current?.focus()}
      onKeyDown={(event) => {
        if (event.ctrlKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          onInterrupt();
          return;
        }

        if (sessionMode === "raw") {
          const sequence = rawSequenceForKey(event);
          if (sequence) {
            event.preventDefault();
            onSendRawInput(sequence);
            return;
          }
          if (isPrintableKey(event)) {
            event.preventDefault();
            onSendRawInput(event.key);
          }
          return;
        }

        if (isBusy) {
          if (event.key === "Tab") {
            event.preventDefault();
          }
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          onSubmitCommand();
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          const cursor = cursorRef.current;
          if (cursor === 0) {
            return;
          }
          cursorRef.current = cursor - 1;
          onDraftChange(draft.slice(0, cursor - 1) + draft.slice(cursor));
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onRecallPreviousCommand();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onRecallNextCommand();
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          cursorRef.current = Math.max(0, cursorRef.current - 1);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          cursorRef.current = Math.min(draft.length, cursorRef.current + 1);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          cursorRef.current = 0;
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          cursorRef.current = draft.length;
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cursorRef.current = 0;
          onClearDraft();
          return;
        }
        if (!isPrintableKey(event)) {
          return;
        }

        event.preventDefault();
        const cursor = cursorRef.current;
        cursorRef.current = cursor + event.key.length;
        onDraftChange(draft.slice(0, cursor) + event.key + draft.slice(cursor));
      }}
    >
      <div ref={scrollRef} className="managed-terminal-scroll">
        {terminalTail.map((line, index) => (
          <div key={`${sessionId}-${index}`} className={`terminal-line ${line.length === 0 ? "empty" : ""}`}>
            {line.length === 0 ? "\u00A0" : line}
          </div>
        ))}
        <div className="terminal-line terminal-prompt-line">
          {sessionMode === "raw" ? (
            <span className="terminal-busy-label">[raw mode passthrough]</span>
          ) : isBusy ? (
            <span className="terminal-busy-label">[managed command in flight]</span>
          ) : (
            <span className="terminal-prompt">
              <span className="terminal-prompt-prefix">$ </span>
              <span>{promptSegments.before}</span>
              <span className="terminal-caret"> </span>
              <span>{promptSegments.after}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
