# P1 QB-2 — P&L Line Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar las filas detalle del reporte ProfitAndLoss de QuickBooks por mes y mostrar el desglose real (Vinyl Pellets, Labels, Rent, etc.) en `client/src/pages/finance.tsx`, eliminando el `MONTHLY_PL` hardcoded.

**Architecture:** Reusa el fetch de QB-1 (`syncProfitAndLoss`) — la respuesta ya contiene Detail rows. Añade un parser nuevo `parseProfitAndLossLineItems`, una tabla `financial_line_items`, un endpoint `/api/financials/line-items?period=YYYY-MM` y reemplaza el lookup hardcoded del frontend con `useQuery` + empty state.

**Tech Stack:** Drizzle + Postgres, intuit-oauth (vía QB-1), React + TanStack Query. Sin nuevas deps.

**Spec:** `docs/superpowers/specs/2026-05-29-p1-quickbooks-line-items-design.md`

**Branch:** `p1-quickbooks-line-items` (creada desde main).

**Nota testing:** Sin runner unitario. Verificación por `npm run check` (tsc), sanity check del parser con fixture, curl al endpoint, navegador para el frontend.

**Prerequisitos del usuario para T8 (verificación E2E real):** `.env` con `QB_CLIENT_ID/SECRET/REDIRECT_URI/ENVIRONMENT` configurados (ya están desde QB-1) y haber completado al menos una vez el OAuth+sync en el navegador para que existan tokens y line items en DB. T1-T7 son code-only y se completan sin esto.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `shared/schema.ts` (modificar) | + tabla `financial_line_items` + insertSchema + tipos. |
| `server/storage.ts` (modificar) | + `getLineItemsByPeriod`, `replaceLineItemsForPeriods` en IStorage + ambas implementaciones. |
| `server/quickbooks/parse.ts` (modificar) | + función `parseProfitAndLossLineItems` (sin tocar la actual). |
| `server/quickbooks/sync.ts` (modificar) | Extender `syncProfitAndLoss` para escribir line items. SyncResult amplía con `lineItems: number`. |
| `server/routes.ts` (modificar) | + `GET /api/financials/line-items?period=YYYY-MM`. |
| `client/src/pages/finance.tsx` (modificar) | Borrar `MONTHLY_PL`. Añadir query + refactor de totales a find-by-name + empty state. |

---

## Task 1: Schema + tabla `financial_line_items`

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Añadir la tabla**

En `shared/schema.ts`, tras el bloque `quickbooksTokens` + `insertQuickbooksTokenSchema` (~líneas 285-301), antes del bloque `export type Job = ...`, añadir:

```ts
// P&L line items por mes (de QuickBooks Report Detail rows).
export const financialLineItems = pgTable("financial_line_items", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),         // "YYYY-MM"
  category: text("category").notNull(),     // "Revenue" | "Cost of Goods Sold" | "Operating Expenses"
  label: text("label").notNull(),           // e.g. "Vinyl Pellets"
  amount: real("amount").notNull(),         // RAW QB amount (positive — sign-flipping happens at endpoint)
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFinancialLineItemSchema = createInsertSchema(financialLineItems).omit({
  id: true,
  createdAt: true,
});
```

(`serial`, `integer`, `text`, `real`, `timestamp`, `pgTable`, `createInsertSchema` ya están importados.)

- [ ] **Step 2: Añadir tipos al final del archivo**

Al final de `shared/schema.ts`, tras `export type InsertQuickbooksToken = ...`, añadir:

```ts
export type FinancialLineItem = typeof financialLineItems.$inferSelect;
export type InsertFinancialLineItem = z.infer<typeof insertFinancialLineItemSchema>;
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run check`
Expected: PASS. (Existing storage.ts no usa la tabla nueva todavía — se hace en T3.)

- [ ] **Step 4: Crear tabla en Postgres (SQL directo, drizzle-kit pregunta interactivo)**

Run:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{ try { await p.query('CREATE TABLE IF NOT EXISTS financial_line_items (id serial PRIMARY KEY, period text NOT NULL, category text NOT NULL, label text NOT NULL, amount real NOT NULL, sort_order integer DEFAULT 0, created_at timestamp DEFAULT now())'); await p.query('CREATE INDEX IF NOT EXISTS financial_line_items_period_idx ON financial_line_items(period)'); console.log('financial_line_items + index created'); } finally { await p.end(); } })().catch(e=>{console.error('ERR:', e.message); process.exit(1);})"
```
Expected output: `financial_line_items + index created`.

- [ ] **Step 5: Verificar tabla**

Run:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name=\\'financial_line_items\\' ORDER BY ordinal_position').then(r=>{console.table(r.rows); return p.end();})"
```
Expected: 7 columnas (id, period, category, label, amount, sort_order, created_at) con tipos correctos.

