import { useEffect, useMemo, useRef } from "react";

import { ActionBar } from "@/components/primitives/ActionBar";
import { LoadingState } from "@/components/feedback/LoadingState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { MetricsCard } from "@/components/monitoring/MetricsCard";
import { Separator } from "@/components/ui/Separator";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { RuntimeStatus } from "@/lib/types";
import { prettyJson } from "@/lib/utils";

export function MonitoringDashboard() {
  const status = useAppStore((state) => state.status.data);
  const refreshMs = useAppStore((state) => state.status.refreshMs);
  const setStatus = useAppStore((state) => state.actions.setStatus);
  const setStatusRefreshMs = useAppStore((state) => state.actions.setStatusRefreshMs);
  const addToast = useAppStore((state) => state.actions.addToast);

  const previousStatusRef = useRef<RuntimeStatus | null>(null);
  const latestStatusRef = useRef<RuntimeStatus | null>(null);

  useEffect(() => {
    latestStatusRef.current = status;
  }, [status]);

  const lastDelta = useMemo(() => {
    if (!status || !previousStatusRef.current) {
      return {
        inbound: 0,
        outbound: 0,
        sessions: 0,
        connections: 0,
        errors: 0,
      };
    }
    return {
      inbound: status.bus.inbound_size - previousStatusRef.current.bus.inbound_size,
      outbound: status.bus.outbound_size - previousStatusRef.current.bus.outbound_size,
      sessions: status.active_sessions - previousStatusRef.current.active_sessions,
      connections: status.websocket_connections - previousStatusRef.current.websocket_connections,
      errors: status.recent_error_count - previousStatusRef.current.recent_error_count,
    };
  }, [status]);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const next = await api.status();
        if (!active) {
          return;
        }
        previousStatusRef.current = latestStatusRef.current;
        latestStatusRef.current = next;
        setStatus(next);
      } catch (error) {
        addToast("Status polling failed", String(error), "warning");
      } finally {
        if (!active) {
          return;
        }
        const nextGap = document.visibilityState === "hidden" ? Math.max(refreshMs * 3, 6000) : refreshMs;
        timer = window.setTimeout(poll, nextGap);
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [addToast, refreshMs, setStatus]);

  return (
    <section className="dashboard-stack">
      <Card>
        <CardContent>
          <ActionBar>
            <div className="logs-control-wrap">
              <label htmlFor="refresh-select" className="control-label">
                Refresh
              </label>
              <select
                id="refresh-select"
                className="select"
                value={refreshMs}
                onChange={(event) => setStatusRefreshMs(Number(event.target.value))}
              >
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={5000}>5s</option>
                <option value={10000}>10s</option>
              </select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void api
                  .status()
                  .then((next) => {
                    previousStatusRef.current = latestStatusRef.current;
                    latestStatusRef.current = next;
                    setStatus(next);
                  })
                  .catch((error) => addToast("Status refresh failed", String(error), "warning"));
              }}
            >
              Refresh now
            </Button>
          </ActionBar>
        </CardContent>
      </Card>

      {!status ? (
        <LoadingState label="Loading status" />
      ) : (
        <>
          <div className="metrics-grid">
            <MetricsCard label="Inbound Queue" value={status.bus.inbound_size} trend={lastDelta.inbound} />
            <MetricsCard label="Outbound Queue" value={status.bus.outbound_size} trend={lastDelta.outbound} />
            <MetricsCard label="Active Sessions" value={status.active_sessions} trend={lastDelta.sessions} />
            <MetricsCard
              label="WebSocket Connections"
              value={status.websocket_connections}
              trend={lastDelta.connections}
            />
            <MetricsCard label="Recent Errors" value={status.recent_error_count} trend={lastDelta.errors} />
          </div>

          <Card>
            <CardContent>
              <div className="channel-header">
                <h3 className="section-title">Channel states</h3>
                <Badge tone={status.recent_error_count > 0 ? "warning" : "success"}>
                  {status.recent_error_count > 0 ? "Attention needed" : "Healthy"}
                </Badge>
              </div>
              <Separator />
              <pre className="json-block">{prettyJson(status.channels)}</pre>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
