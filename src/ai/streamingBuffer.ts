/**
 * Streaming Buffer
 * 
 * Buffers text chunks from streaming responses to reduce UI re-renders.
 * Instead of updating the UI on every tiny chunk, we batch them together.
 */

import { createLogger } from '../utils/logger';

const log = createLogger('StreamingBuffer');

// Configuration
const CONFIG = {
  FLUSH_INTERVAL_MS: 50, // Flush buffer every 50ms
  MAX_BUFFER_SIZE: 500, // Flush if buffer exceeds 500 chars
  IDLE_FLUSH_MS: 150, // If no new data for 150ms, flush immediately
};

export class StreamingBuffer {
  private buffer: string = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onFlush: (text: string) => void;
  private isFlushing: boolean = false;
  private totalChunks: number = 0;
  private totalFlushes: number = 0;

  constructor(onFlush: (text: string) => void) {
    this.onFlush = onFlush;
  }

  /**
   * Add text chunk to buffer
   */
  append(text: string): void {
    if (!text) return;

    this.totalChunks++;
    this.buffer += text;

    // Cancel existing timers
    this.clearTimers();

    // Flush immediately if buffer is too large
    if (this.buffer.length >= CONFIG.MAX_BUFFER_SIZE) {
      this.flush();
      return;
    }

    // Set up regular flush interval
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, CONFIG.FLUSH_INTERVAL_MS);

    // Set up idle flush (in case streaming pauses)
    this.idleTimer = setTimeout(() => {
      this.flush();
    }, CONFIG.IDLE_FLUSH_MS);
  }

  /**
   * Flush buffer to UI
   */
  flush(): void {
    if (this.isFlushing || this.buffer.length === 0) return;

    this.isFlushing = true;
    this.clearTimers();

    const textToFlush = this.buffer;
    this.buffer = '';
    this.totalFlushes++;

    try {
      this.onFlush(textToFlush);
    } catch (error) {
      log.error('Error during flush', error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Force flush and clean up
   */
  finalize(): void {
    this.flush();
    this.clearTimers();
    
    if (this.totalChunks > 0) {
      const compressionRatio = this.totalFlushes / this.totalChunks;
      log.debug('Streaming buffer stats', {
        totalChunks: this.totalChunks,
        totalFlushes: this.totalFlushes,
        compressionRatio: compressionRatio.toFixed(2),
        renderReduction: `${Math.round((1 - compressionRatio) * 100)}%`,
      });
    }
  }

  /**
   * Get current buffer size (for debugging)
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get statistics
   */
  getStats(): { chunks: number; flushes: number; reduction: number } {
    const reduction = this.totalChunks > 0 
      ? Math.round((1 - this.totalFlushes / this.totalChunks) * 100)
      : 0;
    
    return {
      chunks: this.totalChunks,
      flushes: this.totalFlushes,
      reduction,
    };
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Reset buffer state
   */
  reset(): void {
    this.buffer = '';
    this.clearTimers();
    this.totalChunks = 0;
    this.totalFlushes = 0;
  }
}

/**
 * Create a streaming buffer with automatic cleanup
 */
export function createStreamingBuffer(
  onFlush: (text: string) => void
): StreamingBuffer {
  return new StreamingBuffer(onFlush);
}