- [ ] **Step 6: Commit**

```
git add shared/schema.ts
git commit -m "feat: financial_line_items table for P&L detail rows"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 2: Storage methods

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Ampliar type import**

En `server/storage.ts`, en el bloque `import type { ... } from "@shared/schema";`, añadir `FinancialLineItem, InsertFinancialLineItem`:

```ts
  QuickbooksToken, InsertQuickbooksToken,
  FinancialLineItem, InsertFinancialLineItem,
} from "@shared/schema";
```

- [ ] **Step 2: Ampliar imports de tablas**

En el bloque `import { ... } from "@shared/schema";` (tablas/values), añadir `financialLineItems`:

```ts
import {
  jobs, productionRuns, financials, maintenanceTasks, sensorReadings,
  inventory, arAging, shipments, leads, vendors, pressLogs, users,
  quickbooksTokens, financialLineItems,
} from "@shared/schema";
```

- [ ] **Step 3: Añadir `inArray` al import de drizzle-orm**

Cambiar la línea actual `import { eq, desc } from "drizzle-orm";` a:

```ts
import { eq, desc, inArray, asc } from "drizzle-orm";
```

- [ ] **Step 4: Añadir métodos a IStorage**

Dentro de `export interface IStorage { ... }`, antes de la llave de cierre, añadir:

```ts
  // Financial line items
  getLineItemsByPeriod(period: string): Promise<FinancialLineItem[]>;
  replaceLineItemsForPeriods(periods: string[], rows: InsertFinancialLineItem[]): Promise<void>;
```

- [ ] **Step 5: Implementar en DrizzleStorage**

Dentro de `class DrizzleStorage`, antes de su llave de cierre, añadir:

```ts
  // Financial line items
  async getLineItemsByPeriod(period: string): Promise<FinancialLineItem[]> {
    return db
      .select()
      .from(financialLineItems)
      .where(eq(financialLineItems.period, period))
      .orderBy(asc(financialLineItems.category), asc(financialLineItems.sortOrder));
  }
  async replaceLineItemsForPeriods(periods: string[], rows: InsertFinancialLineItem[]): Promise<void> {
    if (periods.length > 0) {
      await db.delete(financialLineItems).where(inArray(financialLineItems.period, periods));
    }
    if (rows.length > 0) {
      await db.insert(financialLineItems).values(rows);
    }
  }
```

- [ ] **Step 6: Implementar stubs en MemStorage**

Dentro de `class MemStorage`, añadir un campo Map junto a los otros:

```ts
  private lineItemsMap: Map<number, FinancialLineItem> = new Map();
