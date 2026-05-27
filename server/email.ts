import "dotenv/config";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.ALERT_FROM || "onboarding@resend.dev";
const resend = apiKey ? new Resend(apiKey) : null;

export function getRecipients(): string[] {
  return (process.env.ALERT_RECIPIENTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Email está configurado si hay API key y al menos un destinatario.
export function isEmailConfigured(): boolean {
  return !!apiKey && getRecipients().length > 0;
}

export interface SendEmailArgs {
  to: string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  skipped: boolean;
  id?: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<SendEmailResult> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY no configurada — envío omitido");
    return { skipped: true };
  }
  if (to.length === 0) {
    console.warn("[email] sin destinatarios (ALERT_RECIPIENTS) — envío omitido");
    return { skipped: true };
  }
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
  }
  return { skipped: false, id: data?.id };
}
