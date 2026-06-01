# P1 — QuickBooks QB-3: Balance Sheet + AR Aging + AP total — Design

**Fecha:** 2026-06-01
**Rama:** p1-quickbooks-bs-ar
**Riesgo cubierto:** R7 (parte 3) — reemplaza `BALANCE_SHEETS` hardcoded, alimenta `ar_aging` con datos QB reales, y actualiza `financials.cashPosition` / `arTotal` / `apTotal` (hoy seed/random).
**Sub-proyecto P1 R7:** fase 3 de 4 (QB-1 ✅ → QB-2 ✅ → **QB-3** → QB-4 customer mapping).

## Objetivo

Sincronizar tres reportes adicionales de QuickBooks Online:
1. **Balance Sheet** mensual (assets/liabilities/equity) → tabla nueva + endpoint + frontend reemplaza `BALANCE_SHEETS` hardcoded.
2. **Aged Receivables** → repuebla `ar_aging` (hoy seed estático).
3. **Side-effects** derivados de los reportes → actualizan `financials.cashPosition` (BS Total Bank Accounts), `apTotal` (BS Accounts Payable), `arTotal` (suma AR aging).

Manual sync (botón "Sync now" existente) + cron diario corren los 3 reportes vía orquestador `syncAll(months=12)` (que incluye también QB-1 P&L y QB-2 line items ya existentes).

Fuera de alcance:
- Detalle AP por bill (no hay UI para ello).
- Customer mapping (jobs ↔ QB Customers) → **QB-4**.
- Cash flow forecast / proyecciones.

## Decisiones (brainstorming)

| Decisión | Elección |
|---|---|
| AP scope | Solo total (BS Accounts Payable line) → `financials.apTotal`. Sin tabla `ap_aging`. |
| BS estructura | Hierarchical: preservar `indent` (depth) e `isBold` (Section headers + Total rows). Mantiene el shape que el frontend ya renderiza. |
| AR granularidad | Por invoice (matchea seed actual: customerName, amount, agingBucket, invoiceDate, invoiceNumber). |
| Replace strategy BS | Delete-by-period + insert (igual que line items). |
| Replace strategy AR | Delete-all + insert (snapshot point-in-time; AR es current, no histórico mensual). |
| Sync orchestration | Nuevo `syncAll(months)` ejecuta P&L → BS → AR en orden. Fail-fast en errores. POST `/api/qb/sync` y cron llaman `syncAll`. |

## Estado actual relevante

- Auth + DrizzleStorage + Postgres operativos (P0).
- QB-1: tokens, fetch ProfitAndLoss, parser summary, financials.revenue/cogs/operatingExpenses/netIncome.
- QB-2: financial_line_items + endpoint `/api/financials/line-items`. `syncProfitAndLoss` cubre summary + line items.
- `client/src/pages/finance.tsx`:
  - `BALANCE_SHEETS` constant (~líneas 52-100, Jan 2026 detallado).
  - Loop generador `for (const m of MONTHS) BALANCE_SHEETS[m] = ...` (~líneas 100-141) genera aproximaciones random para otros meses.
  - `bsSections = BALANCE_SHEETS[selectedMonth] || BALANCE_SHEETS["2026-01"]` (~línea 298).
  - Render `bsSections.map(...)` (~línea 583).
  - Banner "Showing summarized balance sheet ... Detailed line items available for January 2026 (from QuickBooks)" (~línea 615) — quita con datos reales.
- `ar_aging` table (12 filas seed) ya consumida en finance.tsx vía `/api/ar-aging`.
- `financials.cashPosition` / `arTotal` / `apTotal` permanecen seed/random (QB-1 upsert parcial NO los toca).
- `handleQbSync` invalida `/api/qb/status`, `/api/financials`, `/api/financials/line-items`. **Faltará** invalidar `/api/ar-aging` y `/api/financials/balance-sheet`.

## Componentes

### Nuevos

| Archivo | Responsabilidad |
|---|---|
| (sin archivos nuevos) | — Todo en archivos existentes. |

