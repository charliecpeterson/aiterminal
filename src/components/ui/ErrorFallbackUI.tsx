/**
 * Shared Error Fallback UI Components
 * 
 * Consolidates duplicate error UI code from:
 * - ErrorBoundary.tsx
 * - ContextErrorBoundary.tsx  
 * - AIPanelErrorBoundary.tsx
 * - TerminalErrorBoundary.tsx
 */

// Shared styles as objects for reuse
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  fullScreen: {
    height: '100vh',
    width: '100vw',
    position: 'fixed' as const,
    top: 0,
    left: 0,
    zIndex: 9999,
    padding: '40px',
  },
  panel: {
    height: '100%',
  },
  content: {
    maxWidth: '500px',
    textAlign: 'center' as const,
  },
  wideContent: {
    maxWidth: '600px',
    textAlign: 'center' as const,
  },
  title: {
    margin: '0 0 10px 0',
    color: '#ff6b6b',
    fontSize: '20px',
  },
  titleLarge: {
    margin: '0 0 15px 0',
    color: '#ff6b6b',
    fontSize: '24px',
  },
  message: {
    margin: '0 0 20px 0',
    color: '#888',
    fontSize: '14px',
  },
  messageLarge: {
    margin: '0 0 10px 0',
    fontSize: '16px',
    color: '#ccc',
    lineHeight: '1.6',
  },
  subMessage: {
    margin: '0 0 30px 0',
    fontSize: '14px',
    color: '#888',
  },
  details: {
    marginBottom: '20px',
    textAlign: 'left' as const,
  },
  detailsFullScreen: {
    marginBottom: '30px',
    textAlign: 'left' as const,
    backgroundColor: '#0a0a0a',
    padding: '15px',
    borderRadius: '4px',
  },
  summary: {
    cursor: 'pointer',
    fontSize: '14px',
    color: '#888',
    userSelect: 'none' as const,
  },
  errorStack: {
    marginTop: '10px',
    padding: '10px',
    backgroundColor: '#0a0a0a',
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto' as const,
    maxHeight: '150px',
    color: '#ff6b6b',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '10px 20px',
    backgroundColor: '#007acc',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold' as const,
  },
  secondaryButton: {
    padding: '10px 20px',
    backgroundColor: '#444',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold' as const,
  },
};

interface ErrorButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

/**
 * Styled button for error fallback UIs with hover effects.
 */
export function ErrorButton({ label, onClick, variant = 'primary' }: ErrorButtonProps) {
  const baseStyle = variant === 'primary' ? styles.primaryButton : styles.secondaryButton;
  const hoverBg = variant === 'primary' ? '#005a9e' : '#555';
  const normalBg = variant === 'primary' ? '#007acc' : '#444';

  return (
    <button
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = normalBg;
      }}
    >
      {label}
    </button>
  );
}

interface ErrorDetailsProps {
  error: Error;
  summaryText?: string;
  fullScreen?: boolean;
}

/**
 * Expandable error details section with stack trace.
 */
export function ErrorDetails({ error, summaryText = 'Error Details', fullScreen = false }: ErrorDetailsProps) {
  return (
    <details style={fullScreen ? styles.detailsFullScreen : styles.details}>
      <summary style={styles.summary}>{summaryText}</summary>
      <pre style={styles.errorStack}>
        {error.name}: {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
    </details>
  );
}

export interface ErrorFallbackUIProps {
  /** The error that was caught */
  error: Error;
  /** Title shown at the top of the error UI */
  title: string;
  /** Main message explaining what went wrong */
  message: string;
  /** Secondary message with recovery suggestions (optional) */
  subMessage?: string;
  /** Text for the error details summary */
  detailsSummary?: string;
  /** Function to reset the error boundary */
  onReset?: () => void;
  /** Label for the reset button */
  resetLabel?: string;
  /** Function to reload the page */
  onReload?: () => void;
  /** Whether to show reload button */
  showReloadButton?: boolean;
  /** Layout variant */
  variant?: 'panel' | 'fullScreen' | 'inline';
}

/**
 * Shared error fallback UI component.
 * 
 * @example
 * // Panel-style (for components like AI Panel, Terminal)
 * <ErrorFallbackUI
 *   error={error}
 *   title="AI Panel Error"
 *   message="The AI panel encountered an error."
 *   onReset={reset}
 *   resetLabel="Reload AI Panel"
 *   variant="panel"
 * />
 * 
 * @example
 * // Full-screen (for critical context errors)
 * <ErrorFallbackUI
 *   error={error}
 *   title="Settings Context Failed"
 *   message="The settings context failed to initialize."
 *   subMessage="Try restarting the application."
 *   onReset={reset}
 *   showReloadButton
 *   variant="fullScreen"
 * />
 */
export function ErrorFallbackUI({
  error,
  title,
  message,
  subMessage,
  detailsSummary = 'Error Details',
  onReset,
  resetLabel = 'Try Again',
  onReload,
  showReloadButton = false,
  variant = 'panel',
}: ErrorFallbackUIProps) {
  const isFullScreen = variant === 'fullScreen';
  const isInline = variant === 'inline';

  const containerStyle = {
    ...styles.container,
    ...(isFullScreen ? styles.fullScreen : styles.panel),
    ...(isInline ? { padding: '20px', margin: '10px', border: '1px solid #ff6b6b', borderRadius: '4px' } : {}),
  };

  const contentStyle = isFullScreen ? styles.wideContent : styles.content;
  const titleStyle = isFullScreen ? styles.titleLarge : styles.title;
  const messageStyle = isFullScreen ? styles.messageLarge : styles.message;

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <h2 style={titleStyle}>{title}</h2>
        <p style={messageStyle}>{message}</p>
        {subMessage && <p style={styles.subMessage}>{subMessage}</p>}
        
        <ErrorDetails 
          error={error} 
          summaryText={detailsSummary} 
          fullScreen={isFullScreen}
        />
        
        <div style={styles.buttonRow}>
          {onReset && (
            <ErrorButton label={resetLabel} onClick={onReset} variant="primary" />
          )}
          {showReloadButton && (
            <ErrorButton
              label="Reload App"
              onClick={onReload || (() => window.location.reload())}
              variant="secondary"
            />
          )}
        </div>
      </div>
    </div>
  );
}
