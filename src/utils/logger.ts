/**
 * Centralized logging utility for AIterminal
 * 
 * Usage:
 *   import { createLogger } from '@/utils/logger';
 *   const log = createLogger('ComponentName');
 *   log.debug('Details', { data });
 *   log.info('Something happened');
 *   log.warn('Warning message', error);
 *   log.error('Error occurred', error);
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

interface LoggerConfig {
  level: LogLevel;
  enableTimestamps: boolean;
  enableColors: boolean;
}

// Default configuration
let config: LoggerConfig = {
  level: import.meta.env.DEV ? 'debug' : 'info',
  enableTimestamps: true,
  enableColors: true,
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 999,
};

// ANSI color codes for better readability in console
const COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

/**
 * Configure the global logger settings
 */
export function configureLogger(options: Partial<LoggerConfig>): void {
  config = { ...config, ...options };
}

/**
 * Get current logger configuration
 */
export function getLoggerConfig(): Readonly<LoggerConfig> {
  return { ...config };
}

interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

/**
 * Create a logger instance for a specific module/component
 */
export function createLogger(context: string): Logger {
  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
  };

  const formatMessage = (level: LogLevel, message: string): string => {
    const parts: string[] = [];

    // Timestamp
    if (config.enableTimestamps) {
      const now = new Date();
      const timestamp = now.toISOString().split('T')[1].slice(0, -1); // HH:MM:SS.mmm
      if (config.enableColors) {
        parts.push(`${COLORS.gray}${timestamp}${COLORS.reset}`);
      } else {
        parts.push(timestamp);
      }
    }

    // Log level
    if (config.enableColors && level !== 'none') {
      const color = COLORS[level];
      const levelStr = level.toUpperCase().padEnd(5);
      parts.push(`${color}${COLORS.bold}${levelStr}${COLORS.reset}`);
    } else {
      parts.push(`[${level.toUpperCase()}]`);
    }

    // Context
    if (config.enableColors) {
      parts.push(`${COLORS.gray}[${context}]${COLORS.reset}`);
    } else {
      parts.push(`[${context}]`);
    }

    // Message
    parts.push(message);

    return parts.join(' ');
  };

  const log = (level: LogLevel, message: string, ...args: unknown[]): void => {
    if (!shouldLog(level)) return;

    const formattedMessage = formatMessage(level, message);

    // Use appropriate console method
    switch (level) {
      case 'debug':
        console.debug(formattedMessage, ...args);
        break;
      case 'info':
        console.info(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'error':
        console.error(formattedMessage, ...args);
        break;
    }
  };

  return {
    debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
    info: (message: string, ...args: unknown[]) => log('info', message, ...args),
    warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
    error: (message: string, ...args: unknown[]) => log('error', message, ...args),
  };
}
