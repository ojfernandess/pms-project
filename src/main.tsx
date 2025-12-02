import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

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
window.addEventListener("unhandledrejection", (event) => {
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
