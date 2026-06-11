import "dotenv/config";
import "./env"; // valida process.env al boot (fail-fast); debe ir antes de cualquier módulo que lo lea
import { Sentry, sentryEnabled } from "./sentry"; // instrumentation global — debe cargar antes que express
import { logger } from "./logger";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { registerNotificationSchedule } from "./notifications";
import { registerQuickbooksSchedule } from "./quickbooks/sync";

// Process-level safety net: una promesa rechazada sin catch o una excepción
// no manejada hoy mata el proceso silenciosamente. Loggear + reportar a Sentry
// antes de salir. Exit con código !=0 para que el supervisor (pm2/systemd)
// reinicie.
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  if (sentryEnabled) {
    try {
      Sentry.captureException(err);
    } catch {
      /* noop */
    }
  }
  // Da tiempo a que el log fluyera antes de morir.
  setTimeout(() => process.exit(1), 500);
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
  if (sentryEnabled) {
    try {
      Sentry.captureException(reason);
    } catch {
      /* noop */
    }
  }
});

const app = express();
const httpServer = createServer(app);

// Confiar en el primer proxy (Supabase/Nginx/Railway) para que las cookies
// `secure` funcionen detrás de TLS terminado en el proxy.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
    id?: string;
  }
}

// Security headers (CSP, X-Frame-Options, etc.). contentSecurityPolicy: false
// porque Vite dev injecta scripts inline + el cliente carga chunks Sentry desde
// CDN; añadir CSP estricta requeriría build-time directives. Mantener headers
// críticos (X-Content-Type-Options, X-DNS-Prefetch-Control, Strict-Transport-
// Security, X-Frame-Options, X-Permitted-Cross-Domain-Policies, etc.).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// gzip responses > 1KB. Endpoints como /api/jobs (12 jobs) o /api/financials/
// line-items (line items por mes) pueden bajar ~70% en wire.
app.use(compression());

// Request ID middleware. Genera UUID por request, lo expone via X-Request-Id,
// y lo attacha a req.id para que los logs lo usen como child binding (log
// correlation entre múltiples líneas + Sentry events).
app.use((req, res, next) => {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

setupAuth(app);
registerNotificationSchedule();
registerQuickbooksSchedule();

// Helper retained for compatibility (vite.ts/static.ts importan `log`).
// Delega a pino con `source` como child binding.
export function log(message: string, source = "express") {
  logger.child({ source }).info(message);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const reqId = (req as any).id as string | undefined;
      logger.child({ source: "express", reqId }).info(
        {
          method: req.method,
          path,
          status: res.statusCode,
          durationMs: duration,
          ...(capturedJsonResponse ? { response: capturedJsonResponse } : {}),
        },
        `${req.method} ${path} ${res.statusCode} in ${duration}ms`,
      );
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Sentry Express error handler — DEBE ir antes de cualquier otro error handler.
  // Captura las excepciones lanzadas por handlers / async routes y las reporta.
  if (sentryEnabled) {
    Sentry.setupExpressErrorHandler(app);
    logger.info("[sentry] backend tracking habilitado");
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error({ err }, "Internal Server Error");

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "127.0.0.1", () => {
    log(`serving on port ${port}`);
  });
})();
