import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { initializeConsoleOverride } from "./lib/logger";
import { stripStaticFaviconLinksOnMotorBoot } from "./utils/bootstrapMotorFavicon";

// Motor de reservas: remover links de ícone estáticos antes do React (evita fetch do placeholder legado)
stripStaticFaviconLinksOnMotorBoot();

// Inicializar override do console ANTES de qualquer outro código
initializeConsoleOverride();

// Suprimir erros comuns de extensões do navegador que não afetam a aplicação
window.addEventListener("error", (event) => {
  // Suprimir erro de extensões do navegador relacionado a message channels
  if (
    event.message?.includes("message channel closed") ||
    event.message?.includes("asynchronous response") ||
    event.message?.includes("listener indicated")
  ) {
    event.preventDefault();
    return false;
  }
});

// Suprimir erros não capturados de Promise relacionados a extensões
window.addEventListener("unhandledrejection", async (event) => {
  const errorMessage = event.reason?.message || event.reason?.toString() || "";
  
  // Suprimir erro de extensões do navegador relacionado a message channels
  if (
    errorMessage.includes("message channel closed") ||
    errorMessage.includes("asynchronous response") ||
    errorMessage.includes("listener indicated")
  ) {
    event.preventDefault();
    return false;
  }

  // Logar erros não capturados
  try {
    const { logError } = await import("@/lib/errorLogger");
    await logError({
      error: event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      context: "unhandledRejection",
      severity: "high",
      metadata: {
        promise_rejection: true,
      },
    });
  } catch (logError) {
    console.warn("Erro ao fazer log de unhandled rejection:", logError);
  }
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
