import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorFallbackUI } from "./ui/ErrorFallbackUI";

interface AIPanelErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

/**
 * Specialized error boundary for AIPanel component.
 * Provides AI-specific error recovery options.
 */
export function AIPanelErrorBoundary({
  children,
  onReset,
}: AIPanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name="AI Panel"
      fallback={(error, _errorInfo, reset) => (
        <ErrorFallbackUI
          error={error}
          title="AI Panel Error"
          message="The AI panel encountered an error. Your conversation history may be preserved."
          onReset={() => {
            reset();
            onReset?.();
          }}
          resetLabel="Reload AI Panel"
          variant="panel"
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
