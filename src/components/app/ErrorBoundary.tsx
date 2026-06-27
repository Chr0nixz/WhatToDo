import i18n from "i18next";
import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
          <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <TriangleAlert className="size-4" />
              {i18n.t("unexpectedError")}
            </div>
            <p className="mb-3 break-words text-xs">{this.state.error.message}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded border border-destructive/40 bg-background px-3 py-1 text-xs font-medium text-destructive"
            >
              {i18n.t("reloadApp")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
