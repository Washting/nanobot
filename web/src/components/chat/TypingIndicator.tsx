import type { FC } from "react";

import { StatusPill } from "@/components/primitives/StatusPill";
import type { ConnectionPhase } from "@/lib/types";

export const TypingIndicator: FC<{
  phase: ConnectionPhase;
  reconnectInMs: number | null;
  error?: string | null;
}> = ({ phase, reconnectInMs, error }) => (
  <div className="connection-indicator">
    <StatusPill phase={phase} countdownMs={reconnectInMs} />
    {error ? <span className="connection-error">{error}</span> : null}
  </div>
);
