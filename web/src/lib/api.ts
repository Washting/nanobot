import type {
  ConfigUpdateResult,
  LogEntry,
  RuntimeStatus,
  SessionDetail,
  SessionSummary,
  WSIncoming,
  WSOutgoing,
} from "@/lib/types";

const DEFAULT_TOKEN = "";

function getToken(): string {
  return localStorage.getItem("nanobot_token") || DEFAULT_TOKEN;
}

function isValidWsSubprotocolToken(value: string): boolean {
  // RFC token chars accepted by browser for WebSocket subprotocol.
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}

function getBaseUrl(): string {
  return import.meta.env.VITE_NANOBOT_API_BASE || window.location.origin;
}

function authHeaders(): HeadersInit {
  const token = getToken().trim();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const parsed = (await response.json()) as { detail?: string };
      detail = parsed.detail || "";
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  async health(): Promise<{ status: string }> {
    return http("/api/health");
  },
  async status(): Promise<RuntimeStatus> {
    return http("/api/status");
  },
  async sessions(): Promise<{ items: SessionSummary[] }> {
    return http("/api/sessions");
  },
  async session(key: string): Promise<SessionDetail> {
    return http(`/api/sessions/${encodeURIComponent(key)}`);
  },
  async deleteSession(key: string): Promise<{ deleted: boolean; key: string }> {
    return http(`/api/sessions/${encodeURIComponent(key)}`, { method: "DELETE" });
  },
  async config(): Promise<{ channels: Record<string, unknown> }> {
    return http("/api/config");
  },
  async updateConfig(channels: Record<string, unknown>): Promise<ConfigUpdateResult> {
    return http("/api/config", {
      method: "POST",
      body: JSON.stringify({ channels }),
    });
  },
  async logs(limit = 200): Promise<{ items: LogEntry[] }> {
    return http(`/api/logs?limit=${limit}`);
  },
};

export type WSHandlers = {
  onChatMessage?: (payload: WSIncoming & { type: "chat.message" }) => void;
  onLog?: (payload: LogEntry) => void;
  onStatus?: (payload: RuntimeStatus) => void;
  onError?: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onConnecting?: () => void;
  onReconnectScheduled?: (ms: number) => void;
  onReconnectTick?: (ms: number) => void;
};

export class WSClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectTickTimer: number | null = null;
  private retries = 0;
  private closedByClient = false;
  private handlers: WSHandlers;

  constructor(handlers: WSHandlers) {
    this.handlers = handlers;
  }

  connect(chatId = "default"): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }
    this.closedByClient = false;
    this.handlers.onConnecting?.();

    const token = getToken().trim();
    if (!token) {
      this.handlers.onError?.("Missing nanobot_token. Set localStorage and retry.");
      this.scheduleReconnect(chatId);
      return;
    }
    if (!isValidWsSubprotocolToken(token)) {
      this.handlers.onError?.("Invalid nanobot_token format for WebSocket subprotocol.");
      this.scheduleReconnect(chatId);
      return;
    }

    const base = new URL(getBaseUrl());
    const protocol = base.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${base.host}/ws?chat_id=${encodeURIComponent(chatId)}`;
    try {
      this.socket = new WebSocket(wsUrl, ["bearer", token]);
    } catch (error) {
      this.handlers.onError?.(`Failed to initialize WebSocket: ${String(error)}`);
      this.scheduleReconnect(chatId);
      return;
    }

    this.socket.onopen = () => {
      this.retries = 0;
      this.clearReconnectTimers();
      this.handlers.onReconnectTick?.(0);
      this.handlers.onOpen?.();
    };

    this.socket.onclose = () => {
      if (this.closedByClient) {
        return;
      }
      this.handlers.onClose?.();
      this.scheduleReconnect(chatId);
    };

    this.socket.onmessage = (event) => {
      let payload: WSIncoming;
      try {
        payload = JSON.parse(event.data as string) as WSIncoming;
      } catch {
        this.handlers.onError?.("Received malformed WebSocket payload.");
        return;
      }
      switch (payload.type) {
        case "chat.message":
          this.handlers.onChatMessage?.(payload);
          break;
        case "log.entry":
          this.handlers.onLog?.(payload.data);
          break;
        case "status.update":
          this.handlers.onStatus?.(payload.data);
          break;
        case "error":
          this.handlers.onError?.(payload.data.message);
          break;
        default:
          break;
      }
    };
  }

  private scheduleReconnect(chatId: string): void {
    this.clearReconnectTimers();

    const wait = Math.min(30_000, 1_000 * 2 ** this.retries);
    this.retries += 1;
    this.handlers.onReconnectScheduled?.(wait);
    this.handlers.onReconnectTick?.(wait);

    const startedAt = Date.now();
    this.reconnectTickTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, wait - elapsed);
      this.handlers.onReconnectTick?.(remaining);
      if (remaining <= 0) {
        this.clearReconnectTickTimer();
      }
    }, 250);

    this.reconnectTimer = window.setTimeout(() => {
      this.clearReconnectTickTimer();
      this.connect(chatId);
    }, wait);
  }

  private clearReconnectTickTimer(): void {
    if (this.reconnectTickTimer !== null) {
      window.clearInterval(this.reconnectTickTimer);
      this.reconnectTickTimer = null;
    }
  }

  private clearReconnectTimers(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearReconnectTickTimer();
  }

  send(message: WSOutgoing): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.closedByClient = true;
    this.clearReconnectTimers();
    this.handlers.onReconnectTick?.(0);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = null;
    this.retries = 0;
  }
}
