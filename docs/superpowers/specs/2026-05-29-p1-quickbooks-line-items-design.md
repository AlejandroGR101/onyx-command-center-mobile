# P1 — QuickBooks QB-2: P&L Line Items — Design

**Fecha:** 2026-05-29
**Rama:** p1-quickbooks-line-items
**Riesgo cubierto:** R7 (parte 2) — reemplaza el desglose de P&L hardcoded (`MONTHLY_PL` en `client/src/pages/finance.tsx`) con line items reales de QuickBooks Online.
**Sub-proyecto P1:** fase 2 de 4 (QB-1 ✅ → **QB-2** → QB-3 BS+AR+AP → QB-4 customer mapping).

## Objetivo

Sincronizar las filas detalle (Detail rows) del reporte ProfitAndLoss de QuickBooks por mes — bajo cada grupo (Income / COGS / Expenses) — y exponerlas vía endpoint para que la página de finanzas muestre el desglose por categoría con los conceptos reales (Vinyl Pellets, Labels, Rent, etc.) en lugar del `MONTHLY_PL` hardcoded.

Fuera de alcance:
- Balance Sheet → **QB-3**.
- AR aging / AP → **QB-3**.
- Customer mapping → **QB-4**.
- Secciones Other Income / Other Expense de QB (si existen) — se ignoran en QB-2; se incluyen en seguimiento solo si aparecen en el reporte real y se considera necesario.

## Decisiones

| Decisión | Elección |
|---|---|
| Fuente de datos | Reusar la llamada existente `Reports/ProfitAndLoss?summarize_column_by=Month` (QB-1). Una sola API call cubre summary + line items. |
| Categorías | Income → Revenue, COGS → Cost of Goods Sold, Expenses → Operating Expenses. |
| Estrategia de upsert | Delete-by-period + insert. Mantiene la tabla consistente si QB renombra/quita líneas. |
| Sign convention | Storage: raw QB (positivo). Endpoint: flip negativo para COGS/Expenses para que el frontend reciba la shape UI sin transformar. |
| Fallback sin datos | Empty state "No P&L data — Sync QuickBooks". Eliminar `MONTHLY_PL` hardcoded por completo. |
| Sort | Conservar orden de QB (sortOrder = índice dentro del grupo). |

## Estado actual relevante

- `client/src/pages/finance.tsx` (~803 líneas):
  - `MONTHLY_PL` (líneas ~28-142) hardcoded `{ "2026-01": [{category, items: [{label, amount}]}], ... }`.
  - Renderiza `pnlSections = MONTHLY_PL[selectedMonth] || MONTHLY_PL["2026-01"]`.
- `server/quickbooks/sync.ts` ya hace fetch del reporte y parsea summary vía `parseProfitAndLossReport`. La response trae los Detail rows pero hoy se descartan.
- `server/quickbooks/parse.ts` existe; añadiremos una función nueva sin tocar la existente.
- `financials.period` tiene unique constraint (QB-1). Reutilizable como ancla lógica, aunque la nueva tabla guarda period como text (no FK formal — drizzle no genera FK por defecto, y el delete-by-period funciona igual).

## Componentes

### Nuevos

| Archivo | Responsabilidad |
|---|---|
| (nada nuevo aparte de tabla + función en archivos existentes) | — |

Sin archivos nuevos. Todo se añade a archivos existentes (parser, sync, schema, storage, routes, finance.tsx).

### Modificados

