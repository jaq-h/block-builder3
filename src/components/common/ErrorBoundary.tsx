import { Component, type ErrorInfo, type ReactNode } from "react";
import AlertTriangleIcon from "../../assets/icons/alert-triangle.svg?react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Heading shown in place of the subtree. */
  title?: string;
  /** One line telling the user what still works and what to do next. */
  message?: string;
  /**
   * Render the compact inline treatment, for a boundary around one panel rather
   * than the whole page.
   */
  compact?: boolean;
  /** Called with the error, so a host can log it wherever it logs things. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render, lifecycle and effect-setup errors from its subtree and shows a
 * recoverable fallback instead of letting one throw blank the whole page.
 *
 * "Try again" re-mounts the subtree, which is enough to recover from a transient
 * failure - a malformed payload from a third party, a chart library choking on a
 * bad candle - without the user losing the rest of the page.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // React logs the error itself in development; this is the hook a host would
    // use to forward it to real error reporting.
    this.props.onError?.(error, info);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const {
      title = "Something went wrong",
      message = "This part of the page failed to render. Trying again usually clears it.",
      compact = false,
    } = this.props;

    return (
      <div
        role="alert"
        className={
          compact
            ? "h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-bg-primary"
            : "h-full w-full flex flex-col items-center justify-center gap-3 p-8 text-center bg-bg-primary"
        }
      >
        <span className="text-status-yellow [&>svg]:stroke-current">
          <AlertTriangleIcon
            width={compact ? 20 : 28}
            height={compact ? 20 : 28}
          />
        </span>

        <h2
          className={
            compact
              ? "m-0 text-[13px] font-semibold text-text-primary"
              : "m-0 text-base font-semibold text-text-primary"
          }
        >
          {title}
        </h2>

        <p
          className={
            compact
              ? "m-0 max-w-[42ch] text-[11px] text-text-tertiary"
              : "m-0 max-w-[52ch] text-[13px] text-text-tertiary"
          }
        >
          {message}
        </p>

        <button
          type="button"
          onClick={this.handleRetry}
          className="mt-1 px-4 py-2 rounded-md border border-border-neutral bg-neutral-bg text-text-secondary text-[13px] cursor-pointer transition-colors duration-200 hover:bg-accent-bg-hover-light hover:border-accent-primary hover:text-text-primary"
        >
          Try again
        </button>

        {/* The message itself is the only detail worth putting on screen: a
            stack tells the user nothing, and the console already has it. */}
        <details className="mt-1 max-w-full text-left">
          <summary className="cursor-pointer text-[11px] text-text-muted">
            Technical details
          </summary>
          <pre className="mt-1.5 max-w-full overflow-auto rounded bg-bg-overlay p-2 text-[11px] text-text-muted whitespace-pre-wrap">
            {error.message || String(error)}
          </pre>
        </details>
      </div>
    );
  }
}

export default ErrorBoundary;
