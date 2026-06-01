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

export interface ParsedLineItem {
  period: string;
  category: string;
  label: string;
  amount: number;
  sortOrder: number;
}

// Mapa de grupo QB → categoría persistida (igual que el shape del frontend).
const QB_GROUP_TO_CATEGORY: Record<string, string> = {
  Income: "Revenue",
  COGS: "Cost of Goods Sold",
  Expenses: "Operating Expenses",
};

// Recorre recursivamente las filas dentro de una sección y devuelve solo
// las filas hoja con ColData (excluye Headers/Section/Summary).
function collectLeafRows(rows: AnyRow[]): AnyRow[] {
  const out: AnyRow[] = [];
  for (const r of rows) {
    if (r?.Rows?.Row && Array.isArray(r.Rows.Row)) {
      out.push(...collectLeafRows(r.Rows.Row));
      continue;
    }
    if (r?.ColData && Array.isArray(r.ColData) && r?.type !== "Section") {
      out.push(r);
    }
  }
  return out;
}

// Devuelve la fila top-level cuyo group coincide (Income/COGS/Expenses).
function findGroupRow(rows: AnyRow[], group: string): AnyRow | null {
  for (const r of rows) {
    if (r?.group === group) return r;
  }
  return null;
}

export function parseProfitAndLossLineItems(json: AnyRow): ParsedLineItem[] {
  const columns: AnyRow[] = json?.Columns?.Column ?? [];
  const rows: AnyRow[] = json?.Rows?.Row ?? [];

  // Columnas mensuales (igual lógica que parseProfitAndLossReport).
  const monthCols: Array<{ index: number; period: string }> = [];
  for (let i = 0; i < columns.length; i++) {
    const md = columns[i]?.MetaData;
    if (!Array.isArray(md)) continue;
    const sd = md.find((e: any) => e?.Name === "StartDate");
    if (!sd?.Value) continue;
    const period = String(sd.Value).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    monthCols.push({ index: i, period });
  }

  const out: ParsedLineItem[] = [];
  for (const qbGroup of Object.keys(QB_GROUP_TO_CATEGORY)) {
    const category = QB_GROUP_TO_CATEGORY[qbGroup];
    const groupRow = findGroupRow(rows, qbGroup);
    if (!groupRow?.Rows?.Row) continue;
    const leaves = collectLeafRows(groupRow.Rows.Row);
    leaves.forEach((leaf, idx) => {
      const label = String(leaf?.ColData?.[0]?.value ?? "").trim();
      if (!label) return;
      for (const { index, period } of monthCols) {
        const raw = leaf?.ColData?.[index]?.value;
        const amount = (() => {
          if (raw == null || raw === "") return 0;
          const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
          return Number.isFinite(n) ? n : 0;
        })();
        if (amount === 0) continue; // saltar amounts vacíos
        out.push({ period, category, label, amount, sortOrder: idx });
      }
    });
  }
  return out;
}
