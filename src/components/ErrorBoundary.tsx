import { Component, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary capturou um erro:", error, errorInfo);
    
    // Logar erro estruturado
    import("@/lib/errorLogger").then(({ logError }) => {
      logError({
        error,
        context: "ErrorBoundary",
        severity: "critical",
        metadata: {
          componentStack: errorInfo.componentStack,
          errorBoundary: true,
        },
        stack: error.stack,
      });
    }).catch((logError) => {
      console.warn("Erro ao fazer log:", logError);
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <h1 className="text-2xl font-bold">Algo deu errado</h1>
            </div>
            <p className="text-muted-foreground mb-4">
              Ocorreu um erro inesperado. Por favor, tente recarregar a página.
            </p>
            {this.state.error && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-muted-foreground mb-2">
                  Detalhes do erro
                </summary>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="flex gap-2">
              <Button onClick={this.handleReset} className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                Recarregar Página
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = "/login"}
                className="flex-1"
              >
                Ir para Login
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

