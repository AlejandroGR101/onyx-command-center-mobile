# P1 — QuickBooks QB-4: Customer Mapping (jobs ↔ QB Customers) — Design

**Fecha:** 2026-06-02
**Rama:** p1-quickbooks-customer-mapping
**Riesgo cubierto:** R7 (parte 4 — foundation) — vincula `jobs.clientName` (texto libre hoy) a `qb_customers.id` para habilitar futuras queries por customer (invoices, payments, profitability real).
**Sub-proyecto P1 R7:** fase 4 de 4 (QB-1 ✅ → QB-2 ✅ → QB-3 ✅ → **QB-4**).

## Objetivo

Sincronizar la lista de Customers de QuickBooks Online a una tabla cache local, auto-emparejar `jobs.clientName` con `qb_customers.displayName` por nombre normalizado, y proveer una UI admin para corregir matches ambiguos o erróneos. No incluye cambios al formulario de creación de lead/job (Tier 3, futuro). No computa profitability real (futuro siguiente).

Fuera de alcance:
- Customer picker dropdown reemplazando `clientName` texto libre en formulario lead/job (Tier 3).
- Fetch de Invoices de QB para alimentar revenue per-customer (siguiente proyecto).
- Sync de Vendors (similar pero out of scope).

## Decisiones (brainstorming)

| Decisión | Elección |
|---|---|
| Alcance | Tier 1 (sync + auto-match) + Tier 2 (admin UI). Tier 3 (dropdown en creación) queda fuera. |
| Cache strategy | `qb_customers` snapshot via delete-all + insert. QB es source of truth. |
| Job link | Columna `jobs.qb_customer_id` (text, nullable, sin FK constraint formal). |
| Auto-match | Por nombre normalizado (lowercase, trim, collapse whitespace). Solo si match único. |
| Manual override | Vía PATCH `/api/jobs/:id` con `{qbCustomerId}` — endpoint existente lo soporta. |
| Sync integration | Nueva 4ª fase de `syncAll` (pl → bs → ar → customers). |
| UI location | Panel en finance.tsx debajo del QB status panel. Todo lo QB agrupado. |

## Estado actual relevante

- `jobs.clientName` es text libre (P0 schema). Sin FK ni vinculación.
- 12 jobs seed con clientNames como "Adam Bartlett", "Carrington Bornstien", "Puscifer Entertainment", etc.
- `clientName` se usa para display en 4 pages (finance, shipping, press-log, pipeline). El sync no afecta su display.
- `syncAll` existente (QB-3) corre P&L → BS → AR. Se extiende con `customers` como 4ª fase.
- PATCH `/api/jobs/:id` ya acepta cualquier campo del schema via `storage.updateJob(id, req.body)`. Añadir `qbCustomerId` al schema lo hace pasable automáticamente.
- finance.tsx tiene panel QB (Connect / Sync now / status). Buen lugar para el panel de mapping.

## Componentes

### Schema

```ts
export const qbCustomers = pgTable("qb_customers", {
  id: text("id").primaryKey(),           // QB Customer Id (string como devuelve QB)
  displayName: text("display_name").notNull(),
  active: boolean("active").default(true),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const insertQbCustomerSchema = createInsertSchema(qbCustomers).omit({
  syncedAt: true,
});
```

Y modificar tabla `jobs` para añadir:
```ts
  qbCustomerId: text("qb_customer_id"),  // FK lógica a qb_customers.id (sin constraint formal)
```

### Storage (`server/storage.ts`)

- `replaceQbCustomers(rows: InsertQbCustomer[]): Promise<void>` — delete all + insert (snapshot).
- `getQbCustomers(): Promise<QbCustomer[]>` — lista para UI.
- `autoMatchJobsToCustomers(): Promise<{matched: number; ambiguous: number}>` — para cada job con qbCustomerId NULL, buscar QB customer cuyo displayName normalizado coincida exactamente con clientName normalizado. Match único → update jobs.qbCustomerId. Ambiguo → contar y dejar null.
- (No nuevo endpoint para PATCH job; el existente PATCH `/api/jobs/:id` ya cubre el override manual via `storage.updateJob`.)

MemStorage stubs equivalentes.

### Parser (`server/quickbooks/parse.ts`)

```ts
export interface ParsedQbCustomer {
  id: string;
  displayName: string;
  active: boolean;
}

export function parseQbCustomers(json: AnyRow): ParsedQbCustomer[] {
  // QB query response shape: { QueryResponse: { Customer: [{Id, DisplayName, Active, ...}], maxResults, startPosition } }
  const customers = json?.QueryResponse?.Customer;
  if (!Array.isArray(customers)) return [];
  return customers
    .filter((c) => c?.Id != null && c?.DisplayName)
    .map((c) => ({
      id: String(c.Id),
      displayName: String(c.DisplayName),
      active: c.Active !== false,
    }));
}
```

### Sync (`server/quickbooks/sync.ts`)

