import { emitTo } from '@tauri-apps/api/event';

export async function requestCaptureLast(count: number): Promise<void> {
  const safeCount = Math.max(1, Math.min(50, count));
  await emitTo('main', 'ai-context:capture-last', { count: safeCount });
}

export async function requestCaptureFile(params: {
  path: string;
  fileLimitKb: number;
}): Promise<void> {
  const trimmedPath = params.path.trim();
  if (!trimmedPath) return;

  const kb = Number.isFinite(params.fileLimitKb)
    ? Math.max(1, Math.min(2048, params.fileLimitKb))
    : 200;

  await emitTo('main', 'ai-context:capture-file', {
    path: trimmedPath,
    maxBytes: kb * 1024,
  });
}
