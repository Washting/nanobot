import { useEffect, useMemo, useState } from "react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ActionBar } from "@/components/primitives/ActionBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { prettyJson } from "@/lib/utils";

function diffPaths(before: unknown, after: unknown, prefix = "channels"): string[] {
  if (
    typeof before === "object" &&
    before !== null &&
    typeof after === "object" &&
    after !== null &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    return keys.flatMap((key) => diffPaths(left[key], right[key], `${prefix}.${key}`));
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    return [prefix];
  }
  return [];
}

function parseJsonError(error: unknown): string {
  const text = String(error);
  const match = text.match(/position (\d+)/i);
  if (!match) {
    return text;
  }
  return `Invalid JSON near character ${match[1]}.`;
}

export function ConfigEditor() {
  const addToast = useAppStore((state) => state.actions.addToast);
  const setConfigResult = useAppStore((state) => state.actions.setConfigResult);
  const result = useAppStore((state) => state.config.lastResult);

  const [source, setSource] = useState<Record<string, unknown> | null>(null);
  const [value, setValue] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void api
      .config()
      .then((data) => {
        if (!mounted) {
          return;
        }
        setSource(data.channels);
        setValue(prettyJson(data.channels));
      })
      .catch((error: unknown) => {
        if (mounted) {
          setLoadError(String(error));
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

  const parsedDraft = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(value) as Record<string, unknown> };
    } catch (error) {
      return { ok: false as const, error: parseJsonError(error) };
    }
  }, [value]);

  const changed = useMemo(() => {
    if (!source || !parsedDraft.ok) {
      return [];
    }
    return diffPaths(source, parsedDraft.value);
  }, [parsedDraft, source]);

  if (loading) {
    return <LoadingState label="Loading configuration" />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="Configuration unavailable"
        description={loadError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="config-grid">
      <Card>
        <CardHeader>
          <CardTitle>Channels JSON</CardTitle>
          <CardDescription>
            Sensitive values stay masked unless you explicitly replace them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionBar>
            <Badge tone={parsedDraft.ok ? "success" : "danger"}>
              {parsedDraft.ok ? "JSON valid" : "Invalid JSON"}
            </Badge>
            <Badge tone="info">{changed.length} changed paths</Badge>
          </ActionBar>
          <Textarea
            className="config-editor"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            spellCheck={false}
            rows={24}
            aria-label="Channels configuration JSON"
          />
          {!parsedDraft.ok ? <p className="form-error">{parsedDraft.error}</p> : null}
          <div className="config-actions">
            <Button
              variant="secondary"
              onClick={() => {
                if (source) {
                  setValue(prettyJson(source));
                }
              }}
            >
              Reset draft
            </Button>
            <Button
              disabled={!parsedDraft.ok || saving}
              onClick={async () => {
                if (!parsedDraft.ok) {
                  return;
                }
                setSaving(true);
                try {
                  const next = await api.updateConfig(parsedDraft.value);
                  setConfigResult(next);
                  if (next.applied) {
                    setSource(parsedDraft.value);
                    addToast("Configuration applied", "Channels were reloaded successfully.", "success");
                  } else {
                    addToast("Configuration rejected", next.errors.join("\\n"), "error");
                  }
                } catch (error) {
                  addToast("Save failed", String(error), "error");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Save config"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change summary</CardTitle>
          <CardDescription>
            Paths shown below will be updated on save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {changed.length === 0 ? (
            <p className="muted-line">No unsaved changes.</p>
          ) : (
            <ul className="path-list">
              {changed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {result ? (
            <div className="config-result-wrap">
              <h4 className="section-title">Last result</h4>
              <ActionBar>
                <Badge tone={result.applied ? "success" : "danger"}>
                  {result.applied ? "Applied" : "Failed"}
                </Badge>
                {result.restart_required_fields.length > 0 ? (
                  <Badge tone="warning">Restart required fields: {result.restart_required_fields.length}</Badge>
                ) : null}
              </ActionBar>
              {result.restart_required_fields.length > 0 ? (
                <ul className="path-list">
                  {result.restart_required_fields.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {result.errors.length > 0 ? (
                <pre className="json-block">{result.errors.join("\\n")}</pre>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
