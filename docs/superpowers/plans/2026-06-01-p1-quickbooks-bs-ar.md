# P1 QB-3 — Balance Sheet + AR + AP total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar Balance Sheet (mensual hierarchical) + Aged Receivables desde QuickBooks Online, eliminar `BALANCE_SHEETS` hardcoded, repoblar `ar_aging`, y actualizar `financials.cashPosition`/`arTotal`/`apTotal` con datos reales. Manual sync + cron diario corren los 3 reportes vía orquestador `syncAll`.

**Architecture:** Nueva tabla `balance_sheet_items` (hierarchical: indent + isBold). Parsers nuevos `parseBalanceSheet` y `parseAgedReceivables` (puros). Funciones nuevas `syncBalanceSheet`, `syncArAging`, `syncAll` que orquesta los 3 reportes. Endpoint `GET /api/financials/balance-sheet`. Frontend elimina BALANCE_SHEETS hardcoded + loop generador y consume via useQuery con loading/empty states.

**Tech Stack:** Drizzle + Postgres, intuit-oauth (existente), React + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-06-01-p1-quickbooks-bs-ar-design.md`

**Branch:** `p1-quickbooks-bs-ar` (creada desde main).

**Nota testing:** Sin runner unitario. Verificación: `npm run check` (tsc), `npm run build`, fixtures de parser, curl al endpoint, navegador para flujo completo.

**Prerequisitos del usuario para T7 E2E:** QB conectado (OAuth completado en navegador). Tasks 1-6 son code-only y typechequean sin esto.

---

## File Structure

| Archivo | Cambio |
|---|---|
| `shared/schema.ts` | + tabla `balance_sheet_items` + insertSchema + tipos. |
| `server/storage.ts` | + 4 métodos en IStorage + impls. |
| `server/quickbooks/parse.ts` | + `parseBalanceSheet`, `parseAgedReceivables`, helpers de extracción. |
| `server/quickbooks/sync.ts` | + `syncBalanceSheet`, `syncArAging`, `syncAll`. Cron/POST llaman `syncAll`. |
| `server/routes.ts` | + `GET /api/financials/balance-sheet`. POST `/api/qb/sync` cambia a `syncAll`. |
| `client/src/pages/finance.tsx` | Eliminar BALANCE_SHEETS + generador. useQuery + loading/empty. Actualizar `handleQbSync` (toast + invalidaciones). Quitar banner "summarized balance sheet". |

---

## Task 1: Schema + tabla `balance_sheet_items`

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Añadir la tabla en shared/schema.ts**

Verificar que `boolean` esté en la línea de imports drizzle-orm/pg-core (debería estar). En `shared/schema.ts`, tras el bloque `financialLineItems` + `insertFinancialLineItemSchema` (del QB-2), antes del bloque `export type Job = ...`, añadir:

```ts
// Balance Sheet items por mes (de QuickBooks BalanceSheet report).
export const balanceSheetItems = pgTable("balance_sheet_items", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),         // "YYYY-MM"
  section: text("section").notNull(),       // "Assets" | "Liabilities" | "Equity"
  label: text("label").notNull(),
  amount: real("amount").notNull(),
  indent: integer("indent").default(0),
  isBold: boolean("is_bold").default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBalanceSheetItemSchema = createInsertSchema(balanceSheetItems).omit({
  id: true,
  createdAt: true,
});
```

- [ ] **Step 2: Tipos al final del archivo**

Tras `export type InsertFinancialLineItem = ...`, añadir:
```ts
export type BalanceSheetItem = typeof balanceSheetItems.$inferSelect;
export type InsertBalanceSheetItem = z.infer<typeof insertBalanceSheetItemSchema>;
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Crear tabla en Postgres (SQL directo)**

