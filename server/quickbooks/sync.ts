import cron from "node-cron";
import { ensureValidAccessToken } from "./oauth";
import {
  parseProfitAndLossReport,
  parseProfitAndLossLineItems,
  parseBalanceSheet,
  parseAgedReceivables,
  extractCashPosition,
  extractApTotal,
  extractArTotal,
  type ParsedFinancial,
} from "./parse";
import type { InsertArAgingItem, InsertBalanceSheetItem } from "@shared/schema";
import { storage } from "../storage";

export interface SyncResult {
  periods: string[];
  updated: number;
  lineItems: number;
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
  // Line items (QB-2): delete-by-period + insert por cada period sincronizado.
  const lineItemsRaw = parseProfitAndLossLineItems(json);
  const syncedPeriods = rows.map((r) => r.period);
  // Solo conservar line items de los periods sincronizados (defensivo).
  const lineItemRowsForReplace = lineItemsRaw
    .filter((li) => syncedPeriods.includes(li.period))
    .map((li) => ({
      period: li.period,
      category: li.category,
      label: li.label,
      amount: li.amount,
      sortOrder: li.sortOrder,
    }));
  await storage.replaceLineItemsForPeriods(syncedPeriods, lineItemRowsForReplace);

  await storage.updateQbLastSync(new Date());
  return {
    periods: rows.map((r) => r.period),
    updated: rows.length,
    lineItems: lineItemRowsForReplace.length,
  };
}

export interface BSSyncResult {
  periods: string[];
  updated: number;
}

export async function syncBalanceSheet(months = 12): Promise<BSSyncResult> {
  const { accessToken, realmId, environment } = await ensureValidAccessToken();
  const { startDate, endDate } = rangeLastNMonths(months);
  const url = `${apiBase(environment)}/v3/company/${realmId}/reports/BalanceSheet?start_date=${startDate}&end_date=${endDate}&summarize_column_by=Month&accounting_method=Accrual&minorversion=70`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`QB BS API ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const parsed = parseBalanceSheet(json);
  if (parsed.length === 0) {
    throw new Error("BS report sin estructura esperada (Assets/Liabilities/Equity)");
  }

  const periods = Array.from(new Set(parsed.map((p) => p.period)));
  const rowsForReplace: InsertBalanceSheetItem[] = parsed.map((p) => ({
    period: p.period,
    section: p.section,
    label: p.label,
    amount: p.amount,
    indent: p.indent,
    isBold: p.isBold,
    sortOrder: p.sortOrder,
  }));
  await storage.replaceBalanceSheetForPeriods(periods, rowsForReplace);

  // Side-effects: actualizar financials cashPosition / apTotal por period.
  for (const period of periods) {
    const cash = extractCashPosition(parsed, period);
    const ap = extractApTotal(parsed, period);
    const partial: { cashPosition?: number; apTotal?: number } = {};
    if (cash !== null) partial.cashPosition = cash;
    if (ap !== null) partial.apTotal = ap;
    if (Object.keys(partial).length > 0) {
      await storage.updateFinancialMetrics(period, partial);
    }
  }

  return { periods, updated: parsed.length };
}

export interface ArSyncResult {
  count: number;
  arTotal: number;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function syncArAging(): Promise<ArSyncResult> {
  const { accessToken, realmId, environment } = await ensureValidAccessToken();
  const today = fmtDate(new Date());
  const url = `${apiBase(environment)}/v3/company/${realmId}/reports/AgedReceivables?report_date=${today}&num_periods=4&aging_method=Current&minorversion=70`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`QB AR API ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const parsed = parseAgedReceivables(json);

  const rowsForReplace: InsertArAgingItem[] = parsed.map((r) => ({
    customerName: r.customerName,
    amount: r.amount,
    agingBucket: r.agingBucket,
    invoiceDate: r.invoiceDate ?? null,
    invoiceNumber: r.invoiceNumber ?? null,
    notes: null,
  }));
  await storage.replaceArAging(rowsForReplace);

  const total = extractArTotal(parsed);
  await storage.updateFinancialMetrics(currentPeriod(), { arTotal: total });

  return { count: parsed.length, arTotal: total };
}

export interface SyncAllResult {
  pl: SyncResult;
  bs: BSSyncResult;
  ar: ArSyncResult;
}

export async function syncAll(months = 12): Promise<SyncAllResult> {
  const pl = await syncProfitAndLoss(months);
  const bs = await syncBalanceSheet(months);
  const ar = await syncArAging();
  return { pl, bs, ar };
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
        const r = await syncAll(12);
        console.log("[quickbooks] schedule syncAll OK:", JSON.stringify({ pl: r.pl, bs: r.bs, ar: r.ar }));
      } catch (err) {
        console.error("[quickbooks] schedule sync falló:", err);
      }
    },
    { timezone: tz },
  );
  console.log(`[quickbooks] schedule registrado: "${expr}" (${tz})`);
}
