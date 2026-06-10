// Sentry init para el backend. No-op si SENTRY_DSN está vacío.
// IMPORTANTE: este módulo debe importarse PRIMERO en server/index.ts (antes
// que express y otros). Sentry instala instrumentation global que requiere
// arrancar antes que las libs que instrumenta.

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    // 10% de las requests reportan traces (perf monitoring). Subir si se quiere
    // más detalle; bajar a 0 para deshabilitar traces.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Captura console.error/warn como breadcrumbs.
    integrations: [],
  });
}

export { Sentry };
export const sentryEnabled = !!dsn;