Run:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{ try { await p.query('CREATE TABLE IF NOT EXISTS balance_sheet_items (id serial PRIMARY KEY, period text NOT NULL, section text NOT NULL, label text NOT NULL, amount real NOT NULL, indent integer DEFAULT 0, is_bold boolean DEFAULT false, sort_order integer DEFAULT 0, created_at timestamp DEFAULT now())'); await p.query('CREATE INDEX IF NOT EXISTS balance_sheet_items_period_idx ON balance_sheet_items(period)'); console.log('balance_sheet_items + index created'); } finally { await p.end(); } })().catch(e=>{console.error('ERR:', e.message); process.exit(1);})"
```
Expected: `balance_sheet_items + index created`.

- [ ] **Step 5: Verificar columnas**

Run:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query(\"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='balance_sheet_items' ORDER BY ordinal_position\").then(r=>{console.table(r.rows); return p.end();})"
```
Expected: 9 columnas (id, period, section, label, amount, indent, is_bold, sort_order, created_at).

- [ ] **Step 6: Commit**

```
git add shared/schema.ts
git commit -m "feat: balance_sheet_items table for QB BalanceSheet report"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 2: Storage methods

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Ampliar type import**

En el bloque `import type { ... } from "@shared/schema";`, añadir `BalanceSheetItem, InsertBalanceSheetItem`, y también `ArAgingItem, InsertArAgingItem` si no están ya (verifica primero; si ya están, no duplicar).

- [ ] **Step 2: Ampliar table-value import**

En el bloque `import { ... } from "@shared/schema";` (tablas), añadir `balanceSheetItems`. La línea final del bloque queda:
```ts
  quickbooksTokens, financialLineItems, balanceSheetItems,
} from "@shared/schema";
```

- [ ] **Step 3: Añadir métodos a IStorage**

Dentro de `export interface IStorage { ... }`, antes de la llave de cierre, añadir:

```ts
  // Balance Sheet
  getBalanceSheetByPeriod(period: string): Promise<BalanceSheetItem[]>;
  replaceBalanceSheetForPeriods(periods: string[], rows: InsertBalanceSheetItem[]): Promise<void>;

  // AR Aging — replace snapshot
  replaceArAging(rows: InsertArAgingItem[]): Promise<void>;

  // Financials metrics (cashPosition / arTotal / apTotal) — partial upsert
  updateFinancialMetrics(period: string, partial: { cashPosition?: number; arTotal?: number; apTotal?: number }): Promise<void>;
```

- [ ] **Step 4: Implementar en DrizzleStorage**

Dentro de `class DrizzleStorage`, antes de su llave de cierre, añadir:

```ts
  // Balance Sheet
  async getBalanceSheetByPeriod(period: string): Promise<BalanceSheetItem[]> {
    return db
      .select()
      .from(balanceSheetItems)
      .where(eq(balanceSheetItems.period, period))
      .orderBy(asc(balanceSheetItems.sortOrder));
  }
  async replaceBalanceSheetForPeriods(periods: string[], rows: InsertBalanceSheetItem[]): Promise<void> {
    if (periods.length > 0) {
      await db.delete(balanceSheetItems).where(inArray(balanceSheetItems.period, periods));
    }
    if (rows.length > 0) {
      await db.insert(balanceSheetItems).values(rows);
    }
  }

  // AR Aging
  async replaceArAging(rows: InsertArAgingItem[]): Promise<void> {
    await db.delete(arAging);
    if (rows.length > 0) {
      await db.insert(arAging).values(rows);
    }
  }

  // Financials metrics
  async updateFinancialMetrics(
    period: string,
    partial: { cashPosition?: number; arTotal?: number; apTotal?: number },
  ): Promise<void> {
    const setClause: Record<string, number> = {};
    if (partial.cashPosition !== undefined) setClause.cashPosition = partial.cashPosition;
    if (partial.arTotal !== undefined) setClause.arTotal = partial.arTotal;
    if (partial.apTotal !== undefined) setClause.apTotal = partial.apTotal;
    if (Object.keys(setClause).length === 0) return;
    await db
      .insert(financials)
      .values({
        period,
        revenue: 0,
        cogs: 0,
        operatingExpenses: 0,
        netIncome: 0,
        cashPosition: partial.cashPosition ?? null,
        arTotal: partial.arTotal ?? null,
        apTotal: partial.apTotal ?? null,
      })
      .onConflictDoUpdate({
        target: financials.period,
        set: setClause,
      });
  }
