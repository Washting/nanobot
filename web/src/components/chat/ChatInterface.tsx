import { useEffect, useMemo, useRef, useState } from "react";

import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList } from "@/components/chat/MessageList";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { ActionBar } from "@/components/primitives/ActionBar";
import { Button } from "@/components/ui/Button";
import { api, WSClient } from "@/lib/api";
import { useAppStore } from "@/lib/store";

const CHAT_ID = "default";

function isNearBottom(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

export function ChatInterface() {
  const messages = useAppStore((state) => state.chat.messages);
  const phase = useAppStore((state) => state.connection.phase);
  const reconnectInMs = useAppStore((state) => state.connection.reconnectInMs);
  const lastError = useAppStore((state) => state.connection.lastError);
  const addIncomingMessage = useAppStore((state) => state.actions.addIncomingMessage);
  const addOutgoingMessage = useAppStore((state) => state.actions.addOutgoingMessage);
  const markMessageStatus = useAppStore((state) => state.actions.markMessageStatus);
  const setConnectionPhase = useAppStore((state) => state.actions.setConnectionPhase);
  const setReconnectInMs = useAppStore((state) => state.actions.setReconnectInMs);
  const setStatus = useAppStore((state) => state.actions.setStatus);
  const appendLog = useAppStore((state) => state.actions.appendLog);
  const addToast = useAppStore((state) => state.actions.addToast);
  const resetChat = useAppStore((state) => state.actions.resetChat);

  const [sending, setSending] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WSClient | null>(null);

  const disabled = useMemo(
    () => phase === "connecting" || phase === "reconnecting",
    [phase],
  );

  useEffect(() => {
    const ws = new WSClient({
      onConnecting: () => setConnectionPhase("connecting"),
      onOpen: () => {
        setConnectionPhase("connected");
        setReconnectInMs(null);
        addToast("Realtime connected", "WebSocket channel is online.", "success");
      },
      onClose: () => {
        setConnectionPhase("reconnecting");
      },
      onReconnectScheduled: (ms) => {
        setConnectionPhase("reconnecting");
        setReconnectInMs(ms);
      },
      onReconnectTick: (ms) => {
        setReconnectInMs(ms);
      },
      onChatMessage: (payload) => {
        addIncomingMessage(payload.data.chat_id, payload.data.content, payload.data.metadata);
      },
      onLog: appendLog,
      onStatus: setStatus,
      onError: (message) => {
        setConnectionPhase("error", message);
        appendLog({
          timestamp: new Date().toISOString(),
          level: "ERROR",
          logger: "web-ui",
          message,
        });
        addToast("Connection issue", message, "error");
      },
    });

    ws.connect(CHAT_ID);
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [
    addIncomingMessage,
    addToast,
    appendLog,
    setConnectionPhase,
    setReconnectInMs,
    setStatus,
  ]);

  useEffect(() => {
    if (!autoFollow) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [autoFollow, messages]);

  const sendMessage = (content: string) => {
    setSending(true);
    const id = addOutgoingMessage(CHAT_ID, content);

    const sent = wsRef.current?.send({
      type: "chat.send",
      data: {
        chat_id: CHAT_ID,
        content,
      },
    });

    if (!sent) {
      markMessageStatus(id, "failed", "Socket offline");
      addToast("Failed to send", "Socket not ready. Retry after reconnect.", "warning");
      setSending(false);
      return;
    }

    markMessageStatus(id, "sent", null);
    setSending(false);
  };

  return (
    <section className="chat-layout">
      <ActionBar>
        <TypingIndicator phase={phase} reconnectInMs={reconnectInMs} error={lastError} />
        <div className="chat-toolbar-buttons">
          <Button variant="ghost" size="sm" onClick={() => setAutoFollow((v) => !v)}>
            {autoFollow ? "Auto-follow: on" : "Auto-follow: off"}
          </Button>
          <Button variant="secondary" size="sm" onClick={resetChat}>
            Clear local view
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void api.health()
                .then(() => addToast("API healthy", "Backend health endpoint responded.", "info"))
                .catch((error) => addToast("API unreachable", String(error), "error"));
            }}
          >
            Ping API
          </Button>
        </div>
      </ActionBar>

      <MessageList
        items={messages}
        viewportRef={viewportRef}
        onScroll={() => {
          const viewport = viewportRef.current;
          if (!viewport) {
            return;
          }
          setAutoFollow(isNearBottom(viewport));
        }}
        onRetry={(id, content) => {
          markMessageStatus(id, "pending", null);
          const sent = wsRef.current?.send({
            type: "chat.send",
            data: {
              chat_id: CHAT_ID,
              content,
            },
          });
          if (!sent) {
            markMessageStatus(id, "failed", "Socket offline");
            return;
          }
          markMessageStatus(id, "sent", null);
        }}
      />

      <MessageInput onSend={sendMessage} disabled={disabled} sending={sending} />
    </section>
  );
}
