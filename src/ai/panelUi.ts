import type { KeyboardEvent } from "react";

export function formatChatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function roleLabel(role: "user" | "assistant" | "system"): string {
  if (role === "user") return "You";
  if (role === "system") return "System";
  return "Assistant";
}

export function formatContextCountLabel(count: number): string {
  if (count === 0) return "No context";
  if (count === 1) return "1 item attached";
  return `${count} items attached`;
}

export function handlePromptKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  onSend: () => void,
): void {
  // Enter sends the message, Shift+Enter creates a new line
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    onSend();
  }
}