### Modificados

| Archivo | Cambio |
|---|---|
| `shared/schema.ts` | + tabla `balance_sheet_items` (id, period, section, label, amount real, indent integer, isBold boolean, sortOrder integer, createdAt). + insertSchema + tipos. |
| `server/storage.ts` | + IStorage: `getBalanceSheetByPeriod(period)`, `replaceBalanceSheetForPeriods(periods, rows)`, `replaceArAging(rows: InsertArAgingItem[])`, `updateFinancialMetrics(period, partial: { cashPosition?, arTotal?, apTotal? })`. Implementaciones en Drizzle + MemStorage. |
| `server/quickbooks/parse.ts` | + `parseBalanceSheet(json): ParsedBSItem[]`. + `extractCashPosition(parsed, period): number \| null`. + `extractApTotal(parsed, period): number \| null`. + `parseAgedReceivables(json): ParsedArRow[]`. + `extractArTotal(parsed): number`. Tipos `ParsedBSItem`, `ParsedArRow`. |
| `server/quickbooks/sync.ts` | + `syncBalanceSheet(months)`, `syncArAging()`, `syncAll(months=12)`. Cron y endpoint POST cambian a llamar `syncAll`. |
| `server/routes.ts` | + `GET /api/financials/balance-sheet?period=YYYY-MM`. `POST /api/qb/sync` ahora llama `syncAll`; respuesta `{pl, bs, ar}`. |
| `client/src/pages/finance.tsx` | Eliminar `BALANCE_SHEETS` + loop generador + tipos `BSLine`/`BSSection` locales (los del archivo siguen útiles pero la constante se va). Reemplazar con useQuery a `/api/financials/balance-sheet`. Loading + empty state. Quitar banner "summarized balance sheet". `handleQbSync` añade invalidaciones para `/api/financials/balance-sheet` y `/api/ar-aging`. |

### Esquema nuevo

```ts
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
```

Index en `period`. Importar `boolean` en schema.ts si no estuviera ya (sí lo está).

## Parser Balance Sheet

QB BalanceSheet con `summarize_column_by=Month` devuelve estructura:
```
Rows.Row[] (top level):
  - { Header.ColData[0]="ASSETS", Rows.Row[ ... ], Summary.ColData["TOTAL ASSETS", values...], group?: "Assets" }
  - { Header.ColData[0]="LIABILITIES AND EQUITY", Rows.Row[ ... ], Summary, group?: "Liabilities" }
    (children incluyen sub-secciones LIABILITIES y EQUITY)
```

Detectar `monthCols` (mismo helper que P&L parser).

Algoritmo recursivo `walkSection(rows, section, depth, sortOrderCounter)`:
- Para cada `row` en `rows`:
  - Si `row.Header.ColData`: emite una línea `{label = Header.ColData[0].value, amount = 0 para cada periodo (header sin amounts), indent = depth, isBold = true}`. Avanza sortOrder.
  - Si `row.Rows.Row`: recurse con `depth+1`.
  - Si `row.ColData` (data leaf, sin Rows children): emite una línea por periodo `{label = ColData[0].value, amount = ColData[i].value, indent = depth, isBold = false}`. Avanza sortOrder.
  - Si `row.Summary.ColData`: emite línea totalizadora `{label = Summary.ColData[0].value, amount = Summary.ColData[i].value, indent = depth, isBold = true}`. Avanza sortOrder.

`parseBalanceSheet(json)` top-level:
- Para cada sección top-level (Assets, Liabilities, Equity) — detectarla por `Header.ColData[0].value` matcheado contra `/^(ASSETS|LIABILITIES|EQUITY|LIABILITIES AND EQUITY)/i`. Si la sección es "LIABILITIES AND EQUITY" (combinada), descender a las sub-secciones para separar Liabilities vs Equity.
- Llamar `walkSection` con depth = 0 para children, depth = 0 para summary final ("TOTAL ASSETS" etc.).
- Cada emisión se asocia al `section` resuelto.

