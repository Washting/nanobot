export type SessionSummary = {
  key: string;
  created_at?: string;
  updated_at?: string;
  path?: string;
};

export type SessionSort = "updated_desc" | "updated_asc" | "key_asc";

export type SessionDetail = {
  key: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  last_consolidated: number;
  messages: Array<Record<string, unknown>>;
};

export type RuntimeStatus = {
  bus: {
    inbound_size: number;
    outbound_size: number;
  };
  channels: Record<string, { enabled: boolean; running: boolean; connections?: number }>;
  active_sessions: number;
  websocket_connections: number;
  recent_error_count: number;
};

export type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  logger: string;
};

export type LogLevelFilter = "ALL" | "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export type ChatUIStatus = "pending" | "sent" | "failed";
export type ChatUIKind = "final" | "progress" | "tool_hint" | "system";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  chatId: string;
  content: string;
  createdAt: number;
  ui_status: ChatUIStatus;
  ui_kind: ChatUIKind;
  metadata?: Record<string, unknown>;
  error?: string;
};

export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastItem = {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
  createdAt: number;
};

export type ConfigUpdateResult = {
  applied: boolean;
  restart_required_fields: string[];
  reloaded_channels: string[];
  errors: string[];
};

export type WSOutgoing =
  | { type: "ping" }
  | {
      type: "chat.send";
      data: {
        chat_id: string;
        content: string;
        media?: string[];
        metadata?: Record<string, unknown>;
      };
    };

export type WSIncoming =
  | {
      type: "chat.message";
      data: {
        chat_id: string;
        content: string;
        media?: string[];
        metadata?: Record<string, unknown>;
      };
    }
  | { type: "log.entry"; data: LogEntry }
  | { type: "status.update"; data: RuntimeStatus }
  | { type: "error"; data: { message: string } }
  | { type: "pong" };
