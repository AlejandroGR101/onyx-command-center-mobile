# P1 QB-4 — Customer Mapping (jobs ↔ QB Customers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar la lista de QB Customers a un cache local, auto-emparejar `jobs.clientName` con `qb_customers.displayName` por nombre normalizado, y exponer un panel admin en finance.tsx para corregir matches manualmente.

**Architecture:** Nueva tabla cache `qb_customers` (snapshot delete + insert). Nueva columna `jobs.qb_customer_id`. Parser nuevo `parseQbCustomers`, sync nuevo `syncQbCustomers` añadido como 4ª fase de `syncAll`. PATCH `/api/jobs/:id` existente cubre override manual. Endpoint GET `/api/qb/customers` para UI dropdown. Panel "Customer Mapping" en finance.tsx.

**Tech Stack:** Drizzle + Postgres, intuit-oauth (existente), React + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-06-02-p1-quickbooks-customer-mapping-design.md`

**Branch:** `p1-quickbooks-customer-mapping` (creada desde main).

**Nota testing:** Sin runner unitario. Verificación: `npm run check` (tsc), `npm run build`, fixture parser, curl al endpoint, navegador para mapping UI.

**Prerequisitos del usuario para T7 E2E:** QB conectado (OAuth completado). Tasks 1-6 son code-only y typechequean sin esto.

---

## File Structure

| Archivo | Cambio |
|---|---|
| `shared/schema.ts` | + tabla `qb_customers` + columna `jobs.qb_customer_id` + tipos. |
| `server/storage.ts` | + 3 métodos IStorage + impls. |
| `server/quickbooks/parse.ts` | + `parseQbCustomers`. |
| `server/quickbooks/sync.ts` | + `syncQbCustomers` + extender `syncAll`. |
| `server/routes.ts` | + `GET /api/qb/customers`. |
| `client/src/pages/finance.tsx` | + panel Customer Mapping + actualizar toast/invalidations. |

---

## Task 1: Schema + columna + SQL apply

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Añadir columna `qbCustomerId` a tabla `jobs`**

En `shared/schema.ts`, localizar la definición de `jobs` (líneas ~6-28). Tras la columna `specialInstructions` (última actual), añadir:

```ts
  qbCustomerId: text("qb_customer_id"),
