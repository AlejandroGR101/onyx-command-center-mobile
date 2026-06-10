import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Sentry frontend init — no-op si VITE_SENTRY_DSN está vacío.
// Debe ir lo antes posible para capturar errores tempranos.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

if (!window.location.hash) {
  window.location.hash = "#/";
}

// ErrorBoundary captura render/effect errors y los reporta a Sentry.
// Fallback simple — usuario ve mensaje en vez de pantalla blanca.
const root = createRoot(document.getElementById("root")!);
root.render(
  <Sentry.ErrorBoundary
    fallback={({ resetError }) => (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white/70 gap-4 p-6">
        <h1 className="text-lg uppercase tracking-widest">Algo falló</h1>
        <p className="text-xs text-white/40">Reporta a soporte si persiste.</p>
        <button
          onClick={resetError}
          className="rounded-lg px-4 py-2 text-xs border border-white/[0.1] bg-white/[0.06] hover:bg-white/[0.1]"
        >
          Reintentar
        </button>
      </div>
    )}
  >
    <App />
  </Sentry.ErrorBoundary>,
);
