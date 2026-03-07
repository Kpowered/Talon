import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

type XtermShellProps = {
  sessionId: string;
  terminalTail: string[];
  draft: string;
  isBusy: boolean;
  onDraftChange: (value: string) => void;
  onSubmitCommand: () => void;
  onRecallPreviousCommand: () => void;
  onRecallNextCommand: () => void;
  onClearDraft: () => void;
};

type RenderState = {
  sessionId: string | null;
  renderedLines: string[];
  promptText: string;
  promptCursor: number;
  promptVisible: boolean;
};

function isPrintableInput(data: string) {
  return data.length > 0 && !data.startsWith("\u001b") && data !== "\r" && data !== "\u007f";
}

function promptTextForState(draft: string, isBusy: boolean) {
  return isBusy ? "[managed command in flight]" : `$ ${draft}`;
}

function clearPromptLine(terminal: Terminal, state: RenderState) {
  if (!state.promptVisible) {
    return;
  }
  terminal.write("\u001b[2K\r");
  state.promptVisible = false;
}

function drawPromptLine(terminal: Terminal, state: RenderState, draft: string, isBusy: boolean, cursor: number) {
  const text = promptTextForState(draft, isBusy);
  terminal.write("\u001b[2K\r");
  terminal.write(text);
  if (!isBusy) {
    const moveLeft = Math.max(0, draft.length - cursor);
    if (moveLeft > 0) {
      terminal.write(`\u001b[${moveLeft}D`);
    }
  }
  state.promptText = text;
  state.promptCursor = cursor;
  state.promptVisible = true;
}

function appendTailLines(terminal: Terminal, lines: string[]) {
  for (const line of lines) {
    terminal.writeln(line);
  }
}

function startsWithRenderedLines(nextLines: string[], renderedLines: string[]) {
  if (renderedLines.length > nextLines.length) {
    return false;
  }
  return renderedLines.every((line, index) => nextLines[index] === line);
}

export function XtermShell({
  sessionId,
  terminalTail,
  draft,
  isBusy,
  onDraftChange,
  onSubmitCommand,
  onRecallPreviousCommand,
  onRecallNextCommand,
  onClearDraft,
}: XtermShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const renderStateRef = useRef<RenderState>({
    sessionId: null,
    renderedLines: [],
    promptText: "",
    promptCursor: 0,
    promptVisible: false,
  });
  const cursorRef = useRef(0);
  const draftRef = useRef(draft);
  const busyRef = useRef(isBusy);
  const draftChangeRef = useRef(onDraftChange);
  const submitCommandRef = useRef(onSubmitCommand);
  const recallPreviousRef = useRef(onRecallPreviousCommand);
  const recallNextRef = useRef(onRecallNextCommand);
  const clearDraftRef = useRef(onClearDraft);

  draftRef.current = draft;
  busyRef.current = isBusy;
  draftChangeRef.current = onDraftChange;
  submitCommandRef.current = onSubmitCommand;
  recallPreviousRef.current = onRecallPreviousCommand;
  recallNextRef.current = onRecallNextCommand;
  clearDraftRef.current = onClearDraft;

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
        return;
      }
      if (data === "\u001b[C") {
        cursorRef.current = Math.min(draftRef.current.length, cursorRef.current + 1);
        return;
      }
      if (data === "\u001b[H" || data === "\u001bOH") {
        cursorRef.current = 0;
        return;
      }
      if (data === "\u001b[F" || data === "\u001bOF") {
        cursorRef.current = draftRef.current.length;
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

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onClearDraft, onDraftChange, onRecallNextCommand, onRecallPreviousCommand, onSubmitCommand]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    const state = renderStateRef.current;
    const sessionChanged = state.sessionId !== sessionId;

    if (sessionChanged) {
      terminal.reset();
      state.sessionId = sessionId;
      state.renderedLines = [...terminalTail];
      state.promptVisible = false;
      state.promptText = "";
      state.promptCursor = 0;
      cursorRef.current = draft.length;
      appendTailLines(terminal, terminalTail);
      drawPromptLine(terminal, state, draft, isBusy, cursorRef.current);
      fitAddonRef.current?.fit();
      terminal.focus();
      return;
    }

    if (terminalTail.length > 0 && startsWithRenderedLines(terminalTail, state.renderedLines)) {
      const appendedLines = terminalTail.slice(state.renderedLines.length);
      if (appendedLines.length > 0) {
        clearPromptLine(terminal, state);
        appendTailLines(terminal, appendedLines);
        state.renderedLines = [...terminalTail];
        drawPromptLine(terminal, state, draft, isBusy, cursorRef.current);
        return;
      }
    }

    const nextPromptText = promptTextForState(draft, isBusy);
    if (state.promptText !== nextPromptText || state.promptCursor !== cursorRef.current || !state.promptVisible) {
      drawPromptLine(terminal, state, draft, isBusy, cursorRef.current);
    }
  }, [draft, isBusy, sessionId, terminalTail]);

  return <div className="xterm-shell" ref={containerRef} />;
}