```

Asegurar que la coma de la línea anterior queda correcta.

- [ ] **Step 2: Añadir tabla qb_customers**

Tras el bloque `balanceSheetItems` + `insertBalanceSheetItemSchema` (de QB-3), antes del bloque `export type Job = ...`, añadir:

```ts
// QuickBooks Customers cache (jobs ↔ QB Customer mapping).
export const qbCustomers = pgTable("qb_customers", {
  id: text("id").primaryKey(),                  // QB Customer Id (string)
  displayName: text("display_name").notNull(),
  active: boolean("active").default(true),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const insertQbCustomerSchema = createInsertSchema(qbCustomers).omit({
  syncedAt: true,
});
```

- [ ] **Step 3: Tipos al final del archivo**

Tras `export type InsertBalanceSheetItem = ...`, añadir:

```ts
export type QbCustomer = typeof qbCustomers.$inferSelect;
export type InsertQbCustomer = z.infer<typeof insertQbCustomerSchema>;
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run check`
Expected: PASS. `jobs.qbCustomerId` queda opcional en `InsertJob` y `Job` (no `.notNull()`).

- [ ] **Step 5: Aplicar cambios en Postgres**

Run:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{ try { await p.query(\"ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qb_customer_id text\"); await p.query(\"CREATE TABLE IF NOT EXISTS qb_customers (id text PRIMARY KEY, display_name text NOT NULL, active boolean DEFAULT true, synced_at timestamp DEFAULT now())\"); console.log('schema applied'); } finally { await p.end(); } })().catch(e=>{console.error('ERR:', e.message); process.exit(1);})"
```
Expected: `schema applied`.

- [ ] **Step 6: Verificar columnas y tabla**

Run:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{ const c=await p.query(\"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='jobs' AND column_name='qb_customer_id'\"); const t=await p.query(\"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='qb_customers' ORDER BY ordinal_position\"); console.log('jobs.qb_customer_id:', c.rows); console.log('qb_customers cols:'); console.table(t.rows); await p.end(); })()"
```
Expected: `jobs.qb_customer_id` aparece con type `text`. `qb_customers` con 4 columnas (id text, display_name text, active boolean, synced_at timestamp).

- [ ] **Step 7: Commit**

```
git add shared/schema.ts
git commit -m "feat: qb_customers table + jobs.qb_customer_id column for QB-4 mapping"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 2: Storage methods

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Ampliar type import**

En el bloque `import type { ... } from "@shared/schema";`, añadir `QbCustomer, InsertQbCustomer`:
```ts
  BalanceSheetItem, InsertBalanceSheetItem,
  QbCustomer, InsertQbCustomer,
} from "@shared/schema";
```

- [ ] **Step 2: Ampliar table-value import**

En el bloque de tablas, añadir `qbCustomers`. Línea final:
```ts
  quickbooksTokens, financialLineItems, balanceSheetItems, qbCustomers,
} from "@shared/schema";
```

- [ ] **Step 3: Añadir métodos a IStorage**

Dentro de `export interface IStorage { ... }`, antes de la llave de cierre, añadir:

```ts
  // QuickBooks Customers + jobs mapping
  getQbCustomers(): Promise<QbCustomer[]>;
  replaceQbCustomers(rows: InsertQbCustomer[]): Promise<void>;
  autoMatchJobsToCustomers(): Promise<{ matched: number; ambiguous: number }>;
```

- [ ] **Step 4: Implementar en DrizzleStorage**

Dentro de `class DrizzleStorage`, antes de su llave de cierre, añadir:

```ts
  // QuickBooks Customers
  async getQbCustomers(): Promise<QbCustomer[]> {
    return db.select().from(qbCustomers).orderBy(asc(qbCustomers.displayName));
  }
  async replaceQbCustomers(rows: InsertQbCustomer[]): Promise<void> {
    await db.delete(qbCustomers);
    if (rows.length > 0) {
      await db.insert(qbCustomers).values(rows);
    }
  }
  async autoMatchJobsToCustomers(): Promise<{ matched: number; ambiguous: number }> {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const customers = await db.select().from(qbCustomers);
    const byNorm = new Map<string, string[]>();
    for (const c of customers) {
      const k = normalize(c.displayName);
      const arr = byNorm.get(k) ?? [];
      arr.push(c.id);
      byNorm.set(k, arr);
    }
    const allJobs = await db.select().from(jobs);
    let matched = 0;
    let ambiguous = 0;
    for (const job of allJobs) {
      if (job.qbCustomerId) continue; // respeta override existente
      const candidates = byNorm.get(normalize(job.clientName)) ?? [];
      if (candidates.length === 1) {
        await db.update(jobs).set({ qbCustomerId: candidates[0] }).where(eq(jobs.id, job.id));
        matched++;
      } else if (candidates.length > 1) {
        ambiguous++;
      }
    }
    return { matched, ambiguous };
  }
```

- [ ] **Step 5: Implementar stubs en MemStorage**

Dentro de `class MemStorage`, añadir un Map junto a los otros:
```ts
  private qbCustomersMap: Map<string, QbCustomer> = new Map();
```
Y los métodos:
```ts
  async getQbCustomers(): Promise<QbCustomer[]> {
    return Array.from(this.qbCustomersMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }
  async replaceQbCustomers(rows: InsertQbCustomer[]): Promise<void> {
    this.qbCustomersMap.clear();
    for (const r of rows) {
      this.qbCustomersMap.set(r.id, { ...(r as any), syncedAt: new Date() } as QbCustomer);
    }
  }
  async autoMatchJobsToCustomers(): Promise<{ matched: number; ambiguous: number }> {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const customers = Array.from(this.qbCustomersMap.values());
    const byNorm = new Map<string, string[]>();
    for (const c of customers) {
      const k = normalize(c.displayName);
      const arr = byNorm.get(k) ?? [];
      arr.push(c.id);
      byNorm.set(k, arr);
    }
    let matched = 0;
    let ambiguous = 0;
    for (const job of Array.from(this.jobs.values())) {
      if (job.qbCustomerId) continue;
      const candidates = byNorm.get(normalize(job.clientName)) ?? [];
      if (candidates.length === 1) {
        const updated = { ...job, qbCustomerId: candidates[0] } as typeof job;
        this.jobs.set(job.id, updated);
        matched++;
      } else if (candidates.length > 1) {
        ambiguous++;
      }
    }
    return { matched, ambiguous };
  }
```

Note: `this.jobs` ya existe en MemStorage como `Map<number, Job>`. Verifica el nombre real (puede ser `jobsMap` u otro); si difiere, ajusta. Report what you used.

- [ ] **Step 6: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```
git add server/storage.ts
git commit -m "feat: storage methods for qb_customers + autoMatchJobsToCustomers"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 3: Parser parseQbCustomers + fixture

**Files:**
- Modify: `server/quickbooks/parse.ts`

- [ ] **Step 1: Añadir parser al final del archivo**

Al final de `server/quickbooks/parse.ts`, añadir:

```ts
export interface ParsedQbCustomer {
  id: string;
  displayName: string;
  active: boolean;
}

export function parseQbCustomers(json: AnyRow): ParsedQbCustomer[] {
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

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Sanity check con fixture**

Crear `tmp-customers-check.ts` en la raíz:

```ts
import { parseQbCustomers } from "./server/quickbooks/parse";

const fixture = {
  QueryResponse: {
    Customer: [
      { Id: "1", DisplayName: "Adam Bartlett", Active: true, PrimaryEmailAddr: { Address: "a@b.com" } },
      { Id: "2", DisplayName: "Puscifer Entertainment", Active: true },
      { Id: "3", DisplayName: "Old Customer Inactive", Active: false },
      { Id: "4", DisplayName: "" }, // debería ser filtrado (sin name)
      { DisplayName: "No Id Customer" }, // debería ser filtrado (sin Id)
    ],
    maxResults: 5,
    startPosition: 1,
  },
};

console.log(JSON.stringify(parseQbCustomers(fixture), null, 2));
```

Run: `npx tsx tmp-customers-check.ts`

Expected output (JSON, 3 entries, los inválidos filtrados):
```json
[
  { "id": "1", "displayName": "Adam Bartlett", "active": true },
  { "id": "2", "displayName": "Puscifer Entertainment", "active": true },
  { "id": "3", "displayName": "Old Customer Inactive", "active": false }
]
```

Borrar `tmp-customers-check.ts`: `Remove-Item tmp-customers-check.ts` (o `rm`). Confirmar no aparece en `git status`.

- [ ] **Step 4: Commit**

```
git add server/quickbooks/parse.ts
git commit -m "feat: parser for QB Customer query response"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 4: sync.ts — syncQbCustomers + extend syncAll

**Files:**
- Modify: `server/quickbooks/sync.ts`

- [ ] **Step 1: Ampliar parser import**

Cambiar la línea de import de `./parse` para incluir `parseQbCustomers`:
```ts
import {
  parseProfitAndLossReport,
  parseProfitAndLossLineItems,
  parseBalanceSheet,
  parseAgedReceivables,
  parseQbCustomers,
  extractCashPosition,
  extractApTotal,
  extractArTotal,
  type ParsedFinancial,
} from "./parse";
```

- [ ] **Step 2: Añadir type import**

Añadir junto a los otros type imports de `@shared/schema`:
```ts
import type { InsertArAgingItem, InsertBalanceSheetItem, InsertQbCustomer } from "@shared/schema";
```

- [ ] **Step 3: Añadir syncQbCustomers**

Tras `syncArAging` (y antes de `syncAll`), añadir:

```ts
export interface CustomersSyncResult {
  customers: number;
  autoMatched: number;
  ambiguous: number;
}

export async function syncQbCustomers(): Promise<CustomersSyncResult> {
  const { accessToken, realmId, environment } = await ensureValidAccessToken();
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

- [ ] **Step 4: Extender SyncAllResult y syncAll**

Cambiar:
```ts
export interface SyncAllResult {
  pl: SyncResult;
  bs: BSSyncResult;
  ar: ArSyncResult;
}
```
A:
```ts
export interface SyncAllResult {
  pl: SyncResult;
  bs: BSSyncResult;
  ar: ArSyncResult;
  customers: CustomersSyncResult;
}
```

Y modificar `syncAll`:
```ts
export async function syncAll(months = 12): Promise<SyncAllResult> {
  const pl = await syncProfitAndLoss(months);
  const bs = await syncBalanceSheet(months);
  const ar = await syncArAging();
  const customers = await syncQbCustomers();
  return { pl, bs, ar, customers };
}
```

- [ ] **Step 5: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add server/quickbooks/sync.ts
git commit -m "feat: syncQbCustomers + extend syncAll with 4th phase (customers)"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 5: Endpoint GET /api/qb/customers

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Añadir endpoint**

En `server/routes.ts`, dentro de `registerRoutes`, después del endpoint `/api/financials/balance-sheet` (de QB-3) y antes del bloque de endpoints `/api/qb/*` (status/connect/callback/sync), añadir:

```ts
  app.get("/api/qb/customers", async (_req, res) => {
    const customers = await storage.getQbCustomers();
    res.json(customers);
  });
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Live verify (sin data — array vacío)**

Arrancar el server en background (Bash con `run_in_background: true` corriendo `cd "c:/Projectos/ONYX/onyx-command-center-mobile" && npm run dev 2>&1`). Esperar ~6s, leer output file para confirmar `serving on port 5000` + schedules.

En PowerShell:
```
cd "c:\Projectos\ONYX\onyx-command-center-mobile"
'{"username":"Admin","password":"OnyxCCD"}' | Out-File -Encoding ascii body.json
curl.exe -s -c c.txt -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" --data "@body.json" | Out-Null

Write-Output "--- no session (401) ---"
curl.exe -i -s http://localhost:5000/api/qb/customers

Write-Output "--- with session, no data (200 []) ---"
curl.exe -i -s -b c.txt http://localhost:5000/api/qb/customers

Remove-Item c.txt,body.json -ErrorAction SilentlyContinue
```

Expected:
- No session: 401 `{"error":"No autenticado"}`.
- With session, no data yet: 200 `[]`.

Detener server (kill background bash task o `Get-Process node | Stop-Process -Force`).

Si no puedes manejar background server fiable, reportar DONE_WITH_CONCERNS con lo obtenido; no dejar server corriendo.

- [ ] **Step 4: Commit**

```
git add server/routes.ts
git commit -m "feat: GET /api/qb/customers endpoint"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 6: Frontend — Customer Mapping panel + handleQbSync update

**Files:**
- Modify: `client/src/pages/finance.tsx`

**Contexto:**
- El componente `Finance` ya tiene queries para `/api/qb/status`, `/api/financials`, `/api/financials/line-items`, `/api/financials/balance-sheet`, `/api/ar-aging`, `/api/jobs`. Helpers `apiRequest`, `useToast`, `useQueryClient` ya en scope.
- `handleQbSync` (~líneas 230-280) actualmente recibe `{pl, bs, ar}` del POST. Ahora recibe `{pl, bs, ar, customers}`. Actualizar toast e invalidations.
- El QB status panel está al tope del page (~líneas 400-440). El nuevo panel "Customer Mapping" va debajo de él.

### Step 1: Añadir queries de customers + jobs (si jobs no estuviera ya queryable)

Dentro del componente `Finance`, junto a otros `useQuery`, añadir:

```tsx
  const customersQuery = useQuery<Array<{ id: string; displayName: string; active: boolean }>>({
    queryKey: ["/api/qb/customers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/qb/customers");
      return res.json();
    },
  });
```

Verifica si `useQuery<Job[]>(["/api/jobs"])` ya existe en el componente (se añadió en otros pages; en finance ya hay `const { data: jobs = [] } = useQuery(...)` con queryKey `/api/jobs`). Si no existe, añadirlo:
```tsx
  // Solo si no existe ya con queryKey ["/api/jobs"]:
  // const { data: jobs = [] } = useQuery<any[]>({
  //   queryKey: ["/api/jobs"],
  //   queryFn: async () => { const r = await apiRequest("GET", "/api/jobs"); return r.json(); },
  // });
```

- [ ] **Step 2: Estado local del panel**

Añadir junto a los otros `useState`:
```tsx
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(true);
  const [savingMap, setSavingMap] = useState<Set<number>>(new Set());
  const [pendingMap, setPendingMap] = useState<Record<number, string>>({});
```

- [ ] **Step 3: Handler de guardar match**

Junto a `handleQbSync` añadir:

```tsx
  async function handleSaveJobCustomer(jobId: number) {
    const value = pendingMap[jobId];
    const qbCustomerId = value === "" ? null : value;
    setSavingMap((prev) => new Set(prev).add(jobId));
    try {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}`, { qbCustomerId });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "Match guardado", description: `Job #${jobId} actualizado` });
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      setPendingMap((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "No se pudo guardar",
        variant: "destructive",
      });
    } finally {
      setSavingMap((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }
```

- [ ] **Step 4: Actualizar handleQbSync — toast + invalidations**

Localizar `handleQbSync`. Reemplazar el `try` block:

Antes:
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

Después:
```tsx
    try {
      const res = await apiRequest("POST", "/api/qb/sync");
      const data = await res.json();
      const plMonths = data?.pl?.updated ?? 0;
      const bsRows = data?.bs?.updated ?? 0;
      const arRows = data?.ar?.count ?? 0;
      const custCount = data?.customers?.customers ?? 0;
      const autoMatched = data?.customers?.autoMatched ?? 0;
      toast({
        title: "QuickBooks sync OK",
        description: `${plMonths} meses P&L · ${bsRows} líneas BS · ${arRows} AR · ${custCount} customers (${autoMatched} matched)`,
      });
      qc.invalidateQueries({ queryKey: ["/api/qb/status"] });
      qc.invalidateQueries({ queryKey: ["/api/financials"] });
      qc.invalidateQueries({ queryKey: ["/api/financials/line-items"] });
      qc.invalidateQueries({ queryKey: ["/api/financials/balance-sheet"] });
      qc.invalidateQueries({ queryKey: ["/api/ar-aging"] });
      qc.invalidateQueries({ queryKey: ["/api/qb/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
    } catch (err: any) {
```

- [ ] **Step 5: Renderizar panel Customer Mapping**

Inmediatamente DESPUÉS del cierre del `<div data-testid="qb-panel">...</div>` (el QB status panel), añadir:

```tsx
        {/* QuickBooks Customer Mapping panel */}
        <div
          data-testid="qb-customer-mapping"
          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 text-xs">
              <span className="uppercase tracking-[0.12em] text-white/40">Customer Mapping</span>
              <span className="text-white/40">
                {customersQuery.data?.length ?? 0} customers · {jobs.filter((j: any) => !j.qbCustomerId).length} unmatched
              </span>
            </div>
            <label className="flex items-center gap-2 text-[10px] text-white/50 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyUnmatched}
                onChange={(e) => setShowOnlyUnmatched(e.target.checked)}
              />
              Solo unmatched
            </label>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(jobs as any[])
              .filter((j) => (showOnlyUnmatched ? !j.qbCustomerId : true))
              .map((job: any) => {
                const currentValue = pendingMap[job.id] ?? job.qbCustomerId ?? "";
                const isSaving = savingMap.has(job.id);
                const isDirty = pendingMap[job.id] !== undefined && pendingMap[job.id] !== (job.qbCustomerId ?? "");
                return (
                  <div
                    key={job.id}
                    className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white/[0.02]"
                  >
                    <span className="font-mono text-white/40 w-8">#{job.id}</span>
                    <span className="text-white/70 flex-1 truncate">{job.clientName}</span>
                    <select
                      value={currentValue}
                      onChange={(e) => setPendingMap((p) => ({ ...p, [job.id]: e.target.value }))}
                      className="bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-xs text-white/85 min-w-[180px]"
                    >
                      <option value="">— sin asignar —</option>
                      {(customersQuery.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>{c.displayName}</option>
                      ))}
                    </select>
                    <button
                      data-testid={`qb-map-save-${job.id}`}
                      onClick={() => handleSaveJobCustomer(job.id)}
                      disabled={isSaving || !isDirty}
                      className="rounded px-2 py-1 text-[10px] font-medium text-white/85 border border-white/[0.1] bg-white/[0.06] hover:bg-white/[0.1] transition-colors disabled:opacity-40"
                    >
                      {isSaving ? "…" : "Guardar"}
                    </button>
                  </div>
                );
              })}
            {(jobs as any[]).filter((j) => (showOnlyUnmatched ? !j.qbCustomerId : true)).length === 0 && (
              <div className="text-white/40 text-xs py-4 text-center">
                {showOnlyUnmatched ? "Todos los jobs tienen customer asignado." : "Sin jobs."}
              </div>
            )}
          </div>
        </div>
```

Reportar dónde exactamente colocaste el panel (línea + parent element).

- [ ] **Step 6: Verificar typecheck + build**

Run: `npm run check`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```
git add client/src/pages/finance.tsx
git commit -m "feat: QB Customer Mapping panel + extend sync toast/invalidations with customers"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 7: Verificación E2E real (requiere QB conectado + sync)

**Files:** ninguno (verificación).

Si QB aún no conectado en navegador, reportar BLOCKED.

- [ ] **Step 1: Confirmar QB conectado**

```
curl.exe -s -b c.txt http://localhost:5000/api/qb/status
```
Expected: `{"connected":true,"realmId":"...","environment":"sandbox","lastSyncAt":"..."}`.

- [ ] **Step 2: Disparar syncAll y confirmar customers**

```
curl.exe -s -b c.txt -X POST http://localhost:5000/api/qb/sync
```
Expected: JSON con shape `{pl, bs, ar, customers}`. `customers.customers > 0`. `customers.autoMatched > 0` esperado (Adam Bartlett y otros deberían matchear si están en QB sandbox).

- [ ] **Step 3: Verificar en DB**

```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{ const c=await p.query('SELECT count(*) FROM qb_customers'); const m=await p.query(\"SELECT id, job_id, client_name, qb_customer_id FROM jobs ORDER BY id\"); console.log('qb_customers count:', c.rows[0].count); console.log('jobs:'); console.table(m.rows); await p.end(); })()"
```
Expected:
- `qb_customers count: > 0`.
- Algunos jobs con `qb_customer_id` no null (los nombres que matchean QB sandbox); los demás null.

- [ ] **Step 4: Verificar endpoint customers**

```
curl.exe -s -b c.txt http://localhost:5000/api/qb/customers
```
Expected: array de customers ordenado alfabéticamente por displayName.

- [ ] **Step 5: Verificar panel en navegador**

Abrir `/#/finance`. Panel "Customer Mapping" debajo del QB status:
- Muestra "N customers · M unmatched".
- Toggle "Solo unmatched" filtra correctamente.
- Cada fila tiene dropdown con customers; cambiar selección habilita "Guardar"; click guarda y muestra toast.
- Tras guardar, "unmatched" count disminuye.

- [ ] **Step 6: Verificar PATCH directo**

```
curl.exe -s -b c.txt -X PATCH http://localhost:5000/api/jobs/1 -H "Content-Type: application/json" --data "@body.json"
```
(Con `body.json` conteniendo `{"qbCustomerId":"<algún-id-de-customer>"}`.) Expected: 200 con job actualizado.

Verificar override no se pierde tras siguiente sync:
```
curl.exe -s -b c.txt -X POST http://localhost:5000/api/qb/sync
```
Tras el sync, el job sigue con el qb_customer_id que tú elegiste (autoMatch respeta valores existentes).

- [ ] **Step 7 (sin commit — verificación)**

Reportar resultados.

---

## Verificación final

- [ ] `npm run check` → PASS.
- [ ] `npm run build` → PASS.
- [ ] Tabla `qb_customers` creada; `jobs.qb_customer_id` agregada.
- [ ] `POST /api/qb/sync` devuelve `{pl, bs, ar, customers}` con `customers.autoMatched > 0`.
- [ ] `GET /api/qb/customers` devuelve lista ordenada.
- [ ] Panel frontend funciona: filtro, dropdown, guardar, toast.
- [ ] PATCH `/api/jobs/:id` con `{qbCustomerId}` actualiza correctamente.
- [ ] Auto-match preserva overrides existentes.
