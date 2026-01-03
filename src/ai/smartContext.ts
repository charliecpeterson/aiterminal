import { invoke } from '@tauri-apps/api/core';
import type { ContextItem } from '../context/AIContext';
import type { AiSettings } from '../context/SettingsContext';

export type SmartContextChunk = {
  chunk_id: string;
  text: string;
  source_type: string;
  source_id: string;
  timestamp: number;
  path?: string | null;
};

export type RetrievedChunk = {
  chunk_id: string;
  source_type: string;
  source_id: string;
  timestamp: number;
  path?: string | null;
  score: number;
  text: string;
};

function getTextForModel(item: ContextItem): string {
  if (item.hasSecrets && item.secretsRedacted && item.redactedContent) {
    return item.redactedContent;
  }
  return item.content;
}

function formatFullContextItem(item: ContextItem): string {
  const content = getTextForModel(item);
  if (item.type === 'command_output') {
    const command = item.metadata?.command || '';
    return `Type: command\nContent: ${command}\n\nType: output\nContent: ${content}`;
  }

  if (item.type === 'file') {
    const pathLine = item.metadata?.path ? `\nPath: ${item.metadata.path}` : '';
    const truncatedLine = item.metadata?.truncated ? '\nTruncated: true' : '';
    return `Type: file\nContent: ${content}${pathLine}${truncatedLine}`;
  }

  if (item.metadata?.command) {
    return `Type: ${item.type}\nContent: ${content}\nCommand: ${item.metadata.command}`;
  }

  return `Type: ${item.type}\nContent: ${content}`;
}

function effectiveIncludeMode(item: ContextItem, globalSmartMode: boolean): 'smart' | 'always' | 'exclude' {
  if (globalSmartMode) return 'smart';
  const mode = item.metadata?.includeMode;
  if (mode === 'always' || mode === 'exclude' || mode === 'smart') return mode;
  return 'smart';
}

function chunkLines(params: {
  text: string;
  maxLines: number;
  maxChars: number;
  overlapLines: number;
}): string[] {
  const text = params.text;
  if (text.length <= params.maxChars) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];

  let start = 0;
  while (start < lines.length) {
    let end = start;
    let charCount = 0;

    while (end < lines.length) {
      const nextLine = lines[end];
      const nextCost = nextLine.length + 1;
      if (end > start && (end - start) >= params.maxLines) break;
      if (end > start && (charCount + nextCost) > params.maxChars) break;
      charCount += nextCost;
      end += 1;
    }

    const chunk = lines.slice(start, end).join('\n').trim();
    if (chunk) chunks.push(chunk);

    if (end >= lines.length) break;
    start = Math.max(0, end - params.overlapLines);

    // Safety: avoid infinite loops if we can't advance.
    if (start === end) start = end + 1;
  }

  return chunks.length > 0 ? chunks : [text];
}

export function buildSmartChunks(contextItems: ContextItem[], globalSmartMode: boolean): SmartContextChunk[] {
  const chunks: SmartContextChunk[] = [];

  for (const item of contextItems) {
    const mode = effectiveIncludeMode(item, globalSmartMode);
    if (mode !== 'smart') continue;

    const text = getTextForModel(item);
    const path = item.metadata?.path ?? null;

    // Very simple, source-agnostic chunking with conservative overlap.
    const parts = chunkLines({
      text,
      maxLines: item.type === 'file' ? 140 : 220,
      maxChars: item.type === 'file' ? 9000 : 12000,
      overlapLines: 12,
    });

    for (let i = 0; i < parts.length; i += 1) {
      chunks.push({
        chunk_id: `${item.id}:${i}`,
        text: parts[i],
        source_type: item.type,
        source_id: item.id,
        timestamp: item.timestamp,
        path,
      });
    }
  }

  return chunks;
}

export function buildAlwaysIncludedContext(contextItems: ContextItem[], globalSmartMode: boolean): string[] {
  const out: string[] = [];
  for (const item of contextItems) {
    const mode = effectiveIncludeMode(item, globalSmartMode);
    if (mode === 'always') {
      out.push(formatFullContextItem(item));
    }
  }
  return out;
}

export async function getSmartContextForPrompt(params: {
  ai: AiSettings;
  contextItems: ContextItem[];
  query: string;
  topK?: number;
  globalSmartMode?: boolean;
}): Promise<{ retrieved: RetrievedChunk[]; formatted: string[] }> {
  const { ai, contextItems, query } = params;
  const topK = params.topK ?? 8;
  const globalSmartMode = params.globalSmartMode !== false; // default true

  const embeddingModel = ai.embedding_model?.trim() || '';
  if (!embeddingModel) {
    return { retrieved: [], formatted: [] };
  }

  const chunks = buildSmartChunks(contextItems, globalSmartMode);
  const alwaysIncluded = buildAlwaysIncludedContext(contextItems, globalSmartMode);

  // Sync index (upsert + remove) then query.
  await invoke('context_index_sync', {
    provider: ai.provider,
    apiKey: ai.api_key,
    url: ai.url || null,
    embeddingModel,
    chunks,
  });

  const retrieved = await invoke<RetrievedChunk[]>('context_index_query', {
    provider: ai.provider,
    apiKey: ai.api_key,
    url: ai.url || null,
    embeddingModel,
    query,
    topK,
  });

  const formatted = retrieved.map((r) => {
    const headerParts = [`Type: ${r.source_type}`];
    if (r.path) headerParts.push(`Path: ${r.path}`);
    // Keep score out of the prompt by default; it can bias the model.
    return `${headerParts.join('\n')}\nContent: ${r.text}`;
  });

  return { retrieved, formatted: [...alwaysIncluded, ...formatted] };
}
