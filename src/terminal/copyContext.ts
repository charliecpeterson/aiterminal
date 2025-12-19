import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { ContextItem, ContextType } from '../context/AIContext';

export type LineRange = [number, number];

function normalizeRange(range: LineRange): { start: number; end: number } {
  const [start, end] = range;
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  return { start: safeStart, end: safeEnd };
}

export function getRangeText(term: XTermTerminal, range: LineRange): string {
  const { start, end } = normalizeRange(range);
  term.selectLines(start, end);
  const text = term.getSelection();
  term.clearSelection();
  return text;
}

export async function copyRangeToClipboard(term: XTermTerminal, range: LineRange): Promise<void> {
  const text = getRangeText(term, range);
  try {
    await writeText(text);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to copy:', err);
  } finally {
    term.clearSelection();
  }
}

export async function copyCombinedToClipboard(
  term: XTermTerminal,
  commandRange: LineRange,
  outputRange: LineRange
): Promise<void> {
  const start = Math.min(commandRange[0], outputRange[0]);
  const end = Math.max(commandRange[1], outputRange[1]);
  await copyRangeToClipboard(term, [start, end]);
}

export function buildContextItem(params: {
  type: ContextType;
  content: string;
  timestamp?: number;
  metadata?: ContextItem['metadata'];
}): ContextItem {
  return {
    id: crypto.randomUUID(),
    type: params.type,
    content: params.content,
    timestamp: params.timestamp ?? Date.now(),
    metadata: params.metadata,
  };
}

export function addContextFromRange(params: {
  term: XTermTerminal;
  type: ContextType;
  range: LineRange;
  addContextItem: (item: ContextItem) => void;
  timestamp?: number;
}): void {
  const content = getRangeText(params.term, params.range).trim();
  if (!content) return;

  params.addContextItem(
    buildContextItem({
      type: params.type,
      content,
      timestamp: params.timestamp,
    })
  );
}

export function addContextFromCombinedRanges(params: {
  term: XTermTerminal;
  commandRange: LineRange;
  outputRange: LineRange;
  addContextItem: (item: ContextItem) => void;
  timestamp?: number;
}): void {
  const command = getRangeText(params.term, params.commandRange).trim();
  const output = getRangeText(params.term, params.outputRange).trim();
  if (!command && !output) return;

  params.addContextItem(
    buildContextItem({
      type: 'command_output',
      content: output || command,
      timestamp: params.timestamp,
      metadata: {
        command: command || undefined,
        output: output || undefined,
      },
    })
  );
}

export function addSelectionToContext(params: {
  term: XTermTerminal;
  addContextItem: (item: ContextItem) => void;
}): void {
  const text = params.term.getSelection().trim();
  if (!text) return;

  params.addContextItem(
    buildContextItem({
      type: 'selection',
      content: text,
    })
  );

  params.term.clearSelection();
}
