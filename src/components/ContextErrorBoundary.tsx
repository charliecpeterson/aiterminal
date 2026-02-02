import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorFallbackUI } from "./ui/ErrorFallbackUI";

interface ContextErrorBoundaryProps {
  children: React.ReactNode;
  contextName: string;
  onReset?: () => void;
  fallbackContent?: React.ReactNode;
}

/**
 * Specialized error boundary for React Context Providers.
 * Prevents context initialization errors from crashing the entire app.
 * 
 * Usage:
 * ```tsx
 * <ContextErrorBoundary contextName="Settings">
 *   <SettingsProvider>
 *     {children}
 *   </SettingsProvider>
 * </ContextErrorBoundary>
 * ```
 */
export function ContextErrorBoundary({
  children,
  contextName,
  onReset,
  fallbackContent,
}: ContextErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name={`${contextName} Context`}
      onError={(error, errorInfo) => {
        // Context errors are critical - log at error level
        console.error(`Critical ${contextName} Context error:`, {
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        });
      }}
      fallback={(error, _errorInfo, reset) => {
        // If custom fallback content is provided, use it
        if (fallbackContent) {
          return <>{fallbackContent}</>;
        }

        // Otherwise show a context-specific error UI
        return (
          <ErrorFallbackUI
            error={error}
            title={`${contextName} Context Failed`}
            message={`The ${contextName} context failed to initialize. This is a critical error that prevents the application from functioning properly.`}
            subMessage="Try restarting the application. If the problem persists, your settings may be corrupted."
            detailsSummary="Technical Details"
            onReset={() => {
              reset();
              onReset?.();
            }}
            showReloadButton
            variant="fullScreen"
          />
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
