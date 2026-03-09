import { create } from "zustand";

import type {
  ChatMessage,
  ConfigUpdateResult,
  ConnectionPhase,
  LogEntry,
  RuntimeStatus,
  SessionDetail,
  SessionSummary,
  ToastItem,
  ToastTone,
} from "@/lib/types";

type AppState = {
  ui: {
    token: string;
    toasts: ToastItem[];
  };
  chat: {
    messages: ChatMessage[];
  };
  connection: {
    phase: ConnectionPhase;
    reconnectInMs: number | null;
    lastError: string | null;
  };
  sessions: {
    items: SessionSummary[];
    current: SessionDetail | null;
  };
  logs: {
    items: LogEntry[];
  };
  status: {
    data: RuntimeStatus | null;
    refreshMs: number;
  };
  config: {
    lastResult: ConfigUpdateResult | null;
  };
  actions: {
    setToken: (token: string) => void;
    addToast: (title: string, message: string | undefined, tone: ToastTone) => string;
    dismissToast: (id: string) => void;
    addOutgoingMessage: (chatId: string, content: string) => string;
    addIncomingMessage: (chatId: string, content: string, metadata?: Record<string, unknown>) => string;
    markMessageStatus: (
      id: string,
      status: ChatMessage["ui_status"],
      error?: string | null,
    ) => void;
    setConnectionPhase: (phase: ConnectionPhase, error?: string | null) => void;
    setReconnectInMs: (value: number | null) => void;
    setSessions: (items: SessionSummary[]) => void;
    setCurrentSession: (item: SessionDetail | null) => void;
    appendLog: (entry: LogEntry) => void;
    setLogs: (items: LogEntry[]) => void;
    setStatus: (status: RuntimeStatus) => void;
    setStatusRefreshMs: (ms: number) => void;
    setConfigResult: (result: ConfigUpdateResult | null) => void;
    resetChat: () => void;
  };
};

function makeId(prefix: string): string {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useAppStore = create<AppState>((set) => ({
  ui: {
    token: localStorage.getItem("nanobot_token") || "",
    toasts: [],
  },
  chat: {
    messages: [],
  },
  connection: {
    phase: "idle",
    reconnectInMs: null,
    lastError: null,
  },
  sessions: {
    items: [],
    current: null,
  },
  logs: {
    items: [],
  },
  status: {
    data: null,
    refreshMs: 2000,
  },
  config: {
    lastResult: null,
  },
  actions: {
    setToken: (token) =>
      set((state) => {
        localStorage.setItem("nanobot_token", token);
        return { ui: { ...state.ui, token } };
      }),
    addToast: (title, message, tone) => {
      const id = makeId("toast");
      set((state) => ({
        ui: {
          ...state.ui,
          toasts: [
            ...state.ui.toasts,
            { id, title, message, tone, createdAt: Date.now() },
          ].slice(-6),
        },
      }));
      return id;
    },
    dismissToast: (id) =>
      set((state) => ({
        ui: { ...state.ui, toasts: state.ui.toasts.filter((t) => t.id !== id) },
      })),
    addOutgoingMessage: (chatId, content) => {
      const id = makeId("msg");
      const msg: ChatMessage = {
        id,
        role: "user",
        chatId,
        content,
        createdAt: Date.now(),
        ui_status: "pending",
        ui_kind: "final",
      };
      set((state) => ({ chat: { ...state.chat, messages: [...state.chat.messages, msg] } }));
      return id;
    },
    addIncomingMessage: (chatId, content, metadata) => {
      const id = makeId("msg");
      const kind = metadata?._progress
        ? metadata?._tool_hint
          ? "tool_hint"
          : "progress"
        : "final";
      const msg: ChatMessage = {
        id,
        role: "assistant",
        chatId,
        content,
        createdAt: Date.now(),
        ui_status: "sent",
        ui_kind: kind,
        metadata,
      };
      set((state) => ({ chat: { ...state.chat, messages: [...state.chat.messages, msg] } }));
      return id;
    },
    markMessageStatus: (id, status, error) =>
      set((state) => ({
        chat: {
          ...state.chat,
          messages: state.chat.messages.map((msg) =>
            msg.id === id ? { ...msg, ui_status: status, error: error || undefined } : msg,
          ),
        },
      })),
    setConnectionPhase: (phase, error) =>
      set((state) => ({
        connection: {
          ...state.connection,
          phase,
          lastError: error ?? (phase === "error" ? state.connection.lastError : null),
        },
      })),
    setReconnectInMs: (value) =>
      set((state) => ({
        connection: { ...state.connection, reconnectInMs: value },
      })),
    setSessions: (items) => set((state) => ({ sessions: { ...state.sessions, items } })),
    setCurrentSession: (item) => set((state) => ({ sessions: { ...state.sessions, current: item } })),
    appendLog: (entry) =>
      set((state) => {
        const next = [...state.logs.items, entry];
        return { logs: { ...state.logs, items: next.slice(-1000) } };
      }),
    setLogs: (items) =>
      set((state) => ({
        logs: { ...state.logs, items: items.slice(-1000) },
      })),
    setStatus: (data) => set((state) => ({ status: { ...state.status, data } })),
    setStatusRefreshMs: (refreshMs) => set((state) => ({ status: { ...state.status, refreshMs } })),
    setConfigResult: (lastResult) => set((state) => ({ config: { ...state.config, lastResult } })),
    resetChat: () => set((state) => ({ chat: { ...state.chat, messages: [] } })),
  },
}));
