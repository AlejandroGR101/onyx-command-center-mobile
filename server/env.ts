import "dotenv/config";
import { z } from "zod";

// Schema describiendo qué variables el server espera al arrancar.
// Required → fail-fast si faltan o son inválidas.
// Optional → warn (integrations opcionales degradan; server arranca igual).
const envSchema = z.object({
  // === Required ===
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerido"),
  SESSION_SECRET: z
    .string()
    .min(
      32,
      "SESSION_SECRET debe tener >= 32 caracteres (genera con: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\")",
    ),

  // Admin seed (defaults aceptables para dev local).
  ADMIN_USERNAME: z.string().min(1).optional().default("Admin"),
  ADMIN_PASSWORD: z.string().min(1).optional().default("OnyxCCD"),

  // === Runtime ===
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
  PORT: z.string().regex(/^\d+$/, "PORT debe ser numérico").optional().default("5000"),

  // === Optional: Resend (alertas internas) ===
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM: z.string().optional(),
  ALERT_RECIPIENTS: z.string().optional(),
  ALERT_CRON: z.string().optional(),
  ALERT_TZ: z.string().optional(),

  // === Optional: Sentry error tracking ===
  SENTRY_DSN: z.string().url("SENTRY_DSN debe ser URL válida").optional(),

  // === Optional: QuickBooks Online ===
  QB_CLIENT_ID: z.string().optional(),
  QB_CLIENT_SECRET: z.string().optional(),
  QB_REDIRECT_URI: z.string().url("QB_REDIRECT_URI debe ser URL válida").optional(),
  QB_ENVIRONMENT: z.enum(["sandbox", "production"]).optional(),
  QB_SYNC_CRON: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validate(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("\n❌ Configuración de entorno inválida:\n");
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "(root)";
      console.error(`  • ${path}: ${issue.message}`);
    }
    console.error("\n→ Revisa tu archivo .env y reinicia.\n");
    process.exit(1);
  }

  const e = result.data;

  // Cross-field warnings (opcionales).
  if (!e.RESEND_API_KEY) {
    console.warn("[env] RESEND_API_KEY no configurado — email digest deshabilitado.");
  } else if (!e.ALERT_RECIPIENTS) {
    console.warn(
      "[env] RESEND_API_KEY presente pero ALERT_RECIPIENTS vacío — sin destinatarios para el digest.",
    );
  }

  if (!e.QB_CLIENT_ID || !e.QB_CLIENT_SECRET) {
    console.warn("[env] QB_CLIENT_ID/SECRET no configurados — QuickBooks sync deshabilitado.");
  } else if (!e.QB_REDIRECT_URI) {
    console.warn("[env] QB_REDIRECT_URI no configurado — OAuth flow fallará.");
  }

  if (e.NODE_ENV === "production" && e.SESSION_SECRET === "dev-insecure-secret") {
    console.error("\n❌ NODE_ENV=production con SESSION_SECRET inseguro. Genera uno aleatorio.\n");
    process.exit(1);
  }

  return e;
}

export const env = validate();
