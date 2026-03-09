import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ActionBar } from "@/components/primitives/ActionBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { SessionSort, SessionSummary } from "@/lib/types";
import { prettyJson } from "@/lib/utils";

function sortedItems(items: SessionSummary[], sort: SessionSort): SessionSummary[] {
  const list = [...items];
  if (sort === "key_asc") {
    list.sort((a, b) => a.key.localeCompare(b.key));
    return list;
  }
  list.sort((a, b) => (a.updated_at || "").localeCompare(b.updated_at || ""));
  if (sort === "updated_desc") {
    list.reverse();
  }
  return list;
}

export function SessionViewer() {
  const sessions = useAppStore((state) => state.sessions.items);
  const current = useAppStore((state) => state.sessions.current);
  const setSessions = useAppStore((state) => state.actions.setSessions);
  const setCurrentSession = useAppStore((state) => state.actions.setCurrentSession);
  const addToast = useAppStore((state) => state.actions.addToast);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SessionSort>("updated_desc");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    const data = await api.sessions();
    setSessions(data.items);
  };

  useEffect(() => {
    let mounted = true;
    void refresh()
      .catch((reason) => {
        if (mounted) {
          setError(String(reason));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const base = keyword ? sessions.filter((item) => item.key.toLowerCase().includes(keyword)) : sessions;
    return sortedItems(base, sort);
  }, [query, sessions, sort]);

  if (loading) {
    return <LoadingState label="Loading sessions" />;
  }
  if (error) {
    return <ErrorState title="Session list unavailable" description={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="sessions-grid">
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionBar>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by key"
              aria-label="Search sessions"
            />
            <select
              className="select"
              value={sort}
              onChange={(event) => setSort(event.target.value as SessionSort)}
              aria-label="Sort sessions"
            >
              <option value="updated_desc">Updated (newest)</option>
              <option value="updated_asc">Updated (oldest)</option>
              <option value="key_asc">Key (A-Z)</option>
            </select>
          </ActionBar>
          <ScrollArea className="session-list">
            {filtered.length === 0 ? (
              <EmptyState
                title="No sessions found"
                description="Try another query or wait for new conversation history."
              />
            ) : (
              filtered.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`session-item ${current?.key === item.key ? "active" : ""}`}
                  onClick={async () => {
                    try {
                      const detail = await api.session(item.key);
                      setCurrentSession(detail);
                    } catch (reason) {
                      addToast("Load failed", String(reason), "error");
                    }
                  }}
                >
                  <p>{item.key}</p>
                  <span>{item.updated_at || item.created_at || "Unknown update time"}</span>
                </button>
              ))
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {!current ? (
            <EmptyState
              title="Select a session"
              description="Inspect full message history and remove stale sessions safely."
            />
          ) : (
            <div className="session-detail-stack">
              <ActionBar>
                <Badge tone="info">{current.key}</Badge>
                <Button variant="danger" size="sm" onClick={() => setConfirmKey(current.key)}>
                  Delete
                </Button>
              </ActionBar>
              <p className="muted-line">
                Updated {current.updated_at} • Messages {current.messages.length}
              </p>
              <pre className="json-block">{prettyJson(current.messages)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(confirmKey)}
        title="Delete session?"
        description={`This action permanently removes ${confirmKey || "the session"} from disk.`}
        confirmText="Delete permanently"
        busy={deleting}
        onCancel={() => setConfirmKey(null)}
        onConfirm={async () => {
          if (!confirmKey) {
            return;
          }
          setDeleting(true);
          try {
            await api.deleteSession(confirmKey);
            if (current?.key === confirmKey) {
              setCurrentSession(null);
            }
            await refresh();
            addToast("Session deleted", confirmKey, "success");
          } catch (reason) {
            addToast("Delete failed", String(reason), "error");
          } finally {
            setDeleting(false);
            setConfirmKey(null);
          }
        }}
      />
    </div>
  );
}