Output: `Array<{period, section, label, amount, indent, isBold, sortOrder}>` listos para insert.

### Helpers de extracción (alimentan financials)

```ts
function extractCashPosition(parsed: ParsedBSItem[], period: string): number | null {
  // Buscar el Total Bank Accounts del periodo (case insensitive, exact match preferido).
  const row = parsed.find(p =>
    p.period === period &&
    p.section === "Assets" &&
    /^total bank accounts$/i.test(p.label)
  );
  return row ? row.amount : null;
}

function extractApTotal(parsed: ParsedBSItem[], period: string): number | null {
  // Línea "Accounts Payable" (no "Total Accounts Payable" — esa es de un subgrupo). 
  // Si QB usa "Total Accounts Payable" como única, aceptar ambos.
  const row = parsed.find(p =>
    p.period === period &&
    p.section === "Liabilities" &&
    /^(accounts payable|total accounts payable|a\/p)$/i.test(p.label.trim())
  );
  return row ? row.amount : null;
}
```

## Parser AR (AgedReceivables)

QB report `AgedReceivables`:
- Columns: Customer, [Invoice Date, Number, Due Date, Days Past Due], Current, 1-30, 31-60, 61-90, 91+, Total
- Rows: una por invoice abierta (también puede agregar por customer; depende del report variant).

Para QB-3 usamos el variant **detail** (URL: `Reports/AgedReceivables?aging_method=Current&report_date=<today>&num_periods=4&past_due_only=false`). Si la API devuelve por customer (no detail), se acepta y se infiere bucket por columna con valor > 0.

Algoritmo `parseAgedReceivables(json)`:
- Detectar columnas: índices de aging buckets via ColTitle = "Current" / "1 - 30" / "31 - 60" / "61 - 90" / "91 and over" / similar. Normalizar a {current, "1-30", "31-60", "61-90", "91+"}.
- Si hay columnas Invoice Date / Num: extraer también.
- Para cada leaf row con `ColData`:
  - customerName = ColData[0].value (o columna Customer si nombrada).
  - Para cada bucket: si amount > 0, emitir una fila `{customerName, amount, agingBucket: bucket, invoiceDate?, invoiceNumber?, notes: null}`.
- Si la fila no tiene bucket con amount > 0 → skip.

`extractArTotal(rows)`: `rows.reduce((s, r) => s + r.amount, 0)`.

## Sync orchestration

`syncBalanceSheet(months = 12)`:
1. `ensureValidAccessToken`.
2. Fetch `Reports/BalanceSheet?summarize_column_by=Month&start_date=...&end_date=...&accounting_method=Accrual&minorversion=70`.
3. `parsed = parseBalanceSheet(json)`. Si `parsed.length === 0` → throw "BS report sin estructura esperada".
4. Por cada periodo en `[startDate..endDate]` rango: rows = parsed.filter(p=>p.period===period). DELETE WHERE period=X + INSERT rows.
5. Por cada period: `cash = extractCashPosition(parsed, period)`, `ap = extractApTotal(parsed, period)`. Si alguno no null → `storage.updateFinancialMetrics(period, { cashPosition: cash, apTotal: ap })`.
6. Return `{periods, updated: parsed.length}`.

`syncArAging()`:
1. `ensureValidAccessToken`.
2. Fetch `Reports/AgedReceivables?report_date=<today>&num_periods=4&aging_method=Current`.
3. `rows = parseAgedReceivables(json)`. Si `rows.length === 0` → permitido (cero deudas).
4. `storage.replaceArAging(rows.map(...))`.
5. `arTotal = extractArTotal(rows)`. Update `financials.arTotal` para period = mes actual (YYYY-MM derivado de today). 
6. Return `{count: rows.length, arTotal}`.

`syncAll(months = 12)`:
```ts
const pl = await syncProfitAndLoss(months);
const bs = await syncBalanceSheet(months);
const ar = await syncArAging();
return { pl, bs, ar };
```

POST `/api/qb/sync` → llama `syncAll`. Cron también. Si cualquiera falla → propaga error (fail-fast).

