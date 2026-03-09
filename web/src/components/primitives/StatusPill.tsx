import { Badge } from "@/components/ui/Badge";
import type { ConnectionPhase } from "@/lib/types";

const toneMap: Record<ConnectionPhase, "neutral" | "info" | "success" | "warning" | "danger"> = {
  idle: "neutral",
  connecting: "info",
  connected: "success",
  reconnecting: "warning",
  error: "danger",
};

const labelMap: Record<ConnectionPhase, string> = {
  idle: "Idle",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  error: "Error",
};

export function StatusPill({ phase, countdownMs }: { phase: ConnectionPhase; countdownMs?: number | null }) {
  const label =
    phase === "reconnecting" && countdownMs && countdownMs > 0
      ? `Reconnecting in ${(countdownMs / 1000).toFixed(1)}s`
      : labelMap[phase];
  return <Badge tone={toneMap[phase]}>{label}</Badge>;
}