```

Y los métodos:

```ts
  async getLineItemsByPeriod(period: string): Promise<FinancialLineItem[]> {
    return Array.from(this.lineItemsMap.values())
      .filter((r) => r.period === period)
      .sort((a, b) => {
        const c = a.category.localeCompare(b.category);
        return c !== 0 ? c : (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
  }
  async replaceLineItemsForPeriods(periods: string[], rows: InsertFinancialLineItem[]): Promise<void> {
    for (const [id, row] of this.lineItemsMap) {
      if (periods.includes(row.period)) this.lineItemsMap.delete(id);
    }
    for (const r of rows) {
      const id = this.getNextId();
      this.lineItemsMap.set(id, { ...(r as any), id, createdAt: new Date() } as FinancialLineItem);
    }
  }
```

- [ ] **Step 7: Verificar typecheck**

Run: `npm run check`
Expected: PASS. Tanto MemStorage como DrizzleStorage satisfacen IStorage. Si TS se queja de `asc` no usado en otros métodos previos, es nuevo aquí — no problem; si se queja por noUnusedImports, dejar pasar (no está habilitado en este proyecto).

- [ ] **Step 8: Commit**

```
git add server/storage.ts
git commit -m "feat: storage methods for financial line items (replace-by-period)"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 3: Parser de line items

**Files:**
- Modify: `server/quickbooks/parse.ts`

- [ ] **Step 1: Añadir la función nueva al final del archivo**

Añadir al FINAL de `server/quickbooks/parse.ts` (sin tocar la función existente `parseProfitAndLossReport`):

```ts
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
        if (amount === 0) continue; // saltar amounts vacíos para reducir ruido
        out.push({ period, category, label, amount, sortOrder: idx });
      }
    });
  }
  return out;
}
```

Nota: si `AnyRow` ya está declarado en el archivo (lo está, definido como `type AnyRow = any;` en el parser existente), no redeclararlo — la nueva función reusa el tipo. Si por alguna razón no estuviera disponible (no debería ser el caso), añadir `type AnyRow = any;` cerca de las nuevas funciones.

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Sanity check con fixture**

Crear archivo temporal `tmp-line-items-check.ts` en la raíz:

```ts
import { parseProfitAndLossLineItems } from "./server/quickbooks/parse";

const fixture = {
  Columns: {
    Column: [
      { ColTitle: "" },
      { ColTitle: "Jan 2026", MetaData: [{ Name: "StartDate", Value: "2026-01-01" }] },
      { ColTitle: "Feb 2026", MetaData: [{ Name: "StartDate", Value: "2026-02-01" }] },
      { ColTitle: "Total" },
    ],
  },
  Rows: {
    Row: [
      {
        Header: { ColData: [{ value: "Income" }, { value: "" }, { value: "" }, { value: "" }] },
        Rows: { Row: [
          { type: "Data", ColData: [{ value: "Pressing Revenue" }, { value: "32659.00" }, { value: "28400.00" }, { value: "61059.00" }] },
        ]},
        Summary: { ColData: [{ value: "Total Income" }, { value: "32659.00" }, { value: "28400.00" }, { value: "61059.00" }] },
        type: "Section",
        group: "Income",
      },
      {
        Header: { ColData: [{ value: "Cost of Goods Sold" }, { value: "" }, { value: "" }, { value: "" }] },
        Rows: { Row: [
          { type: "Data", ColData: [{ value: "Vinyl Pellets" }, { value: "4822.00" }, { value: "4200.00" }, { value: "9022.00" }] },
          { type: "Data", ColData: [{ value: "Labels" }, { value: "2393.00" }, { value: "2100.00" }, { value: "4493.00" }] },
        ]},
        Summary: { ColData: [{ value: "Total COGS" }, { value: "7215.00" }, { value: "6300.00" }, { value: "13515.00" }] },
        type: "Section",
        group: "COGS",
      },
      {
        Header: { ColData: [{ value: "Expenses" }, { value: "" }, { value: "" }, { value: "" }] },
        Rows: { Row: [
          { type: "Data", ColData: [{ value: "Rent" }, { value: "6150.00" }, { value: "6150.00" }, { value: "12300.00" }] },
        ]},
        Summary: { ColData: [{ value: "Total Expenses" }, { value: "6150.00" }, { value: "6150.00" }, { value: "12300.00" }] },
        type: "Section",
        group: "Expenses",
      },
    ],
  },
};

console.log(JSON.stringify(parseProfitAndLossLineItems(fixture), null, 2));
```

Run: `npx tsx tmp-line-items-check.ts`
Expected: 8 entradas (Pressing Revenue ×2 meses + Vinyl Pellets ×2 + Labels ×2 + Rent ×2), todas con amounts positivos en raw QB, sortOrder=0 para primer label de cada grupo, =1 para el segundo (Labels en COGS).

Ejemplo esperado (orden puede variar pero todas presentes):
```
{ period: "2026-01", category: "Revenue", label: "Pressing Revenue", amount: 32659, sortOrder: 0 }
{ period: "2026-02", category: "Revenue", label: "Pressing Revenue", amount: 28400, sortOrder: 0 }
{ period: "2026-01", category: "Cost of Goods Sold", label: "Vinyl Pellets", amount: 4822, sortOrder: 0 }
{ period: "2026-02", category: "Cost of Goods Sold", label: "Vinyl Pellets", amount: 4200, sortOrder: 0 }
{ period: "2026-01", category: "Cost of Goods Sold", label: "Labels", amount: 2393, sortOrder: 1 }
{ period: "2026-02", category: "Cost of Goods Sold", label: "Labels", amount: 2100, sortOrder: 1 }
{ period: "2026-01", category: "Operating Expenses", label: "Rent", amount: 6150, sortOrder: 0 }
{ period: "2026-02", category: "Operating Expenses", label: "Rent", amount: 6150, sortOrder: 0 }
```

Borrar el archivo: `Remove-Item tmp-line-items-check.ts`. Confirmar con `git status` que NO aparece.

- [ ] **Step 4: Commit**

```
git add server/quickbooks/parse.ts
git commit -m "feat: parser for QuickBooks P&L line items (detail rows per month)"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 4: Extender sync.ts

**Files:**
- Modify: `server/quickbooks/sync.ts`

- [ ] **Step 1: Ampliar import del parser**

En `server/quickbooks/sync.ts`, cambiar la línea:
```ts
import { parseProfitAndLossReport, type ParsedFinancial } from "./parse";
```
A:
```ts
import { parseProfitAndLossReport, parseProfitAndLossLineItems, type ParsedFinancial } from "./parse";
```

- [ ] **Step 2: Ampliar SyncResult**

Cambiar:
```ts
export interface SyncResult {
  periods: string[];
  updated: number;
}
```
A:
```ts
export interface SyncResult {
  periods: string[];
  updated: number;
  lineItems: number;
}
```

- [ ] **Step 3: Extender syncProfitAndLoss**

Localizar el cierre actual de la función (después de `await storage.updateQbLastSync(new Date());` y antes del `return { ... }`). Antes del `return`, añadir el bloque de line items:

```ts
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
```

Y cambiar el `return` para incluir `lineItems`:
```ts
  return { periods: rows.map((r) => r.period), updated: rows.length, lineItems: lineItemRowsForReplace.length };
```

Tras el cambio, `syncProfitAndLoss` queda con este flujo:
1. ensureValidAccessToken
2. fetch QB report
3. parse summary
4. upsertFinancialPartial por period
5. **parse line items** (nuevo)
6. **replaceLineItemsForPeriods** (nuevo)
7. updateQbLastSync
8. return summary

- [ ] **Step 4: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add server/quickbooks/sync.ts
git commit -m "feat: extend QB sync to persist P&L line items"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 5: Endpoint `/api/financials/line-items`

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Añadir endpoint**

En `server/routes.ts`, dentro de `registerRoutes`, después de los endpoints existentes de financials (busca el bloque que tiene `app.get("/api/financials", ...)` y `app.get("/api/ar-aging", ...)`), añadir tras ellos:

```ts
  app.get("/api/financials/line-items", async (req, res) => {
    const period = String(req.query.period || "");
    if (!period) {
      return res.status(400).json({ error: "period requerido" });
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: "period inválido (formato YYYY-MM)" });
    }
    const items = await storage.getLineItemsByPeriod(period);

    // Agrupar por category, sort por sortOrder, flip sign para COGS/OpEx.
    const order = ["Revenue", "Cost of Goods Sold", "Operating Expenses"];
    const grouped: Array<{ category: string; items: Array<{ label: string; amount: number }> }> = [];
    for (const category of order) {
      const matching = items
        .filter((i) => i.category === category)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      if (matching.length === 0) continue;
      const isExpense = category !== "Revenue";
      grouped.push({
        category,
        items: matching.map((i) => ({
          label: i.label,
          amount: isExpense ? -Math.abs(i.amount) : i.amount,
        })),
      });
    }
    res.json(grouped);
  });
```

Asegurarse de que esté DESPUÉS de `app.use("/api", requireAuth);` (lo está si lo pones donde indica).

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Verificar endpoint (sin datos aún — comportamiento empty)**

Start server: usar el patrón de tasks anteriores (Bash con `run_in_background` o equivalente PowerShell):
```
npm run dev
```
(Esperar ~6s a que aparezca `serving on port 5000`.)

Con curl (PowerShell — usar archivo temporal para body):
```
'{"username":"Admin","password":"OnyxCCD"}' | Out-File -Encoding ascii body.json
curl.exe -s -c c.txt -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" --data "@body.json" | Out-Null

# Sin period → 400
curl.exe -i -s -b c.txt "http://localhost:5000/api/financials/line-items"
# Period inválido → 400
curl.exe -i -s -b c.txt "http://localhost:5000/api/financials/line-items?period=bad"
# Period válido sin datos → 200 []
curl.exe -i -s -b c.txt "http://localhost:5000/api/financials/line-items?period=2026-04"

Remove-Item c.txt,body.json -ErrorAction SilentlyContinue
```

Expected:
- sin period: HTTP 400 `{"error":"period requerido"}`
- period malformado: HTTP 400 `{"error":"period inválido (formato YYYY-MM)"}`
- period válido sin datos: HTTP 200 `[]`

Stop server.

Si no puedes manejar el server fiable en background, reporta DONE_WITH_CONCERNS con lo obtenido; no dejes server corriendo.

- [ ] **Step 4: Commit**

```
git add server/routes.ts
git commit -m "feat: GET /api/financials/line-items endpoint (grouped + sign-flipped)"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 6: Frontend — eliminar MONTHLY_PL + useQuery + empty state

**Files:**
- Modify: `client/src/pages/finance.tsx`

**Contexto:** El archivo tiene un objeto hardcoded `MONTHLY_PL` (~líneas 28-142) y consume `pnlSections = MONTHLY_PL[selectedMonth] || MONTHLY_PL["2026-01"]` en línea ~371. El render usa `pnlSections.map(section => ...)` en línea ~541. Los totales en líneas ~372-374 usan acceso POSICIONAL: `pnlSections[0].items.reduce(...)`, `pnlSections[1].items.reduce(...)`, `pnlSections[2].items.reduce(...)`. Esto rompe si el array está vacío o tiene menos de 3 secciones. Refactorizar a find-by-name antes de añadir empty state.

- [ ] **Step 1: Borrar la constante `MONTHLY_PL`**

Borrar TODO el bloque que define `const MONTHLY_PL = { ... }` (aproximadamente líneas 28-142 — desde el comentario `/* ─── ... ─── */` que la precede hasta el `};` de cierre inclusive, manteniendo intactas las constantes anteriores como `MONTHS`/`MONTH_LABELS`/`MONTH_SHORT` y posteriores como `BALANCE_SHEETS`).

Conservar las constantes vecinas. Tras borrar, verificar con `npm run check` que TypeScript se queja de `MONTHLY_PL is not defined` en el consumer (~línea ~371). Es esperado; se arregla en Step 2-3.

- [ ] **Step 2: Reemplazar el lookup hardcoded con useQuery**

En el componente principal `Finance` (~línea 317), tras la línea `const [tab, setTab] = useState<FinanceTab>("pnl");` y junto a los otros `useQuery` (financials, arAging, jobs), añadir:

```tsx
  const pnlQuery = useQuery<Array<{ category: string; items: Array<{ label: string; amount: number }> }>>({
    queryKey: ["/api/financials/line-items", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/financials/line-items?period=${encodeURIComponent(selectedMonth)}`);
      return res.json();
    },
  });