| Archivo | Cambio |
|---|---|
| `shared/schema.ts` | + tabla `financial_line_items` (id serial PK, period text notNull, category text notNull, label text notNull, amount real notNull, sortOrder integer default 0, createdAt timestamp defaultNow). + `insertFinancialLineItemSchema` (omit id, createdAt). + tipos `FinancialLineItem`, `InsertFinancialLineItem`. |
| `server/storage.ts` | + en `IStorage`: `getLineItemsByPeriod(period: string): Promise<FinancialLineItem[]>` y `replaceLineItemsForPeriods(periods: string[], rows: InsertFinancialLineItem[]): Promise<void>`. Implementaciones en `DrizzleStorage` (delete WHERE period IN (...) + insert bulk) y stubs en `MemStorage`. |
| `server/quickbooks/parse.ts` | + función `parseProfitAndLossLineItems(json): Array<{period, category, label, amount, sortOrder}>`. Reutiliza la lógica de detección de columnas mensuales (copiada inline para mantener el archivo simple). |
| `server/quickbooks/sync.ts` | `syncProfitAndLoss`: tras `upsertFinancialPartial` por period, parsear line items con la nueva función y llamar `storage.replaceLineItemsForPeriods(rows.map(r=>r.period), lineItemRows)`. Devolver `{ periods, updated, lineItems: lineItemRows.length }` en `SyncResult`. |
| `server/routes.ts` | + `GET /api/financials/line-items?period=YYYY-MM` (tras `requireAuth`). Valida formato de period (400 si no `^\d{4}-\d{2}$`). Llama `storage.getLineItemsByPeriod`, agrupa por category, ordena items por sortOrder, **flip sign** para categories `Cost of Goods Sold` y `Operating Expenses` (amount = -|amount|). Devuelve `[{category, items: [{label, amount}]}]`. |
| `client/src/pages/finance.tsx` | **Eliminar** la constante `MONTHLY_PL` (~líneas 28-142) y su uso en `pnlSections = MONTHLY_PL[selectedMonth] || ...`. Sustituir con `useQuery(["/api/financials/line-items", selectedMonth])` parametrizado por mes seleccionado. Si `data` está vacío → mostrar empty state ("No hay desglose de P&L para este mes. Sincroniza QuickBooks para ver detalle."). |

### Nueva tabla — esquema

```ts
export const financialLineItems = pgTable("financial_line_items", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),         // "YYYY-MM"
  category: text("category").notNull(),     // "Revenue" | "Cost of Goods Sold" | "Operating Expenses"
  label: text("label").notNull(),           // e.g. "Vinyl Pellets"
  amount: real("amount").notNull(),         // RAW QB amount (positive)
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
```

Sin FK explícita a `financials` (Drizzle convencional aquí; el lifecycle se mantiene vía replace-by-period). Sin unique constraint compuesto (puede haber misma label en distintos meses, y delete-by-period garantiza no duplicados).

## Parser nuevo

`parseProfitAndLossLineItems(json)`:
- Extrae `monthCols` (mismo helper que el parser de summary — copiar inline).
- Mapeo grupo QB → categoría persistida:
  - `Income` → `Revenue`
  - `COGS` → `Cost of Goods Sold`
  - `Expenses` → `Operating Expenses`
- Para cada grupo: buscar la fila top-level con `r.group === <name>`. Recorrer sus `r.Rows.Row[]` excluyendo Summary y subgrupos sin ColData; cada fila detalle tiene `ColData[0].value = label` y los valores monthly empiezan en columna i (índice de monthCols).
- Emite una entrada por (mes, label) con `sortOrder` = índice de la fila dentro del grupo.
- Amounts via `toNumber` (mismo helper).
- Si label vacío o todos los amounts del mes son 0 → omite ese (mes, label) — evita filas inútiles. Decisión: incluir filas con al menos un valor != 0 en cualquier mes; si label vacío, omitir completamente.

## Sync flow extendido

```
syncProfitAndLoss(12):
  ... (existente: tokens, fetch, parse summary, upsert summary) ...
  const lineItemRows = parseProfitAndLossLineItems(json);
  const periods = rows.map(r => r.period);
  await storage.replaceLineItemsForPeriods(periods, lineItemRows);
  await storage.updateQbLastSync(new Date());
  return { periods, updated: rows.length, lineItems: lineItemRows.length };
```

`replaceLineItemsForPeriods(periods, rows)` (DrizzleStorage):
```sql
DELETE FROM financial_line_items WHERE period = ANY($1)
INSERT INTO financial_line_items (...) VALUES (...) -- bulk
```
Sin transacción explícita en QB-2 (riesgo aceptable: si el insert falla tras delete, la tabla queda parcialmente vacía hasta el siguiente sync, que es idempotente). Si más adelante se quiere atomicidad, envolver en `db.transaction()`.

