import cron from "node-cron";
import { ensureValidAccessToken } from "./oauth";
import { parseProfitAndLossReport, type ParsedFinancial } from "./parse";
import { storage } from "../storage";

export interface SyncResult {
  periods: string[];
  updated: number;
}

function fmtDate(d: Date): string {
  // YYYY-MM-DD en UTC; QB acepta este formato.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeLastNMonths(months: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)); // último día del mes actual
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return { startDate: fmtDate(start), endDate: fmtDate(end) };
}

function apiBase(environment: string): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export async function syncProfitAndLoss(months = 12): Promise<SyncResult> {
  const { accessToken, realmId, environment } = await ensureValidAccessToken();
  const { startDate, endDate } = rangeLastNMonths(months);
  const url = `${apiBase(environment)}/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&summarize_column_by=Month&accounting_method=Accrual&minorversion=70`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`QB API ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const rows: ParsedFinancial[] = parseProfitAndLossReport(json);
  if (rows.length === 0) {
    throw new Error("QB report sin columnas mensuales — estructura inesperada");
  }
  for (const r of rows) {
    await storage.upsertFinancialPartial(r.period, {
      revenue: r.revenue,
      cogs: r.cogs,
      operatingExpenses: r.operatingExpenses,
      netIncome: r.netIncome,
    });
  }
  await storage.updateQbLastSync(new Date());
  return { periods: rows.map((r) => r.period), updated: rows.length };
}

export function registerQuickbooksSchedule(): void {
  const expr = process.env.QB_SYNC_CRON || "0 6 * * *";
  const tz = "America/Los_Angeles";
  if (!cron.validate(expr)) {
    console.warn(`[quickbooks] QB_SYNC_CRON inválido: "${expr}" — schedule no registrado`);
    return;
  }
  cron.schedule(
    expr,
    async () => {
      try {
        const tokens = await storage.getQbTokens();
        if (!tokens) {
          console.log("[quickbooks] schedule: QB no conectado, skip");
          return;
        }
        const r = await syncProfitAndLoss(12);
        console.log("[quickbooks] schedule sync OK:", JSON.stringify(r));
      } catch (err) {
        console.error("[quickbooks] schedule sync falló:", err);
      }
    },
    { timezone: tz },
  );
  console.log(`[quickbooks] schedule registrado: "${expr}" (${tz})`);
}
