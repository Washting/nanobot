import { useEffect } from "react";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const toneClass = {
  info: "toast toast-info",
  success: "toast toast-success",
  warning: "toast toast-warning",
  error: "toast toast-error",
} as const;

export function ToastViewport() {
  const toasts = useAppStore((state) => state.ui.toasts);
  const dismissToast = useAppStore((state) => state.actions.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), toast.tone === "error" ? 5000 : 3200),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissToast, toasts]);

  return (
    <aside className="toast-viewport" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <article key={toast.id} className={cn(toneClass[toast.tone])}>
          <div>
            <p className="toast-title">{toast.title}</p>
            {toast.message ? <p className="toast-message">{toast.message}</p> : null}
          </div>
          <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            ×
          </button>
        </article>
      ))}
    </aside>
  );
}
