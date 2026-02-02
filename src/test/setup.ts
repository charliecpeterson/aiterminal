/**
 * Vitest Setup File
 * 
 * Mocks Tauri APIs and other browser/native APIs for testing.
 */

import { vi } from 'vitest';

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri event API
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  emitTo: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
  once: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock Tauri webviewWindow API
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    label: 'main',
    emit: vi.fn(),
    listen: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

// Mock import.meta.env for tests
vi.stubGlobal('import.meta.env', {
  DEV: true,
  PROD: false,
  MODE: 'test',
});