```

- [ ] **Step 5: Implementar stubs en MemStorage**

Dentro de `class MemStorage`, añadir un Map junto a los otros:
```ts
  private bsMap: Map<number, BalanceSheetItem> = new Map();
```
Y los métodos (antes de la llave de cierre):
```ts
  async getBalanceSheetByPeriod(period: string): Promise<BalanceSheetItem[]> {
    return Array.from(this.bsMap.values())
      .filter((r) => r.period === period)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  async replaceBalanceSheetForPeriods(periods: string[], rows: InsertBalanceSheetItem[]): Promise<void> {
    for (const [id, row] of Array.from(this.bsMap.entries())) {
      if (periods.includes(row.period)) this.bsMap.delete(id);
    }
    for (const r of rows) {
      const id = this.getNextId();
      this.bsMap.set(id, { ...(r as any), id, createdAt: new Date() } as BalanceSheetItem);
    }
  }

  async replaceArAging(rows: InsertArAgingItem[]): Promise<void> {
    this.arAgingItems.clear();
    for (const r of rows) {
      const id = this.getNextId();
      this.arAgingItems.set(id, { ...(r as any), id } as ArAgingItem);
    }
  }

  async updateFinancialMetrics(
    period: string,
    partial: { cashPosition?: number; arTotal?: number; apTotal?: number },
  ): Promise<void> {
    const existing = Array.from(this.financials.values()).find((f) => f.period === period);
    if (existing) {
      if (partial.cashPosition !== undefined) existing.cashPosition = partial.cashPosition;
      if (partial.arTotal !== undefined) existing.arTotal = partial.arTotal;
      if (partial.apTotal !== undefined) existing.apTotal = partial.apTotal;
    } else {
      const id = this.getNextId();
      this.financials.set(id, {
        id,
        period,
        revenue: 0,
        cogs: 0,
        operatingExpenses: 0,
        netIncome: 0,
        cashPosition: partial.cashPosition ?? null,
        arTotal: partial.arTotal ?? null,
        apTotal: partial.apTotal ?? null,
      } as any);
    }
  }
```

Note: `this.arAgingItems` ya existe en MemStorage (Map de seed data). El método replace usa `clear()` + insert.

- [ ] **Step 6: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```
git add server/storage.ts
git commit -m "feat: storage methods for BS items, AR replace, and financials metrics upsert"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 3: Parsers (BS + AR) + fixture sanity

**Files:**
- Modify: `server/quickbooks/parse.ts`

- [ ] **Step 1: Añadir tipos y parser de Balance Sheet**

Al final de `server/quickbooks/parse.ts`, añadir:

```ts
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
// `monthCols` indica las columnas mensuales (índices en ColData).
// `section` ya resuelto (Assets|Liabilities|Equity). `depth` y `counter` mutados por referencia.
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

  // Walk top-level rows. Cada row top-level puede ser una sección Assets/Liabilities/Equity
  // o un contenedor "Liabilities and Equity" (descender a sus children).
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
```

Note: `AnyRow` y `toNumber` ya existen en parse.ts. Reusar.

- [ ] **Step 2: Añadir parser de AR (AgedReceivables)**

Continuar al final del archivo:

```ts
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

// Recorre rows.Row[] recursivamente y devuelve leaf rows con ColData (sin Summary).
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

  // Mapear columnas: { index → bucket } y opcionalmente { dateIdx, numIdx }.
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
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Sanity check BS con fixture**

Crear archivo temporal `tmp-bs-check.ts` en la raíz:

```ts
import { parseBalanceSheet, extractCashPosition, extractApTotal } from "./server/quickbooks/parse";

const fixture = {
  Columns: {
    Column: [
      { ColTitle: "" },
      { ColTitle: "Jan 2026", MetaData: [{ Name: "StartDate", Value: "2026-01-01" }] },
    ],
  },
  Rows: {
    Row: [
      {
        Header: { ColData: [{ value: "ASSETS" }, { value: "" }] },
        Rows: { Row: [
          { Header: { ColData: [{ value: "Bank Accounts" }, { value: "" }] },
            Rows: { Row: [
              { type: "Data", ColData: [{ value: "Wells Fargo Checking" }, { value: "2676.58" }] },
              { type: "Data", ColData: [{ value: "Wells Fargo Savings" }, { value: "2022.14" }] },
            ]},
            Summary: { ColData: [{ value: "Total Bank Accounts" }, { value: "4698.72" }] },
          },
        ]},
        Summary: { ColData: [{ value: "TOTAL ASSETS" }, { value: "627061.05" }] },
      },
      {
        Header: { ColData: [{ value: "LIABILITIES AND EQUITY" }, { value: "" }] },
        Rows: { Row: [
          { Header: { ColData: [{ value: "LIABILITIES" }, { value: "" }] },
            Rows: { Row: [
              { type: "Data", ColData: [{ value: "Accounts Payable" }, { value: "24813.94" }] },
            ]},
            Summary: { ColData: [{ value: "TOTAL LIABILITIES" }, { value: "35739.50" }] },
          },
          { Header: { ColData: [{ value: "EQUITY" }, { value: "" }] },
            Rows: { Row: [
              { type: "Data", ColData: [{ value: "Owner Equity" }, { value: "591321.55" }] },
            ]},
            Summary: { ColData: [{ value: "TOTAL EQUITY" }, { value: "591321.55" }] },
          },
        ]},
      },
    ],
  },
};

const parsed = parseBalanceSheet(fixture);
console.log("Parsed count:", parsed.length);
console.log("Sections:", [...new Set(parsed.map(p => p.section))]);
console.log("Cash (2026-01):", extractCashPosition(parsed, "2026-01"));
console.log("AP (2026-01):", extractApTotal(parsed, "2026-01"));
// Sample shape
console.log("First 3:", JSON.stringify(parsed.slice(0, 3), null, 2));
```

Run: `npx tsx tmp-bs-check.ts`

Expected output:
- `Parsed count: > 0` (alrededor de 12-15 entries: Headers + Data + Summary lines).
- `Sections: [ 'Assets', 'Liabilities', 'Equity' ]` (en algún orden — todas 3 presentes).
- `Cash (2026-01): 4698.72` (extraído del Total Bank Accounts).
- `AP (2026-01): 24813.94` (extraído del Accounts Payable detail row).

Borrar `tmp-bs-check.ts`: `Remove-Item tmp-bs-check.ts` (o `rm tmp-bs-check.ts`).

- [ ] **Step 5: Sanity check AR con fixture**

Crear `tmp-ar-check.ts`:

```ts
import { parseAgedReceivables, extractArTotal } from "./server/quickbooks/parse";

const fixture = {
  Columns: {
    Column: [
      { ColTitle: "Customer" },
      { ColTitle: "Invoice Date" },
      { ColTitle: "Num" },
      { ColTitle: "Current" },
      { ColTitle: "1 - 30" },
      { ColTitle: "31 - 60" },
      { ColTitle: "61 - 90" },
      { ColTitle: "91 and over" },
      { ColTitle: "Total" },
    ],
  },
  Rows: {
    Row: [
      { type: "Data", ColData: [
        { value: "Adam Bartlett" }, { value: "2026-02-20" }, { value: "INV-3801" },
        { value: "5284.14" }, { value: "0" }, { value: "0" }, { value: "0" }, { value: "0" }, { value: "5284.14" },
      ]},
      { type: "Data", ColData: [
        { value: "Ira Altwegg" }, { value: "2025-06-15" }, { value: "INV-3650" },
        { value: "0" }, { value: "0" }, { value: "0" }, { value: "0" }, { value: "2018.54" }, { value: "2018.54" },
      ]},
    ],
  },
};

const parsed = parseAgedReceivables(fixture);
console.log(JSON.stringify(parsed, null, 2));
console.log("AR total:", extractArTotal(parsed));
```

Run: `npx tsx tmp-ar-check.ts`

Expected:
- Array de 2 entries:
  - `{ customerName: "Adam Bartlett", amount: 5284.14, agingBucket: "current", invoiceDate: "2026-02-20", invoiceNumber: "INV-3801" }`
  - `{ customerName: "Ira Altwegg", amount: 2018.54, agingBucket: "91+", invoiceDate: "2025-06-15", invoiceNumber: "INV-3650" }`
- AR total: 7302.68

Borrar `tmp-ar-check.ts`.

- [ ] **Step 6: Commit**

```
git add server/quickbooks/parse.ts
git commit -m "feat: parsers for QB BalanceSheet + AgedReceivables + extraction helpers"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 4: sync.ts — syncBalanceSheet, syncArAging, syncAll

**Files:**
- Modify: `server/quickbooks/sync.ts`

- [ ] **Step 1: Ampliar imports del parser**

Cambiar la línea existente de import de `./parse` para incluir los nuevos:
```ts
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
```

- [ ] **Step 2: Importar `InsertArAgingItem` y `InsertBalanceSheetItem`**

En `server/quickbooks/sync.ts`, añadir junto a los otros imports:
```ts
import type { InsertArAgingItem, InsertBalanceSheetItem } from "@shared/schema";
```

- [ ] **Step 3: Añadir syncBalanceSheet**

Tras la función `syncProfitAndLoss`, añadir:

```ts
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

  // Conjunto único de periods presentes en el reporte.
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
```

- [ ] **Step 4: Añadir syncArAging**

Tras `syncBalanceSheet`, añadir:

```ts
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
```

- [ ] **Step 5: Añadir syncAll orquestador**

Tras `syncArAging`, añadir:

```ts
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
```

- [ ] **Step 6: Actualizar el cron para llamar syncAll**

En la función `registerQuickbooksSchedule`, dentro del callback de `cron.schedule`, cambiar:
```ts
const r = await syncProfitAndLoss(12);
console.log("[quickbooks] schedule sync OK:", JSON.stringify(r));
```
A:
```ts
const r = await syncAll(12);
console.log("[quickbooks] schedule syncAll OK:", JSON.stringify({ pl: r.pl, bs: r.bs, ar: r.ar }));
```

- [ ] **Step 7: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```
git add server/quickbooks/sync.ts
git commit -m "feat: syncBalanceSheet + syncArAging + syncAll orchestrator"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 5: Endpoint BS + actualizar POST /api/qb/sync

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Ampliar imports**

Cambiar el import existente de `./quickbooks/sync` para incluir `syncAll`:
```ts
import { syncProfitAndLoss, syncAll } from "./quickbooks/sync";
```
(Nota: `syncProfitAndLoss` puede quedar importado pero ya no se llama directamente; conservar import solo si se usa en otro endpoint. Si solo `/api/qb/sync` lo usaba, REEMPLAZAR el import por `import { syncAll } from "./quickbooks/sync";` y borrar el uso anterior.)

- [ ] **Step 2: Cambiar POST /api/qb/sync para usar syncAll**

Localizar el handler `app.post("/api/qb/sync", async (_req, res) => { ... });`. Reemplazar el cuerpo:

```ts
  app.post("/api/qb/sync", async (_req, res) => {
    if (!isQbConfigured()) {
      return res.status(400).json({ error: "QB no configurado" });
    }
    try {
      const summary = await syncAll(12);
      res.json(summary);
    } catch (err: any) {
      const msg = err?.message || "Error en sync QB";
      if (msg.includes("QB no conectado")) return res.status(400).json({ error: msg });
      res.status(502).json({ error: msg });
    }
  });
```

- [ ] **Step 3: Añadir endpoint GET /api/financials/balance-sheet**

Tras el endpoint `/api/financials/line-items` (que añadiste en QB-2) y antes del bloque de qb endpoints, añadir:

```ts
  app.get("/api/financials/balance-sheet", async (req, res) => {
    const period = String(req.query.period || "");
    if (!period) {
      return res.status(400).json({ error: "period requerido" });
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: "period inválido (formato YYYY-MM)" });
    }
    const items = await storage.getBalanceSheetByPeriod(period);

    const order = ["Assets", "Liabilities", "Equity"];
    const grouped: Array<{ heading: string; lines: Array<{ label: string; amount: number; indent: number; bold: boolean }> }> = [];
    for (const section of order) {
      const matching = items
        .filter((i) => i.section === section)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      if (matching.length === 0) continue;
      grouped.push({
        heading: section,
        lines: matching.map((i) => ({
          label: i.label,
          amount: i.amount,
          indent: i.indent ?? 0,
          bold: i.isBold ?? false,
        })),
      });
    }
    res.json(grouped);
  });
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Live verify (sin datos QB aún — empty path)**

