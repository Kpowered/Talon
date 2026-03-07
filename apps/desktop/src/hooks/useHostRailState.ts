import { useEffect, useRef, useState } from "react";
import type { Host } from "@talon/core";
import type { AgentSettings, AgentFormState, ConnectionAuthMethod, HostConnectionConfig, SavedHostFormState, SessionConnectionIssue, SessionOverrideFormState } from "../types/app";

type HostRailStateOptions = {
  workspaceHosts: Host[];
  selectedHostId: string | null;
  hostConfigs: HostConnectionConfig[];
  agentSettings: AgentSettings | null;
  activeConnectionIssue: SessionConnectionIssue | null;
};

function deriveUsername(host: Host, config: HostConnectionConfig | null) {
  return host.config.address.includes("@") ? host.config.address.split("@")[0] : config?.username ?? "";
}

function hostSnapshot(host: Host, config: HostConnectionConfig | null) {
  return JSON.stringify({
    hostId: host.id,
    label: host.config.label,
    address: host.config.address,
    region: host.config.region,
    tags: host.config.tags,
    port: config?.port ?? 22,
    username: config?.username ?? "",
    authMethod: config?.authMethod ?? "agent",
    fingerprintHint: config?.fingerprintHint ?? "Pending trust",
    privateKeyPath: config?.privateKeyPath ?? "",
    hasSavedPassword: config?.hasSavedPassword ?? false,
  });
}

export function useHostRailState({ workspaceHosts, selectedHostId, hostConfigs, agentSettings, activeConnectionIssue }: HostRailStateOptions) {
  const syncedHostSnapshot = useRef<string | null>(null);
  const [agentForm, setAgentForm] = useState<AgentFormState>({
    baseUrl: "",
    model: "",
    autoDiagnose: true,
    apiKey: "",
  });
  const [savedHostForm, setSavedHostForm] = useState<SavedHostFormState>({
    label: "",
    address: "",
    region: "custom",
    tags: "",
    port: "22",
    username: "",
    authMethod: "agent",
    fingerprintHint: "Pending trust",
    privateKeyPath: "",
    savedPassword: "",
  });
  const [sessionOverride, setSessionOverride] = useState<SessionOverrideFormState>({
    address: "",
    port: "22",
    username: "",
    authMethod: "agent",
    password: "",
  });
  const [isSavedConfigExpanded, setIsSavedConfigExpanded] = useState(false);
  const [isSessionOverrideExpanded, setIsSessionOverrideExpanded] = useState(false);

  useEffect(() => {
    if (!agentSettings) return;
    setAgentForm((current) => ({
      ...current,
      baseUrl: agentSettings.baseUrl,
      model: agentSettings.model,
      autoDiagnose: agentSettings.autoDiagnose,
    }));
  }, [agentSettings]);

  useEffect(() => {
    const nextHost = workspaceHosts.find((host) => host.id === selectedHostId) ?? workspaceHosts[0];
    if (!nextHost) return;

    const nextConfig = hostConfigs.find((config) => config.hostId === nextHost.id) ?? null;
    const nextSnapshot = hostSnapshot(nextHost, nextConfig);
    if (syncedHostSnapshot.current === nextSnapshot) return;

    const derivedUser = deriveUsername(nextHost, nextConfig);

    setSessionOverride((current) => ({
      ...current,
      address: nextHost.config.address,
      port: String(nextConfig?.port ?? 22),
      username: nextConfig?.username ?? derivedUser,
      authMethod: (nextConfig?.authMethod as ConnectionAuthMethod) ?? "agent",
      password: "",
    }));

    setSavedHostForm({
      label: nextHost.config.label,
      address: nextHost.config.address,
      region: nextHost.config.region,
      tags: nextHost.config.tags.join(", "),
      port: String(nextConfig?.port ?? 22),
      username: nextConfig?.username ?? derivedUser,
      authMethod: (nextConfig?.authMethod as ConnectionAuthMethod) ?? "agent",
      fingerprintHint: nextConfig?.fingerprintHint ?? "Pending trust",
      privateKeyPath: nextConfig?.privateKeyPath ?? "",
      savedPassword: "",
    });

    syncedHostSnapshot.current = nextSnapshot;
  }, [hostConfigs, selectedHostId, workspaceHosts]);

  useEffect(() => {
    if (!activeConnectionIssue) return;
    setIsSessionOverrideExpanded(true);
  }, [activeConnectionIssue]);

  const resetSessionOverride = (selectedHost: Host | null) => {
    if (!selectedHost) return;
    const nextConfig = hostConfigs.find((config) => config.hostId === selectedHost.id) ?? null;
    const derivedUser = deriveUsername(selectedHost, nextConfig);
    setSessionOverride({
      address: selectedHost.config.address,
      port: String(nextConfig?.port ?? 22),
      username: nextConfig?.username ?? derivedUser,
      authMethod: (nextConfig?.authMethod as ConnectionAuthMethod) ?? "agent",
      password: "",
    });
  };

  return {
    agentForm,
    setAgentForm,
    savedHostForm,
    setSavedHostForm,
    sessionOverride,
    setSessionOverride,
    isSavedConfigExpanded,
    setIsSavedConfigExpanded,
    isSessionOverrideExpanded,
    setIsSessionOverrideExpanded,
    resetSessionOverride,
  };
}
