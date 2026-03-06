import type { DiagnosisMessage, HealthStatus } from "@talon/core";

export function statusLabel(status: HealthStatus) {
  if (status === "critical") return "Critical";
  if (status === "warning") return "Warning";
  return "Healthy";
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function sourceLabel(message: DiagnosisMessage["source"]) {
  return message === "agent" ? "Talon AI" : "System";
}

export function stderrClassLabel(value?: string | null) {
  if (!value) return "No classifier";
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