```ts
export interface CustomersSyncResult {
  customers: number;
  autoMatched: number;
  ambiguous: number;
}

export async function syncQbCustomers(): Promise<CustomersSyncResult> {
  const { accessToken, realmId, environment } = await ensureValidAccessToken();
  // SELECT con MAXRESULTS 1000 (QB cap). Paginación queda como follow-up si Onyx supera 1000 customers.
  const sql = encodeURIComponent("SELECT Id, DisplayName, Active FROM Customer MAXRESULTS 1000");
  const url = `${apiBase(environment)}/v3/company/${realmId}/query?query=${sql}&minorversion=70`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`QB Customers API ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const parsed = parseQbCustomers(json);

  const rowsForReplace: InsertQbCustomer[] = parsed.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    active: c.active,
  }));
  await storage.replaceQbCustomers(rowsForReplace);

  const { matched, ambiguous } = await storage.autoMatchJobsToCustomers();
  return { customers: parsed.length, autoMatched: matched, ambiguous };
}
```

Extender `syncAll`:
```ts
export interface SyncAllResult {
  pl: SyncResult;
  bs: BSSyncResult;
  ar: ArSyncResult;
  customers: CustomersSyncResult;
}

export async function syncAll(months = 12): Promise<SyncAllResult> {
  const pl = await syncProfitAndLoss(months);
  const bs = await syncBalanceSheet(months);
  const ar = await syncArAging();
  const customers = await syncQbCustomers();
  return { pl, bs, ar, customers };
}
```

### Endpoint

```
GET /api/qb/customers
```
Auth: `requireAuth`. Devuelve lista de cached customers ordenada por `displayName`:
```json
[{ "id": "1", "displayName": "Adam Bartlett", "active": true }, ...]
```

PATCH `/api/jobs/:id` existente sirve para override manual con `{qbCustomerId}` o `{qbCustomerId: null}` para desvincular.

### Frontend (`client/src/pages/finance.tsx`)

Nuevo panel "Customer Mapping" justo debajo del panel QB status. Implementación:

- `useQuery<QbCustomer[]>` para `/api/qb/customers`.
- `useQuery<Job[]>` para `/api/jobs` (ya existe en la página o lo añadimos si no).
- Toggle "Solo unmatched" (default true).
- Tabla:
  - Columna 1: `jobId · clientName`.
  - Columna 2: dropdown `<select>` con customers (current selection = job.qbCustomerId, opción "— sin asignar —" = null).
  - Columna 3: botón "Guardar" → PATCH `/api/jobs/:id` con `{qbCustomerId}` + toast.
- Cambio individual: `useMutation` o handler ad-hoc; al éxito invalidar `/api/jobs`.

Layout simple, ~80 líneas JSX.

### Sync toast

En `handleQbSync`, ampliar el toast description para incluir customers:
```
"${plMonths} meses P&L · ${bsRows} líneas BS · ${arRows} AR rows · ${customersCount} customers (${autoMatched} matched)"
```
Y añadir invalidaciones para `/api/qb/customers` y `/api/jobs`.

## Algoritmo auto-match

```ts
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

async autoMatchJobsToCustomers() {
  const jobs = await this.getJobs(); // todos
  const customers = await this.getQbCustomers();
  const byNormalized = new Map<string, string[]>();
  for (const c of customers) {
    const k = normalize(c.displayName);
    const arr = byNormalized.get(k) ?? [];
    arr.push(c.id);
    byNormalized.set(k, arr);
  }
  let matched = 0, ambiguous = 0;
  for (const job of jobs) {
    if (job.qbCustomerId) continue; // ya matched, no tocar
    const k = normalize(job.clientName);
    const candidates = byNormalized.get(k) ?? [];
    if (candidates.length === 1) {
      await this.updateJob(job.id, { qbCustomerId: candidates[0] } as Partial<InsertJob>);
      matched++;
    } else if (candidates.length > 1) {
      ambiguous++;
    }
  }
  return { matched, ambiguous };
}
```

Nota: este auto-match NO sobrescribe matches existentes (respeta overrides manuales).

## Errores / edge cases

- QB Customer list vacía (raro) → `replaceQbCustomers([])` borra el cache, ningún match.
- Job con `qbCustomerId` inválido (apuntando a Customer que ya no existe en QB) → no se limpia automáticamente; el dropdown del UI mostraría id desconocido. **Defensive cleanup en T5 frontend:** opción "— sin asignar —" disponible siempre; admin lo arregla manualmente. Cleanup automático queda follow-up.
- Más de 1000 customers (cap MAXRESULTS) → log warning, sync solo los primeros 1000. Paginación follow-up.
- Multiple QB customers con mismo DisplayName → ambiguous, no auto-match, requiere override manual.

## Seguridad

- Mismo OAuth scope (Accounting). Sin secrets nuevos.
- `/api/qb/customers` bajo `requireAuth`. Devuelve solo displayName/active/id (no PII sensible más allá del nombre).
- Match no usa email u otros campos PII.

## Testing / verificación

Sin runner unitario. Manual:
1. Fixture `parseQbCustomers` con response simulada → array de 3 customers.
2. Tras sync real: tabla `qb_customers` con N filas. Algunos `jobs.qb_customer_id` populated (los nombres que matchean QB sandbox).
3. Endpoint `/api/qb/customers` devuelve lista ordenada.
4. Panel frontend: dropdown selecciona y guarda; PATCH `/api/jobs/:id` actualiza correctamente.
5. Toggle "Solo unmatched": filtra correctamente.

## Fuera de alcance

- Tier 3: Customer picker en formulario de creación de lead/job (reemplazar clientName libre).
- Sync de Vendors.
- Fetch Invoices para revenue per-customer.
- Cleanup automático de qbCustomerId que apunta a customer borrado en QB.
- Paginación de Customers > 1000.
