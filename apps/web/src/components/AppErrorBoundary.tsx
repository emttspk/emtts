import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
  retryCount: number;
};

function isChunkOrAssetError(message: string) {
  return /Loading chunk|Failed to fetch dynamically imported module|importing a module script failed|vite:preloadError/i.test(message);
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      message: error?.message || "Unexpected application error",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[APP] runtime boundary", { message: error?.message, stack: error?.stack, componentStack: info?.componentStack });
  }

  private retryRender = () => {
    this.setState((current) => ({
      hasError: false,
      message: "",
      retryCount: current.retryCount + 1,
    }));
  };

  private hardReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const chunkFailure = isChunkOrAssetError(this.state.message);
      return (
        <div className="flex min-h-[100svh] items-center justify-center bg-[linear-gradient(180deg,#f4f9ff_0%,#eef6ff_55%,#f2fbf8_100%)] p-4">
          <div className="w-full max-w-xl rounded-[28px] border border-[#dce8f5] bg-white p-6 shadow-[0_28px_60px_rgba(10,31,68,0.12)] md:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0b7f6d]">App Recovery</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-[#0f1f3a]">We hit a loading problem</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {chunkFailure
                ? "A new deployment was detected while your browser held older files. Retry first, then refresh if needed."
                : "The app failed to render this view. Retry to recover without losing context."}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={this.retryRender} className="btn-primary">
                Retry App
              </button>
              <button type="button" onClick={this.hardReload} className="btn-secondary">
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <div key={this.state.retryCount}>{this.props.children}</div>;
  }
}