Arrancar `npm run dev` en background (Bash con `run_in_background: true`). Esperar ~6s. Verificar logs muestren los schedules de notifications + quickbooks.

En PowerShell:
```
cd "c:\Projectos\ONYX\onyx-command-center-mobile"
'{"username":"Admin","password":"OnyxCCD"}' | Out-File -Encoding ascii body.json
curl.exe -s -c c.txt -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" --data "@body.json" | Out-Null

Write-Output "--- no session ---"
curl.exe -i -s http://localhost:5000/api/financials/balance-sheet

Write-Output "--- no period (400) ---"
curl.exe -i -s -b c.txt http://localhost:5000/api/financials/balance-sheet

Write-Output "--- bad period (400) ---"
curl.exe -i -s -b c.txt "http://localhost:5000/api/financials/balance-sheet?period=bad"

Write-Output "--- valid empty (200 []) ---"
curl.exe -i -s -b c.txt "http://localhost:5000/api/financials/balance-sheet?period=2026-04"

Remove-Item c.txt,body.json -ErrorAction SilentlyContinue
```

Expected:
- No session: 401.
- No period: 400 `{"error":"period requerido"}`.
- Bad period: 400 `{"error":"period inválido (formato YYYY-MM)"}`.
- Valid sin datos: 200 `[]`.

