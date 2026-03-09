import { useEffect, useMemo, useRef, useState } from "react";

import { ActionBar } from "@/components/primitives/ActionBar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { LogEntry, LogLevelFilter } from "@/lib/types";

export function LogsPanel() {
  const logs = useAppStore((state) => state.logs.items);
  const setLogs = useAppStore((state) => state.actions.setLogs);
  const addToast = useAppStore((state) => state.actions.addToast);

  const [level, setLevel] = useState<LogLevelFilter>("ALL");
  const [keyword, setKeyword] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [snapshot, setSnapshot] = useState<LogEntry[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    void api
      .logs(300)
      .then((result) => {
        if (!mounted) {
          return;
        }
        setLogs(result.items);
      })
      .catch((error) => addToast("Log API error", String(error), "error"));

    return () => {
      mounted = false;
    };
  }, [addToast, setLogs]);

  const source = paused ? snapshot : logs;
  const filtered = useMemo(() => {
    return source.filter((entry) => {
      const levelPass = level === "ALL" || entry.level.toUpperCase() === level;
      const keywordPass = keyword.trim()
        ? `${entry.message} ${entry.logger}`.toLowerCase().includes(keyword.toLowerCase())
        : true;
      return levelPass && keywordPass;
    });
  }, [keyword, level, source]);

  useEffect(() => {
    if (!autoScroll || paused) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [autoScroll, filtered, paused]);

  return (
    <Card>
      <CardContent>
        <ActionBar>
          <div className="logs-control-wrap">
            <label className="control-label" htmlFor="log-level">
              Level
            </label>
            <select
              id="log-level"
              className="select"
              value={level}
              onChange={(event) => setLevel(event.target.value as LogLevelFilter)}
            >
              <option value="ALL">ALL</option>
              <option value="DEBUG">DEBUG</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Filter message / logger"
              aria-label="Filter logs"
            />
          </div>
          <div className="logs-control-wrap logs-control-wrap-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPaused((current) => {
                  const next = !current;
                  if (next) {
                    setSnapshot(logs);
                  }
                  return next;
                });
              }}
            >
              {paused ? "Resume stream" : "Pause stream"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAutoScroll((v) => !v)}>
              {autoScroll ? "Auto-scroll: on" : "Auto-scroll: off"}
            </Button>
          </div>
        </ActionBar>

        <ScrollArea className="logs-scroll" ref={viewportRef}>
          {filtered.map((entry, index) => (
            <p key={`${entry.timestamp}-${index}`} className={`log-line level-${entry.level.toLowerCase()}`}>
              <span>[{entry.level}]</span> <span>{entry.timestamp}</span> <span>{entry.message}</span>
            </p>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
