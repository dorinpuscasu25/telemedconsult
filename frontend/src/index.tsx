import "./index.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Elementul #root nu există în document.");
}

// Erorile asincrone nu ajung la ErrorBoundary, deci le logăm explicit ca să nu
// dispară în silence când o cerere de rețea eșuează.
window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandledrejection]", event.reason);
});

// React înlocuiește conținutul containerului, deci ecranul de pornire din
// index.html dispare automat aici. Îl marcăm explicit ca montat, ca plasa de
// siguranță din index.html să nu mai afișeze mesajul de eroare.
container.dataset.mounted = 'true';

createRoot(container).render(
  <ErrorBoundary label="root">
    <App />
  </ErrorBoundary>
);