```

- [ ] **Step 3: Refactorizar totales a find-by-name (resiliente a empty state)**

Reemplazar las líneas (~371-376):
```tsx
  const pnlSections = MONTHLY_PL[selectedMonth] || MONTHLY_PL["2026-01"];
  const revenue = pnlSections[0].items.reduce((s, i) => s + i.amount, 0);
  const totalCOGS = pnlSections[1].items.reduce((s, i) => s + i.amount, 0);
  const totalOpEx = pnlSections[2].items.reduce((s, i) => s + i.amount, 0);
  const grossProfit = revenue + totalCOGS;
  const netIncome = grossProfit + totalOpEx;
```
Por:
```tsx
  const pnlSections = pnlQuery.data ?? [];
  const sumSection = (name: string) =>
    (pnlSections.find((s) => s.category === name)?.items ?? []).reduce((s, i) => s + i.amount, 0);
  const revenue = sumSection("Revenue");
  const totalCOGS = sumSection("Cost of Goods Sold");
  const totalOpEx = sumSection("Operating Expenses");
  const grossProfit = revenue + totalCOGS;
  const netIncome = grossProfit + totalOpEx;
```

- [ ] **Step 4: Añadir empty state en el render de pnlSections**

Localizar el bloque que renderiza las secciones (`{pnlSections.map((section) => (`, ~línea 541). Reemplazar ese bloque envolviendo con un guard:

Antes:
```tsx
            <div className="space-y-1">
              {pnlSections.map((section) => (
                <div key={section.category}>
                  ...
                </div>
              ))}
            </div>
```

Después:
```tsx
            <div className="space-y-1">
              {pnlQuery.isLoading ? (
                <div className="text-white/40 text-sm py-6">Cargando…</div>
              ) : pnlSections.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-6 text-center">
                  <div className="text-white/60 text-sm">No hay desglose de P&amp;L para {selectedMonth}.</div>
                  <div className="text-white/40 text-xs mt-1">Sincroniza QuickBooks para ver el detalle.</div>
                </div>
              ) : (
                pnlSections.map((section) => (
                  <div key={section.category}>
                    ...
                  </div>
                ))
              )}
            </div>
```
Donde `...` es el contenido ORIGINAL del map (no lo reescribas — preserva lo que estaba renderizando cada section). Solo envuelves el `pnlSections.map(...)` original dentro de un ternario que cubre los tres estados (loading / empty / data).

- [ ] **Step 5: Verificar typecheck + build cliente**

Run: `npm run check`
Expected: PASS — no más referencias a `MONTHLY_PL`.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add client/src/pages/finance.tsx
git commit -m "feat: replace MONTHLY_PL hardcoded with /api/financials/line-items query + empty state"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 7: Verificación E2E completa (requiere QB conectado)

**Files:** ninguno (verificación).

Si el usuario no ha conectado QB en el navegador todavía (`/api/qb/status` devuelve `{connected:false}`), este task queda DONE_WITH_CONCERNS o BLOCKED esperando esa acción. Tasks 1-6 ya completan el código y typechequean.

- [ ] **Step 1: Confirmar QB conectado**

```
curl.exe -s -b c.txt http://localhost:5000/api/qb/status
```
Expected: `{"connected":true,"realmId":"...","environment":"sandbox","lastSyncAt":"..."}`.
Si `connected:false` → reportar BLOCKED, hacer en navegador: `/api/qb/connect`.

- [ ] **Step 2: Disparar sync y verificar conteo de line items**

```
curl.exe -s -b c.txt -X POST http://localhost:5000/api/qb/sync
```
Expected: `{"periods":[...12 meses...],"updated":12,"lineItems":N}` con N > 0.

Verificar en DB:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query('SELECT period, COUNT(*) FROM financial_line_items GROUP BY period ORDER BY period').then(r=>{console.table(r.rows); return p.end();})"
```
Expected: 12 filas (una por mes sincronizado) cada una con count > 0.

- [ ] **Step 3: Verificar endpoint con datos reales**

```
curl.exe -s -b c.txt "http://localhost:5000/api/financials/line-items?period=2026-04"
```
(Reemplazar `2026-04` por un mes que haya tenido actividad en QB sandbox.)
Expected: array con hasta 3 categorías (Revenue, Cost of Goods Sold, Operating Expenses), cada una con items `{label, amount}`. Amounts en COGS/OpEx en negativo. Items ordenados por sortOrder.

- [ ] **Step 4: Verificar frontend en navegador**

Abrir `/#/finance`. Cambiar el selector de mes:
- Meses sincronizados → desglose real con conceptos QB (en sandbox suele aparecer al menos Income y Expenses con datos de ejemplo).
- Mes vacío (borrar manualmente line items o seleccionar mes futuro fuera del rango sincronizado) → empty state "No hay desglose de P&L para YYYY-MM".

- [ ] **Step 5: Verificar replace-by-period (idempotencia)**

Borrar manualmente line items de un mes:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query(\"DELETE FROM financial_line_items WHERE period='2026-04'\").then(r=>{console.log('deleted:', r.rowCount); return p.end();})"
```
Cargar `/finance` mes 2026-04 → empty state.
Sync de nuevo → vuelve a haber line items, frontend muestra detalle.

- [ ] **Step 6 (sin commit — verificación)**

Reportar resultados. Sin commits.

---

## Verificación final

- [ ] `npm run check` → PASS.
- [ ] `npm run build` → PASS.
- [ ] `MONTHLY_PL` ya no aparece en client (`Select-String -Path client\src\**\*.tsx -Pattern MONTHLY_PL -ErrorAction SilentlyContinue` debería devolver 0 matches).
- [ ] Tabla `financial_line_items` creada con índice por `period`.
- [ ] `POST /api/qb/sync` devuelve `lineItems > 0`.
- [ ] `GET /api/financials/line-items?period=YYYY-MM` agrupado con sign flip correcto.
- [ ] Frontend muestra breakdown real para meses sincronizados, empty state para los demás.
- [ ] Sync repetido reemplaza line items (no duplica).