## Endpoint

```
GET /api/financials/line-items?period=2026-04
```
Auth: `requireAuth`.

Validación:
- `period` requerido. Si ausente → 400 `{error:"period requerido"}`.
- Match `^\d{4}-\d{2}$`. Si no → 400 `{error:"period inválido"}`.

Lógica:
- `items = await storage.getLineItemsByPeriod(period)` (ya ordenados por category, sortOrder en Drizzle).
- Agrupar por category preservando orden de aparición: Revenue → Cost of Goods Sold → Operating Expenses. Si una categoría no tiene items, omitirla.
- Para items en categories `Cost of Goods Sold` y `Operating Expenses`: `amount = -Math.abs(amount)`.
- Response: `[{category, items: [{label, amount}]}]`.

## Frontend (finance.tsx)

1. Borrar:
   - `MONTHLY_PL` constant (~líneas 28-142).
   - `const pnlSections = MONTHLY_PL[selectedMonth] || MONTHLY_PL["2026-01"];`

2. Añadir:
```tsx
const pnlQuery = useQuery<Array<{ category: string; items: Array<{ label: string; amount: number }> }>>({
  queryKey: ["/api/financials/line-items", selectedMonth],
  queryFn: () =>
    fetch(`/api/financials/line-items?period=${encodeURIComponent(selectedMonth)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
});
const pnlSections = pnlQuery.data ?? [];
```

3. En el JSX donde se renderizan las secciones P&L, envolver con:
```tsx
{pnlQuery.isLoading ? (
  <div className="text-white/40 text-sm">Cargando…</div>
) : pnlSections.length === 0 ? (
  <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-6 text-center">
    <div className="text-white/60 text-sm">No hay desglose de P&L para {selectedMonth}.</div>
    <div className="text-white/40 text-xs mt-1">Sincroniza QuickBooks para ver el detalle.</div>
  </div>
) : (
  /* render existente de pnlSections */
)}
```

El selector de mes (`selectedMonth`) ya existe; el query se re-ejecuta automáticamente al cambiar.

## Errores / edge cases

- Endpoint sin `period` o malformado → 400 con mensaje claro.
- Period sin datos → 200 `[]` (no es error). Frontend muestra empty state.
- Parser: si un grupo no existe (ej. negocio sin COGS) → simplemente no emite filas para esa categoría. Empty array OK.
- Sync API falla → mismo error path de QB-1; no se modifican line items.
- Race condition mientras sync corre + frontend pide line items → momentary empty (después del delete, antes del insert). Aceptable para QB-2 (raro, recovery automático al siguiente request).

## Seguridad

- Sin secretos nuevos. Mismo tokens/scope que QB-1.
- Endpoint protegido por `requireAuth` (la sesión cubre cookies de la app).
- Sin información sensible en el response (solo labels y amounts agregados).

## Testing / verificación

Sin runner unitario salvo Playwright (no aplica). Manual:

1. Tras QB sync browser: 
   ```sql
   SELECT period, count(*) FROM financial_line_items GROUP BY period ORDER BY period;
   ```
   Esperado: 12 filas (una por mes sincronizado) con counts > 0.
2. `curl -b cookies http://localhost:5000/api/financials/line-items?period=2026-04` → 200 con array agrupado, COGS/OpEx en negativo, items en orden.
3. Frontend: cambiar selector → muestra breakdown real. Mes sin datos en DB → empty state.
4. Borrar manualmente line items de un mes → frontend ese mes muestra empty state.
5. Sync de nuevo → vuelve a mostrar breakdown (delete-by-period limpia + insert).

## Fuera de alcance

- Balance Sheet (QB-3), AR (QB-3), AP (QB-3).
- Customer mapping (QB-4).
- Exportar/descargar el detalle.
- Histórico antes de 12 meses.
