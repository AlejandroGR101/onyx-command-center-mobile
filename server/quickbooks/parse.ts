// Parser del JSON de QuickBooks Online "Reports/ProfitAndLoss" con
// summarize_column_by=Month. Pura, sin I/O.
//
// Estructura esperada (esquemática):
//   {
//     Columns: { Column: [ { ColTitle, ColType, MetaData?: [{Name, Value}] }, ... ] },
//     Rows: { Row: [
//        { group: "Income"|"COGS"|"Expenses", Summary: { ColData: [{value}] } },
//        { group: "NetIncome", Summary: { ColData: [{value}] } },
//        ... otros (Section, etc.) que ignoramos
//     ] }
//   }

export interface ParsedFinancial {
  period: string; // "YYYY-MM"
  revenue: number;
  cogs: number;
  operatingExpenses: number;
  netIncome: number;
}

type AnyRow = any;

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getStartDate(col: AnyRow): string | null {
  const md = col?.MetaData;
  if (!Array.isArray(md)) return null;
  const sd = md.find((e: any) => e?.Name === "StartDate");
  if (!sd?.Value) return null;
  return String(sd.Value);
}

function findGroupSummary(rows: AnyRow[], group: string): AnyRow | null {
  for (const r of rows) {
    if (r?.group === group && r?.Summary?.ColData) return r.Summary;
    // Algunos reportes anidan filas; buscamos en sub-rows también.
    if (r?.Rows?.Row) {
      const nested = findGroupSummary(r.Rows.Row, group);
      if (nested) return nested;
    }
  }
  return null;
}

export function parseProfitAndLossReport(json: AnyRow): ParsedFinancial[] {
  const columns: AnyRow[] = json?.Columns?.Column ?? [];
  const rows: AnyRow[] = json?.Rows?.Row ?? [];

  // Construir lista de índices de columnas mensuales (excluye col 0 = etiqueta y la última = "Total" si existe).
  // Una columna mensual válida tiene MetaData.StartDate; col label/Total no.
  const monthCols: Array<{ index: number; period: string }> = [];
  for (let i = 0; i < columns.length; i++) {
    const sd = getStartDate(columns[i]);
    if (!sd) continue;
    const period = sd.slice(0, 7); // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    monthCols.push({ index: i, period });
  }

  const incomeSum = findGroupSummary(rows, "Income");
  const cogsSum = findGroupSummary(rows, "COGS");
  const expensesSum = findGroupSummary(rows, "Expenses");
  const netIncomeSum = findGroupSummary(rows, "NetIncome");

  function colValue(summary: AnyRow | null, colIndex: number): number {
    if (!summary?.ColData) return 0;
    return toNumber(summary.ColData[colIndex]?.value);
  }

  return monthCols.map(({ index, period }) => ({
    period,
    revenue: colValue(incomeSum, index),
    cogs: colValue(cogsSum, index),
    operatingExpenses: colValue(expensesSum, index),
    netIncome: colValue(netIncomeSum, index),
  }));
}
