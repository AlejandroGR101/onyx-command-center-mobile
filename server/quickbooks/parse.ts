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

export interface ParsedBSItem {
  period: string;
  section: string;        // "Assets" | "Liabilities" | "Equity"
  label: string;
  amount: number;
  indent: number;
  isBold: boolean;
  sortOrder: number;
}

// Detecta el section name a partir del Header.ColData[0].value de una sección top-level.
function detectSection(headerLabel: string): string | null {
  const u = String(headerLabel || "").trim().toUpperCase();
  if (u === "ASSETS") return "Assets";
  if (u === "LIABILITIES") return "Liabilities";
  if (u === "EQUITY") return "Equity";
  if (u === "LIABILITIES AND EQUITY") return null; // contenedor combinado — descender
  return null;
}

// Recorre una sección emitting líneas con indent/isBold/sortOrder.
function walkBalanceSection(
  rows: AnyRow[],
  section: string,
  depth: number,
  monthCols: Array<{ index: number; period: string }>,
  counter: { n: number },
  out: ParsedBSItem[],
): void {
  for (const r of rows) {
    if (r?.Header?.ColData) {
      const label = String(r.Header.ColData[0]?.value ?? "").trim();
      if (label) {
        for (const { period } of monthCols) {
          out.push({ period, section, label, amount: 0, indent: depth, isBold: true, sortOrder: counter.n });
        }
        counter.n++;
      }
    }
    if (r?.Rows?.Row && Array.isArray(r.Rows.Row)) {
      walkBalanceSection(r.Rows.Row, section, depth + 1, monthCols, counter, out);
    }
    if (r?.ColData && Array.isArray(r.ColData) && r?.type !== "Section" && !(r?.Rows?.Row)) {
      const label = String(r.ColData[0]?.value ?? "").trim();
      if (label) {
        for (const { index, period } of monthCols) {
          const raw = r.ColData[index]?.value;
          const amount = toNumber(raw);
          out.push({ period, section, label, amount, indent: depth, isBold: false, sortOrder: counter.n });
        }
        counter.n++;
      }
    }
    if (r?.Summary?.ColData) {
      const label = String(r.Summary.ColData[0]?.value ?? "").trim();
      if (label) {
        for (const { index, period } of monthCols) {
          const raw = r.Summary.ColData[index]?.value;
          const amount = toNumber(raw);
          out.push({ period, section, label, amount, indent: depth, isBold: true, sortOrder: counter.n });
        }
        counter.n++;
      }
    }
  }
}

export function parseBalanceSheet(json: AnyRow): ParsedBSItem[] {
  const columns: AnyRow[] = json?.Columns?.Column ?? [];
  const rows: AnyRow[] = json?.Rows?.Row ?? [];

  // Columnas mensuales.
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

  const out: ParsedBSItem[] = [];
  const counter = { n: 0 };

  function processTopRow(row: AnyRow) {
    const headerLabel = String(row?.Header?.ColData?.[0]?.value ?? "").trim();
    const section = detectSection(headerLabel);
    if (section) {
      // Walk children + summary del root.
      if (row?.Rows?.Row) {
        walkBalanceSection(row.Rows.Row, section, 1, monthCols, counter, out);
      }
      if (row?.Summary?.ColData) {
        const label = String(row.Summary.ColData[0]?.value ?? "").trim();
        if (label) {
          for (const { index, period } of monthCols) {
            const amount = toNumber(row.Summary.ColData[index]?.value);
            out.push({ period, section, label, amount, indent: 0, isBold: true, sortOrder: counter.n });
          }
          counter.n++;
        }
      }
      return;
    }
    // Contenedor combinado: descender.
    if (row?.Rows?.Row) {
      for (const child of row.Rows.Row) {
        processTopRow(child);
      }
    }
  }
  for (const r of rows) processTopRow(r);

  return out;
}

export function extractCashPosition(parsed: ParsedBSItem[], period: string): number | null {
  const row = parsed.find(
    (p) =>
      p.period === period &&
      p.section === "Assets" &&
      /^total bank accounts$/i.test(p.label.trim()),
  );
  return row ? row.amount : null;
}

export function extractApTotal(parsed: ParsedBSItem[], period: string): number | null {
  const row = parsed.find(
    (p) =>
      p.period === period &&
      p.section === "Liabilities" &&
      /^(accounts payable|total accounts payable|a\/p)$/i.test(p.label.trim()),
  );
  return row ? row.amount : null;
}

export interface ParsedArRow {
  customerName: string;
  amount: number;
  agingBucket: "current" | "1-30" | "31-60" | "61-90" | "91+";
  invoiceDate?: string | null;
  invoiceNumber?: string | null;
}

// Mapea un ColTitle de AgedReceivables a nuestro bucket canónico.
function mapAgingBucket(title: string): ParsedArRow["agingBucket"] | null {
  const t = String(title || "").trim().toLowerCase();
  if (/^current$/.test(t)) return "current";
  if (/^1\s*[-–]\s*30$/.test(t)) return "1-30";
  if (/^31\s*[-–]\s*60$/.test(t)) return "31-60";
  if (/^61\s*[-–]\s*90$/.test(t)) return "61-90";
  if (/^(91\s*(\+|and\s*over)|>\s*90)$/.test(t)) return "91+";
  return null;
}

function collectArLeafRows(rows: AnyRow[]): AnyRow[] {
  const out: AnyRow[] = [];
  for (const r of rows) {
    if (r?.Rows?.Row && Array.isArray(r.Rows.Row)) {
      out.push(...collectArLeafRows(r.Rows.Row));
      continue;
    }
    if (r?.ColData && Array.isArray(r.ColData) && r?.type !== "Section") {
      out.push(r);
    }
  }
  return out;
}

export function parseAgedReceivables(json: AnyRow): ParsedArRow[] {
  const columns: AnyRow[] = json?.Columns?.Column ?? [];
  const rows: AnyRow[] = json?.Rows?.Row ?? [];

  const bucketCols: Array<{ index: number; bucket: ParsedArRow["agingBucket"] }> = [];
  let dateIdx: number | null = null;
  let numIdx: number | null = null;
  for (let i = 0; i < columns.length; i++) {
    const title = String(columns[i]?.ColTitle ?? "");
    const lower = title.trim().toLowerCase();
    const bucket = mapAgingBucket(title);
    if (bucket) bucketCols.push({ index: i, bucket });
    else if (/date/.test(lower) && /transaction|invoice|txn/.test(lower)) dateIdx = i;
    else if (lower === "date") dateIdx = i;
    else if (/num|number/.test(lower)) numIdx = i;
  }

  const out: ParsedArRow[] = [];
  const leaves = collectArLeafRows(rows);

  for (const leaf of leaves) {
    const customer = String(leaf.ColData[0]?.value ?? "").trim();
    if (!customer) continue;
    const invoiceDate = dateIdx != null ? String(leaf.ColData[dateIdx]?.value ?? "") || null : null;
    const invoiceNumber = numIdx != null ? String(leaf.ColData[numIdx]?.value ?? "") || null : null;

    for (const { index, bucket } of bucketCols) {
      const amount = toNumber(leaf.ColData[index]?.value);
      if (amount === 0) continue;
      out.push({
        customerName: customer,
        amount,
        agingBucket: bucket,
        invoiceDate,
        invoiceNumber,
      });
    }
  }
  return out;
}

export function extractArTotal(rows: ParsedArRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}
