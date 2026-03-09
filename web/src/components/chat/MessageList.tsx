import type { FC, RefObject } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { ChatMessage } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const kindTone: Record<ChatMessage["ui_kind"], "neutral" | "info" | "success" | "warning" | "danger"> = {
  final: "neutral",
  progress: "info",
  tool_hint: "warning",
  system: "danger",
};

export const MessageList: FC<{
  items: ChatMessage[];
  viewportRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  onRetry: (id: string, content: string) => void;
}> = ({ items, viewportRef, onScroll, onRetry }) => {
  return (
    <div className="chat-stream card">
      <div className="chat-stream-header">
        <p>Conversation</p>
        <p>{items.length} messages</p>
      </div>
      <div className="chat-stream-body" onScroll={onScroll} ref={viewportRef}>
        {items.length === 0 ? (
          <EmptyState
            title="Conversation is empty"
            description="Send your first message to start a live conversation."
          />
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className={cn(
                "chat-message",
                item.role === "user" ? "chat-message-user" : "chat-message-assistant",
                item.ui_kind !== "final" && "chat-message-soft",
              )}
            >
              <header className="chat-message-meta">
                <div>
                  <strong>{item.role === "user" ? "You" : "Nanobot"}</strong>
                  <span>{item.chatId}</span>
                </div>
                <div>
                  <Badge tone={kindTone[item.ui_kind]}>{item.ui_kind.replace("_", " ")}</Badge>
                  <span>{formatRelativeTime(item.createdAt)}</span>
                </div>
              </header>
              {item.content.length > 400 ? (
                <details className="chat-message-details">
                  <summary>Show long content</summary>
                  <pre>{item.content}</pre>
                </details>
              ) : (
                <p className="chat-message-content">{item.content}</p>
              )}
              <footer className="chat-message-footer">
                {item.ui_status === "pending" ? <span className="msg-pending">Sending...</span> : null}
                {item.ui_status === "failed" ? (
                  <div className="msg-failed-wrap">
                    <span className="msg-failed">{item.error || "Send failed"}</span>
                    <Button size="sm" variant="secondary" onClick={() => onRetry(item.id, item.content)}>
                      Retry
                    </Button>
                  </div>
                ) : null}
              </footer>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
