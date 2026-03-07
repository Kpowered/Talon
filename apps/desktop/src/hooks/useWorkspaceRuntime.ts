import { useCallback, useEffect, useState } from "react";
import type { DiagnosisContextPacket, TalonWorkspaceState } from "@talon/core";
import type {
  ActionNotice,
  AgentSettings,
  AppCommandError,
  HostConnectionConfig,
  SessionConnectionIssue,
} from "../types/app";
import { getAgentSettings, getLatestContextPacket, getSessionRegistry, getTerminalSnapshot, getWorkspaceState } from "../lib/tauri";

type WorkspaceRuntimeOptions = {
  onError: (notice: ActionNotice) => void;
};

function shouldApplyTerminalSnapshot(
  nextSessionId: string,
  nextLines: string[],
  currentSessionId: string | null,
  currentLines: string[],
) {
  if (nextSessionId !== currentSessionId) {
    return true;
  }
  if (currentLines.length === 0) {
    return true;
  }
  if (nextLines.length <= currentLines.length) {
    return false;
  }
  return currentLines.every((line, index) => nextLines[index] === line);
}



export function useWorkspaceRuntime({ onError }: WorkspaceRuntimeOptions) {
  const [workspace, setWorkspace] = useState<TalonWorkspaceState | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [hostConfigs, setHostConfigs] = useState<HostConnectionConfig[]>([]);
  const [registryActiveSessionId, setRegistryActiveSessionId] = useState<string | null>(null);
  const [busySessionIds, setBusySessionIds] = useState<string[]>([]);
  const [activeConnectionIssue, setActiveConnectionIssue] = useState<SessionConnectionIssue | null>(null);
  const [terminalTail, setTerminalTail] = useState<string[]>([]);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [latestContextPacket, setLatestContextPacket] = useState<DiagnosisContextPacket | null>(null);

  const applyWorkspace = useCallback((state: TalonWorkspaceState) => {
    setWorkspace(state);
    setSelectedHostId((current) => {
      if (current && state.hosts.some((host) => host.id === current)) {
        return current;
      }
      return state.sessions[0]?.hostId ?? state.hosts[0]?.id ?? null;
    });
    return state;
  }, []);

  const applyRegistry = useCallback((registry: { hostConfigs: HostConnectionConfig[]; activeSessionId: string; busySessionIds: string[]; activeConnectionIssue: SessionConnectionIssue | null }) => {
    setHostConfigs(registry.hostConfigs);
    setRegistryActiveSessionId(registry.activeSessionId || null);
    setBusySessionIds(registry.busySessionIds);
    setActiveConnectionIssue(registry.activeConnectionIssue);
    return registry;
  }, []);

  const reportError = useCallback(
    (error: unknown) => {
      const commandError = error as AppCommandError;
      onError({ kind: "error", message: commandError.message ?? "Unexpected desktop command failure." });
    },
    [onError],
  );

  const refreshWorkspace = useCallback(async () => {
    try {
      return applyWorkspace(await getWorkspaceState());
    } catch (error) {
      reportError(error);
      throw error;
    }
  }, [applyWorkspace, reportError]);

  const refreshRegistry = useCallback(async () => {
    try {
      return applyRegistry(await getSessionRegistry());
    } catch (error) {
      reportError(error);
      throw error;
    }
  }, [applyRegistry, reportError]);

  const refreshAll = useCallback(async () => {
    const [state, registry] = await Promise.all([refreshWorkspace(), refreshRegistry()]);
    return { state, registry };
  }, [refreshRegistry, refreshWorkspace]);

  const loadTerminalSnapshot = useCallback(
    async (sessionId: string) => {
      try {
        const snapshot = await getTerminalSnapshot(sessionId);
        setTerminalTail((current) => {
          if (shouldApplyTerminalSnapshot(snapshot.sessionId || sessionId, snapshot.lines, terminalSessionId, current)) {
            setTerminalSessionId(snapshot.sessionId || sessionId);
            return snapshot.lines;
          }
          return current;
        });
        return snapshot;
      } catch (error) {
        reportError(error);
        throw error;
      }
    },
    [reportError, terminalSessionId],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setIsLoadingState(true);
      try {
        const [state, registry, settingsResponse] = await Promise.all([
          getWorkspaceState(),
          getSessionRegistry(),
          getAgentSettings(),
        ]);
        if (cancelled) return;
        applyWorkspace(state);
        applyRegistry(registry);
        setAgentSettings(settingsResponse.settings);
        const liveSessionId = registry.activeSessionId || state.activeSessionId;
        if (liveSessionId) {
          void loadTerminalSnapshot(liveSessionId);
        } else {
          setTerminalSessionId(null);
          setTerminalTail([]);
        }
      } catch (error) {
        if (!cancelled) {
          reportError(error);
        }
      } finally {
        if (!cancelled) setIsLoadingState(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [applyRegistry, applyWorkspace, reportError]);

  useEffect(() => {
    const liveSessionId = registryActiveSessionId || workspace?.activeSessionId;
    if (!liveSessionId) {
      setTerminalSessionId(null);
      setTerminalTail([]);
      return;
    }

    void loadTerminalSnapshot(liveSessionId);
    const interval = window.setInterval(() => {
      void refreshWorkspace();
      void refreshRegistry();
      void loadTerminalSnapshot(liveSessionId);
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadTerminalSnapshot, refreshRegistry, refreshWorkspace, registryActiveSessionId, workspace?.activeSessionId]);

  useEffect(() => {
    if (!workspace?.activeSessionId) {
      setLatestContextPacket(null);
      return;
    }
    void getLatestContextPacket(workspace.activeSessionId)
      .then((response) => {
        setLatestContextPacket(response.packet);
      })
      .catch((error) => {
        setLatestContextPacket(null);
        reportError(error);
      });
  }, [reportError, workspace?.activeSessionId, workspace?.latestDiagnosis?.contextPacketId]);

  return {
    workspace,
    setWorkspace,
    selectedHostId,
    setSelectedHostId,
    isLoadingState,
    hostConfigs,
    setHostConfigs,
    registryActiveSessionId,
    busySessionIds,
    activeConnectionIssue,
    setActiveConnectionIssue,
    terminalTail,
    setTerminalTail,
    agentSettings,
    setAgentSettings,
    latestContextPacket,
    refreshWorkspace,
    refreshRegistry,
    refreshAll,
    loadTerminalSnapshot,
  };
}









