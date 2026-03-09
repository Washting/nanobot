export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 10_000) {
    return "just now";
  }
  if (diff < 60_000) {
    return `${Math.floor(diff / 1_000)}s ago`;
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  return new Date(timestamp).toLocaleTimeString();
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
