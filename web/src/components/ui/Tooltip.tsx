import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Tooltip({
  className,
  title,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { title: string }) {
  return <span className={cn("tooltip", className)} aria-label={title} data-tip={title} {...props} />;
}
