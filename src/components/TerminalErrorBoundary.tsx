import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorFallbackUI } from "./ui/ErrorFallbackUI";

interface TerminalErrorBoundaryProps {
  children: React.ReactNode;
  terminalId: number;
  onReset?: () => void;
}

/**
 * Specialized error boundary for Terminal components.
 * Provides terminal-specific error recovery options.
 */
export function TerminalErrorBoundary({
  children,
  terminalId,
  onReset,
}: TerminalErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name={`Terminal (ID: ${terminalId})`}
      isolate
      fallback={(error, _errorInfo, reset) => (
        <ErrorFallbackUI
          error={error}
          title="Terminal Error"
          message="The terminal encountered an error and needs to be restarted."
          detailsSummary="Technical Details"
          onReset={() => {
            reset();
            onReset?.();
          }}
          resetLabel="Restart Terminal"
          variant="panel"
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
