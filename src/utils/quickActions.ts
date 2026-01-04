import { normalizeQuotes } from "./text";

export function parseQuickActionCommands(input: string): string[] {
  return input
    .split("\n")
    .map((cmd) => normalizeQuotes(cmd.trim()))
    .filter((cmd) => cmd.length > 0);
}