Stop server (`Get-Process node | Stop-Process -Force` o `TaskStop` del background bash).

- [ ] **Step 6: Commit**

```
git add server/routes.ts
git commit -m "feat: GET /api/financials/balance-sheet + POST /api/qb/sync uses syncAll"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 6: Frontend — eliminar BALANCE_SHEETS + useQuery + invalidaciones + toast nuevo

**Files:**
- Modify: `client/src/pages/finance.tsx`

**Contexto:** El archivo tiene `BALANCE_SHEETS` hardcoded (~líneas 52-100, Jan 2026 detallado) + un loop generador `for (const m of MONTHS) BALANCE_SHEETS[m] = ...` (~líneas 100-141) que genera aproximaciones random para otros meses. Los tipos `BSLine` y `BSSection` (~líneas 54-55) se conservan (los usa el render). Consumer en línea ~298 (`bsSections = BALANCE_SHEETS[selectedMonth] || ...`), render en línea ~583, banner condicional en línea ~619.

`handleQbSync` ya invalida `/api/qb/status`, `/api/financials`, `/api/financials/line-items`. Falta `/api/financials/balance-sheet` y `/api/ar-aging`. La respuesta de POST `/api/qb/sync` ahora es `{pl, bs, ar}` en vez de `{periods, updated, lineItems}` → el toast actual lee `data.updated` y `data.periods`. Adaptar.

- [ ] **Step 1: Eliminar BALANCE_SHEETS + loop generador**

En `client/src/pages/finance.tsx`, borrar:
- La constante `const BALANCE_SHEETS: Record<string, BSSection[]> = { ... };` (~líneas 57-100, INCLUSIVE).
- El loop generador (~líneas 100-141): `for (const m of MONTHS) { BALANCE_SHEETS[m] = [...]; }`.
- El comentario de cabecera `/* ─── Balance Sheet (...) ─── */` (~línea 53).

CONSERVAR:
- Los tipos `type BSLine = { label: string; amount: number; indent?: number; bold?: boolean };` y `type BSSection = { heading: string; lines: BSLine[] };` (líneas 54-55) — los usa el render.

Tras borrar, `npm run check` se quejará en el consumer (`BALANCE_SHEETS[selectedMonth]`). Se arregla en Step 2-3.

- [ ] **Step 2: Añadir useQuery para BS**

Dentro del componente `Finance`, junto a los otros useQuery (financials, arAging, jobs, qbStatus, pnlQuery), añadir:

```tsx
  const bsQuery = useQuery<BSSection[]>({
    queryKey: ["/api/financials/balance-sheet", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/financials/balance-sheet?period=${encodeURIComponent(selectedMonth)}`);
      return res.json();
    },
  });
```

- [ ] **Step 3: Reemplazar el consumer de bsSections**

Localizar la línea (~298):
```tsx
  const bsSections = BALANCE_SHEETS[selectedMonth] || BALANCE_SHEETS["2026-01"];
```
Reemplazar con:
```tsx
  const bsSections = bsQuery.data ?? [];
```

- [ ] **Step 4: Wrap render con loading/empty state + quitar banner**

Localizar el bloque (~líneas 580-617):
```tsx
          <div className="grid grid-cols-1 gap-0">
            {bsSections.map((section) => (
              <div key={section.heading} className="mb-4">
                ...
              </div>
            ))}
          </div>

          {selectedMonth !== "2026-01" && (
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/25 italic">
                Showing summarized balance sheet. Detailed line items available for January 2026 (from QuickBooks).
              </p>
            </div>
          )}
```

Reemplazar con (wrap del map con conditional + ELIMINAR el banner `{selectedMonth !== "2026-01" && ...}`):

```tsx
          <div className="grid grid-cols-1 gap-0">
            {bsQuery.isLoading ? (
              <div className="text-white/40 text-sm py-6">Cargando…</div>
            ) : bsSections.length === 0 ? (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-6 text-center">
                <div className="text-white/60 text-sm">No hay Balance Sheet para {selectedMonth}.</div>
                <div className="text-white/40 text-xs mt-1">Sincroniza QuickBooks para ver el detalle.</div>
              </div>
            ) : (
              bsSections.map((section) => (
                <div key={section.heading} className="mb-4">
                  ...preservar contenido original...
                </div>
              ))
            )}
          </div>
```

Donde `...preservar contenido original...` es el JSX que estaba renderizando cada section (el header con tracking + el inner `{section.lines.map(...)}` con styling). NO reescribas ese contenido; muévelo verbatim dentro de la rama del ternario.

- [ ] **Step 5: Actualizar handleQbSync — invalidaciones + toast**

Localizar `handleQbSync` (~líneas 230-260). Reemplazar el bloque del `try`:

Antes:
```tsx
    try {
      const res = await apiRequest("POST", "/api/qb/sync");
      const data = await res.json();
      toast({
        title: "QuickBooks sync OK",
        description: `${data.updated} meses actualizados (${data.periods?.[0]} → ${data.periods?.[data.periods.length - 1]})`,
      });
      qc.invalidateQueries({ queryKey: ["/api/qb/status"] });
      qc.invalidateQueries({ queryKey: ["/api/financials"] });
      qc.invalidateQueries({ queryKey: ["/api/financials/line-items"] });
    } catch (err: any) {
```

Después:
```tsx
    try {
      const res = await apiRequest("POST", "/api/qb/sync");
      const data = await res.json();
      const plMonths = data?.pl?.updated ?? 0;
      const bsRows = data?.bs?.updated ?? 0;
      const arRows = data?.ar?.count ?? 0;
      toast({
        title: "QuickBooks sync OK",
        description: `${plMonths} meses P&L · ${bsRows} líneas BS · ${arRows} AR rows`,
      });
      qc.invalidateQueries({ queryKey: ["/api/qb/status"] });
      qc.invalidateQueries({ queryKey: ["/api/financials"] });
      qc.invalidateQueries({ queryKey: ["/api/financials/line-items"] });
      qc.invalidateQueries({ queryKey: ["/api/financials/balance-sheet"] });
      qc.invalidateQueries({ queryKey: ["/api/ar-aging"] });
    } catch (err: any) {
```

- [ ] **Step 6: Verificar typecheck + build**

Run: `npm run check`
Expected: PASS. Sin más referencias a `BALANCE_SHEETS`.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Verificar grep**

Run (PowerShell):
```
Select-String -Path "client\src\**\*.tsx" -Pattern "BALANCE_SHEETS"
```
Expected: 0 matches.

- [ ] **Step 8: Commit**

```
git add client/src/pages/finance.tsx
git commit -m "feat: replace BALANCE_SHEETS hardcoded with /api/financials/balance-sheet query"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 7: Verificación E2E real (requiere QB conectado)

**Files:** ninguno (verificación). Si QB aún no se conectó en navegador → reportar BLOCKED y dar instrucciones.

- [ ] **Step 1: Confirmar QB conectado**

```
curl.exe -s -b c.txt http://localhost:5000/api/qb/status
```
Expected: `{"connected":true,"realmId":"...","environment":"sandbox","lastSyncAt":"..."}`. Si `connected:false`, hacer en navegador: `/api/qb/connect`.

- [ ] **Step 2: Disparar syncAll y verificar response shape**

```
curl.exe -s -b c.txt -X POST http://localhost:5000/api/qb/sync
```
Expected: JSON con shape `{ "pl": {periods, updated, lineItems}, "bs": {periods, updated}, "ar": {count, arTotal} }`. Todos con counts > 0 (o ar.count = 0 si no hay deudas reales).

- [ ] **Step 3: Verificar tablas en DB**

```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{ const t1=await p.query('SELECT period, count(*) FROM balance_sheet_items GROUP BY period ORDER BY period'); const t2=await p.query('SELECT count(*) FROM ar_aging'); const t3=await p.query('SELECT period, revenue, cash_position, ar_total, ap_total FROM financials ORDER BY period'); console.log('--- BS counts ---'); console.table(t1.rows); console.log('--- AR count ---'); console.table(t2.rows); console.log('--- financials ---'); console.table(t3.rows); await p.end(); })()"
```
Expected:
- `balance_sheet_items` con filas para los 12 meses.
- `ar_aging` con filas reales QB (puede ser 0 si sandbox está limpio).
- `financials.cash_position` y `ap_total` con valores reales (no nulls/seed) en los 12 periods sincronizados. `ar_total` con valor real en el mes actual.

- [ ] **Step 4: Verificar endpoint BS con datos reales**

```
curl.exe -s -b c.txt "http://localhost:5000/api/financials/balance-sheet?period=2026-04"
```
Expected: array con secciones Assets/Liabilities/Equity (las que tengan datos), cada una con `lines: [{label, amount, indent, bold}]`. Total rows con `bold:true`.

- [ ] **Step 5: Navegador**

Abrir `/#/finance`. Cambiar selector de mes:
- Meses sincronizados → BS detallado con hierarchical indent + bold totals.
- Mes vacío → empty state "No hay Balance Sheet para YYYY-MM".
- KPI cards (cash position, AR total, AP total) muestran valores reales QB.
- AR Aging panel muestra customers reales.

- [ ] **Step 6: Sync repetido (idempotencia)**

Click "Sync now" de nuevo → toast "QuickBooks sync OK: N meses P&L · M líneas BS · K AR rows". DB no duplica (BS delete-by-period, AR delete-all-insert-all).

- [ ] **Step 7 (sin commit — verificación)**

Reportar resultados. Sin commits.

---

## Verificación final

- [ ] `npm run check` → PASS.
- [ ] `npm run build` → PASS.
- [ ] `BALANCE_SHEETS` ya no aparece en client (`grep` → 0).
- [ ] Tabla `balance_sheet_items` creada con índice por `period`.
- [ ] `POST /api/qb/sync` devuelve `{pl, bs, ar}` con counts > 0.
- [ ] `GET /api/financials/balance-sheet?period=YYYY-MM` agrupado.
- [ ] `financials.cashPosition/arTotal/apTotal` actualizados con valores QB.
- [ ] Frontend muestra BS real + KPI cards reflejan datos QB + AR aging real.
- [ ] Sync repetido es idempotente.
