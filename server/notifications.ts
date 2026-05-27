import cron from "node-cron";
import { storage } from "./storage";
import { sendEmail, getRecipients, isEmailConfigured } from "./email";
import type { Lead, MaintenanceTask } from "@shared/schema";

// Días hasta una fecha (mismo cálculo que client/src/pages/leads.tsx).
// Negativo o 0 = vencido o vence hoy.
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// Leads con follow-up vencido: nextFollowUp <= hoy y status no en {won, lost}.
export async function getOverdueFollowUps(): Promise<Lead[]> {
  const leads = await storage.getLeads();
  return leads
    .filter((l) => {
      const d = daysUntil(l.nextFollowUp);
      return d != null && d <= 0 && !["won", "lost"].includes(l.status);
    })
    .sort((a, b) => (a.nextFollowUp || "").localeCompare(b.nextFollowUp || ""));
}

export async function getOverdueMaintenance(): Promise<MaintenanceTask[]> {
  const tasks = await storage.getMaintenanceTasks();
  return tasks.filter((t) => t.status === "overdue");
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildDigestHtml(leads: Lead[], tasks: MaintenanceTask[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const sections: string[] = [];

  if (leads.length > 0) {
    const rows = leads
      .map((l) => {
        const d = daysUntil(l.nextFollowUp);
        const overdueBy = d == null ? "" : `${Math.abs(d)}d`;
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.contactName)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.companyName) || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.status)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.nextFollowUp)} (${overdueBy})</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.lastCommunication) || "—"}</td>
        </tr>`;
      })
      .join("");
    sections.push(`
      <h2 style="font:600 16px sans-serif;color:#b00020;margin:20px 0 8px;">Follow-ups vencidos (${leads.length})</h2>
      <table style="border-collapse:collapse;width:100%;font:13px sans-serif;color:#222;">
        <tr style="text-align:left;background:#f5f5f5;">
          <th style="padding:6px 10px;">Contacto</th><th style="padding:6px 10px;">Empresa</th>
          <th style="padding:6px 10px;">Etapa</th><th style="padding:6px 10px;">Follow-up</th>
          <th style="padding:6px 10px;">Último contacto</th>
        </tr>${rows}
      </table>`);
  }

  if (tasks.length > 0) {
    const rows = tasks
      .map((t) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(t.title)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(t.assignedTo) || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(t.nextDue)}</td>
      </tr>`)
      .join("");
    sections.push(`
      <h2 style="font:600 16px sans-serif;color:#b00020;margin:20px 0 8px;">Mantenimiento vencido (${tasks.length})</h2>
      <table style="border-collapse:collapse;width:100%;font:13px sans-serif;color:#222;">
        <tr style="text-align:left;background:#f5f5f5;">
          <th style="padding:6px 10px;">Tarea</th><th style="padding:6px 10px;">Responsable</th>
          <th style="padding:6px 10px;">Próxima</th>
        </tr>${rows}
      </table>`);
  }

  return `<div style="max-width:680px;margin:0 auto;font:14px sans-serif;color:#222;">
    <h1 style="font:700 18px sans-serif;">ONYX — Alertas internas</h1>
    <p style="color:#666;">Resumen del ${today}</p>
    ${sections.join("")}
  </div>`;
}

export interface DigestSummary {
  sent: boolean;
  overdueLeads: number;
  overdueMaintenance: number;
  reason?: string;
}

export async function sendOverdueDigest(): Promise<DigestSummary> {
  const leads = await getOverdueFollowUps();
  const tasks = await getOverdueMaintenance();

  if (leads.length === 0 && tasks.length === 0) {
    return { sent: false, overdueLeads: 0, overdueMaintenance: 0, reason: "nada vencido" };
  }
  if (!isEmailConfigured()) {
    return {
      sent: false,
      overdueLeads: leads.length,
      overdueMaintenance: tasks.length,
      reason: "email no configurado",
    };
  }

  const html = buildDigestHtml(leads, tasks);
  const subject = `ONYX — ${leads.length} follow-ups + ${tasks.length} mantenimiento vencidos`;
  await sendEmail({ to: getRecipients(), subject, html });

  return { sent: true, overdueLeads: leads.length, overdueMaintenance: tasks.length };
}

export function registerNotificationSchedule(): void {
  const expr = process.env.ALERT_CRON || "0 8 * * *";
  const tz = process.env.ALERT_TZ || "America/Los_Angeles";
  if (!cron.validate(expr)) {
    console.warn(`[notifications] ALERT_CRON inválido: "${expr}" — schedule no registrado`);
    return;
  }
  cron.schedule(
    expr,
    () => {
      sendOverdueDigest()
        .then((s) => console.log("[notifications] digest:", JSON.stringify(s)))
        .catch((err) => console.error("[notifications] digest falló:", err));
    },
    { timezone: tz },
  );
  console.log(`[notifications] schedule registrado: "${expr}" (${tz})`);
}
