import { useState, type FC, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

export const MessageInput: FC<{
  onSend: (value: string) => void;
  disabled?: boolean;
  sending?: boolean;
}> = ({ onSend, disabled = false, sending = false }) => {
  const [value, setValue] = useState("");

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (disabled || !value.trim()) {
      return;
    }
    onSend(value.trim());
    setValue("");
  };

  return (
    <form className="chat-input-card" onSubmit={(event) => event.preventDefault()}>
      <Textarea
        aria-label="Message input"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        placeholder={disabled ? "Waiting for connection..." : "Type your message (Enter to send)"}
        className="chat-input"
      />
      <div className="chat-input-footer">
        <p className="chat-input-hint">Press Enter to send, Shift + Enter for newline.</p>
        <Button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={() => {
            if (disabled || !value.trim()) {
              return;
            }
            onSend(value.trim());
            setValue("");
          }}
        >
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  );
};
