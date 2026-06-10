// Logger estructurado (pino). JSON en producción, pretty-print en dev.
// Niveles: trace < debug < info < warn < error < fatal.
//
// Uso:
//   logger.info("mensaje simple")
//   logger.info({ jobId: 123, duration: 45 }, "job completado")
//   logger.error({ err }, "fallo al hacer X")
//
// LOG_LEVEL env override (default: debug en dev, info en prod).

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  }),
});
