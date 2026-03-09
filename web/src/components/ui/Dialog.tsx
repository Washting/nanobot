import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="dialog-title">{title}</h3>
        <p className="dialog-description">{description}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelText}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="dialog-body">{children}</div>;
}
