import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import type { TerminalInputMode } from "../types/app";

type XtermShellProps = {
  sessionId: string;
  terminalTail: string[];
  draft: string;
  inputMode: TerminalInputMode;
  isBusy: boolean;
  onDraftChange: (value: string) => void;
  onSubmitCommand: () => void;
  onRecallPreviousCommand: () => void;
  onRecallNextCommand: () => void;
  onClearDraft: () => void;
  onWriteRawInput: (data: string) => void;
};

function isPrintableInput(data: string) {
  return data.length > 0 && !data.startsWith("\u001b") && data !== "\r" && data !== "\u007f";
}

function renderTerminal(
  terminal: Terminal,
  terminalTail: string[],
  inputMode: TerminalInputMode,
  isBusy: boolean,
  draft: string,
  cursor: number,
) {
  terminal.reset();
  for (const line of terminalTail) {
    terminal.writeln(line);
  }
  if (inputMode === "managed") {
    if (isBusy) {
      terminal.write("[managed command in flight]");
    } else {
      terminal.write(`$ ${draft}`);
      const moveLeft = draft.length - cursor;
      if (moveLeft > 0) {
        terminal.write(`\u001b[${moveLeft}D`);
      }
    }
  }
  terminal.scrollToBottom();
}

export function XtermShell({
  sessionId,
  terminalTail,
  draft,
  inputMode,
  isBusy,
  onDraftChange,
  onSubmitCommand,
  onRecallPreviousCommand,
  onRecallNextCommand,
  onClearDraft,
  onWriteRawInput,
}: XtermShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cursorRef = useRef(0);
  const draftRef = useRef(draft);
  const modeRef = useRef(inputMode);
  const busyRef = useRef(isBusy);
  const draftChangeRef = useRef(onDraftChange);
  const submitCommandRef = useRef(onSubmitCommand);
  const recallPreviousRef = useRef(onRecallPreviousCommand);
  const recallNextRef = useRef(onRecallNextCommand);
  const clearDraftRef = useRef(onClearDraft);
  const writeRawInputRef = useRef(onWriteRawInput);
  const terminalTailRef = useRef(terminalTail);

  draftRef.current = draft;
  modeRef.current = inputMode;
  busyRef.current = isBusy;
  draftChangeRef.current = onDraftChange;
  submitCommandRef.current = onSubmitCommand;
  recallPreviousRef.current = onRecallPreviousCommand;
  recallNextRef.current = onRecallNextCommand;
  clearDraftRef.current = onClearDraft;
  writeRawInputRef.current = onWriteRawInput;
  terminalTailRef.current = terminalTail;

  useEffect(() => {
    cursorRef.current = draft.length;
  }, [sessionId]);

  useEffect(() => {
    cursorRef.current = Math.min(cursorRef.current, draft.length);
  }, [draft]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      theme: {
        background: "#081019",
        foreground: "#d8e1f5",
        cursor: "#8fb3ff",
        black: "#081019",
        brightBlack: "#5f6f87",
        brightBlue: "#8fb3ff",
        brightCyan: "#80e1d8",
        brightGreen: "#7be4ab",
        brightMagenta: "#d3a6ff",
        brightRed: "#ff8b8b",
        brightWhite: "#f5f7ff",
        brightYellow: "#ffd37b",
        blue: "#5b8cff",
        cyan: "#59c8be",
        green: "#49c97f",
        magenta: "#ba85ff",
        red: "#ff6b6b",
        white: "#d8e1f5",
        yellow: "#f5c96a",
      },
      scrollback: 1500,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminal.focus();

    const dataDisposable = terminal.onData((data) => {
      if (modeRef.current === "raw") {
        writeRawInputRef.current(data);
        return;
      }
      if (busyRef.current) {
        return;
      }
      if (data === "\r") {
        submitCommandRef.current();
        return;
      }
      if (data === "\u007f") {
        const currentDraft = draftRef.current;
        const cursor = cursorRef.current;
        if (cursor === 0) {
          return;
        }
        cursorRef.current = cursor - 1;
        draftChangeRef.current(currentDraft.slice(0, cursor - 1) + currentDraft.slice(cursor));
        return;
      }
      if (data === "\u001b[A") {
        recallPreviousRef.current();
        return;
      }
      if (data === "\u001b[B") {
        recallNextRef.current();
        return;
      }
      if (data === "\u001b[D") {
        cursorRef.current = Math.max(0, cursorRef.current - 1);
        renderTerminal(terminal, terminalTailRef.current, modeRef.current, busyRef.current, draftRef.current, cursorRef.current);
        return;
      }
      if (data === "\u001b[C") {
        cursorRef.current = Math.min(draftRef.current.length, cursorRef.current + 1);
        renderTerminal(terminal, terminalTailRef.current, modeRef.current, busyRef.current, draftRef.current, cursorRef.current);
        return;
      }
      if (data === "\u001b[H" || data === "\u001bOH") {
        cursorRef.current = 0;
        renderTerminal(terminal, terminalTailRef.current, modeRef.current, busyRef.current, draftRef.current, cursorRef.current);
        return;
      }
      if (data === "\u001b[F" || data === "\u001bOF") {
        cursorRef.current = draftRef.current.length;
        renderTerminal(terminal, terminalTailRef.current, modeRef.current, busyRef.current, draftRef.current, cursorRef.current);
        return;
      }
      if (data === "\u001b") {
        cursorRef.current = 0;
        clearDraftRef.current();
        return;
      }
      if (!isPrintableInput(data)) {
        return;
      }
      const currentDraft = draftRef.current;
      const cursor = cursorRef.current;
      cursorRef.current = cursor + data.length;
      draftChangeRef.current(currentDraft.slice(0, cursor) + data + currentDraft.slice(cursor));
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    renderTerminal(terminal, terminalTail, inputMode, isBusy, draft, cursorRef.current);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onClearDraft, onDraftChange, onRecallNextCommand, onRecallPreviousCommand, onSubmitCommand, onWriteRawInput]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    renderTerminal(terminal, terminalTail, inputMode, isBusy, draft, cursorRef.current);
    fitAddonRef.current?.fit();
    terminal.focus();
  }, [draft, inputMode, isBusy, sessionId, terminalTail]);

  return <div className="xterm-shell" ref={containerRef} />;
}
