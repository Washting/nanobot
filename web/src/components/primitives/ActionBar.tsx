import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ActionBar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("action-bar", className)}>{children}</div>;
}