## Endpoint BS

```
GET /api/financials/balance-sheet?period=YYYY-MM
```
Auth: `requireAuth`. Validación period 400 si malformado.

Lógica:
- items = storage.getBalanceSheetByPeriod(period) (ordenados por sortOrder).
- Agrupar por section en orden: Assets → Liabilities → Equity. Omitir secciones vacías.
- Output:
```json
[
  { "heading": "Assets", "lines": [{ "label": "...", "amount": 0, "indent": 0, "bold": true }, ...] },
  { "heading": "Liabilities", "lines": [...] },
  { "heading": "Equity", "lines": [...] }
]
```
Shape coincide con el `BSSection[]` que el frontend ya renderiza (heading, lines: {label, amount, indent, bold}).

## Frontend

1. Eliminar líneas 52-141 (constantes `BSLine`, `BSSection`, `BALANCE_SHEETS`, loop generador). Conservar el render `bsSections.map(...)` que usa `BSLine`/`BSSection` por su shape — declarar los tipos inline o derivar de useQuery.
2. Añadir:
```tsx
type BSLine = { label: string; amount: number; indent?: number; bold?: boolean };
type BSSection = { heading: string; lines: BSLine[] };

const bsQuery = useQuery<BSSection[]>({
  queryKey: ["/api/financials/balance-sheet", selectedMonth],
  queryFn: async () => {
    const res = await apiRequest("GET", `/api/financials/balance-sheet?period=${encodeURIComponent(selectedMonth)}`);
    return res.json();
  },
});
const bsSections = bsQuery.data ?? [];
```
3. Render BS sections wrapped con loading/empty state:
```tsx
{bsQuery.isLoading ? <Cargando/> : bsSections.length === 0 ? <EmptyState/> : bsSections.map(...)}
```
4. Quitar el banner "Showing summarized balance sheet" (línea ~615).
5. En `handleQbSync` añadir:
```tsx
qc.invalidateQueries({ queryKey: ["/api/financials/balance-sheet"] });
qc.invalidateQueries({ queryKey: ["/api/ar-aging"] });
```
6. El toast tras sync ahora describe los 3 datasets:
```ts
toast({
  title: "QuickBooks sync OK",
  description: `${data.pl.updated} meses P&L, ${data.bs.updated} líneas BS, ${data.ar.count} AR rows`,
});
```

## Errores / edge cases

- BS report estructura inesperada (no encuentra Assets/Liabilities/Equity) → log + throw → endpoint 502.
- Sin Total Bank Accounts en BS → `cashPosition` queda como estaba (no se actualiza esa columna).
- AR sin invoices → tabla queda vacía; arTotal = 0.
- `updateFinancialMetrics` para periodo que no existe en `financials` → crear fila vacía con esos campos (default 0 para P&L cols).
- Concurrencia con QB-1/2 sync → secuencial dentro de `syncAll`; sin solapamiento.

## Seguridad

- Mismo scope OAuth (Accounting). Sin nuevos secrets.
- Endpoint BS bajo `requireAuth`.
- Datos BS y AR son internos; no se exponen externamente.

## Testing / verificación

Sin runner unitario. Manual:
1. Fixture para `parseBalanceSheet` y `parseAgedReceivables` con `tmp-*-check.ts` (escribir, ejecutar, borrar).
2. Tras browser OAuth + click Sync: `POST /api/qb/sync` devuelve `{pl, bs, ar}` con counts > 0.
3. Tablas: 
   - `balance_sheet_items` filas > 0 por periodo.
   - `ar_aging` filas = real QB customers.
   - `financials.cashPosition/arTotal/apTotal` distintos a seed.
4. Frontend: BS real al cambiar selector mes; KPI cards reflejan cash/ar/ap reales.
5. Sync repetido: idempotente (BS delete-by-period; AR delete-all-insert).

## Fuera de alcance

- Detalle AP por bill (no UI hoy).
- Customer mapping → **QB-4**.
- Cash flow forecast.
- Multi-currency.
