# P1 QB-1 — OAuth + P&L Summary Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar la app a QuickBooks Online vía OAuth 2.0 y sincronizar el P&L mensual resumido (revenue, COGS, opex, netIncome) de los últimos 12 meses hacia la tabla `financials`, con disparo manual y cron diario.

**Architecture:** Tres módulos server bajo `server/quickbooks/`: `oauth.ts` (cliente intuit-oauth + token CRUD + state firmado), `parse.ts` (parser puro del JSON de Reports API), `sync.ts` (orquesta fetch + parse + upsert + cron). Cuatro endpoints REST protegidos por `requireAuth`. Panel compacto en `finance.tsx` para estado + acciones. Upsert parcial preserva campos no-P&L de `financials`.

**Tech Stack:** Express 5, intuit-oauth (SDK oficial), Drizzle ORM + Postgres, node-cron (ya instalado), React + use-toast + apiRequest (ya disponibles).

**Spec:** `docs/superpowers/specs/2026-05-28-p1-quickbooks-pl-sync-design.md`

**Branch:** `p1-quickbooks-pl-sync` (creada desde main).

**Nota testing:** Sin runner unitario. Verificación por `npm run check` (tsc), `curl` (endpoints), navegador (OAuth flow + panel), y un script node ad-hoc para validar el parser con un fixture JSON de QB. Sin Playwright para OAuth (requiere login real Intuit).

**Prerequisitos del usuario para Task 9 (verificación E2E real):**
- En `.env`: `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI=http://localhost:5000/api/qb/callback`, `QB_ENVIRONMENT=sandbox` (o `production`).
- `QB_REDIRECT_URI` registrado idéntico en la app Intuit Developer (Redirect URIs).
- QBO real (sandbox o production) accesible con esa app. Tasks 1-8 implementan/typecheckean sin creds.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `server/quickbooks/oauth.ts` (crear) | Cliente intuit-oauth, `getAuthorizeUrl`, `exchangeCode`, `ensureValidAccessToken`, `getStatus`, sign/verify state HMAC. |
| `server/quickbooks/parse.ts` (crear) | `parseProfitAndLossReport(json)` → `Array<{period,revenue,cogs,operatingExpenses,netIncome}>`. Pura. |
| `server/quickbooks/sync.ts` (crear) | `syncProfitAndLoss(months)`, `registerQuickbooksSchedule()`. |
| `shared/schema.ts` (modificar) | + tabla `quickbooks_tokens`, `.unique()` en `financials.period`, + tipos. |
| `server/storage.ts` (modificar) | + `getQbTokens`, `upsertQbTokens`, `updateQbLastSync`, `clearQbTokens`, `upsertFinancialPartial`. |
| `server/routes.ts` (modificar) | + 4 endpoints `/api/qb/*`. |
| `server/index.ts` (modificar) | + `registerQuickbooksSchedule()`. |
| `client/src/pages/finance.tsx` (modificar) | Panel de estado/acciones QB en el header. |
| `.env` / `.env.example` (modificar) | + variables QB. |
| `package.json` / `script/build.ts` (modificar) | + dep `intuit-oauth`, allowlist. |

---

## Task 1: Dependencias + env + schema (tokens & unique constraint)

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `script/build.ts` (allowlist)
- Modify: `.env`, `.env.example`
- Modify: `shared/schema.ts`

- [ ] **Step 1: Instalar intuit-oauth**

```bash
npm install intuit-oauth
```

- [ ] **Step 2: Añadir intuit-oauth al allowlist de build**

En `script/build.ts`, dentro del array `allowlist`, añadir la entrada `"intuit-oauth",` (en cualquier posición; mantener array válido).

- [ ] **Step 3: Añadir variables a .env.example**

Al final de `.env.example` añadir:

```
# QuickBooks Online (OAuth + P&L sync)
QB_CLIENT_ID=<intuit-app-client-id>
QB_CLIENT_SECRET=<intuit-app-client-secret>
QB_REDIRECT_URI=http://localhost:5000/api/qb/callback
QB_ENVIRONMENT=sandbox
QB_SYNC_CRON=0 6 * * *
```

- [ ] **Step 4: Añadir las mismas claves a .env (placeholders vacíos donde corresponde)**

Al final de `.env` añadir (NO commitear .env; gitignored):

```
# QuickBooks Online (OAuth + P&L sync)
QB_CLIENT_ID=
QB_CLIENT_SECRET=
QB_REDIRECT_URI=http://localhost:5000/api/qb/callback
QB_ENVIRONMENT=sandbox
QB_SYNC_CRON=0 6 * * *
```

Verificar con `git status` que `.env` NO aparece como modified/staged.

- [ ] **Step 5: Añadir tabla quickbooks_tokens al schema**

En `shared/schema.ts`, tras el bloque `users` y antes del bloque de `export type`, añadir:

```ts
// QuickBooks Online tokens — single-row (id=1).
export const quickbooksTokens = pgTable("quickbooks_tokens", {
  id: integer("id").primaryKey().default(1),
  realmId: text("realm_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  environment: text("environment").notNull(), // 'sandbox' | 'production'
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksTokenSchema = createInsertSchema(quickbooksTokens).omit({
  createdAt: true,
  updatedAt: true,
});
```

- [ ] **Step 6: Añadir unique constraint a financials.period**

En `shared/schema.ts`, localizar la definición de `financials`. La línea actual:
```ts
  period: text("period").notNull(), // e.g. "2026-01", "2026-02"
```
Cambiar a:
```ts
  period: text("period").notNull().unique(), // e.g. "2026-01", "2026-02"
```

- [ ] **Step 7: Añadir tipos al final de shared/schema.ts**

Al final del archivo (tras los otros `export type`):
```ts
export type QuickbooksToken = typeof quickbooksTokens.$inferSelect;
export type InsertQuickbooksToken = z.infer<typeof insertQuickbooksTokenSchema>;
```

- [ ] **Step 8: Verificar typecheck**

Run: `npm run check`
Expected: PASS. No errores nuevos.

- [ ] **Step 9: Commit**

```
git add package.json package-lock.json script/build.ts .env.example shared/schema.ts
git commit -m "chore: add intuit-oauth dep + QB env vars + quickbooks_tokens schema"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 2: Aplicar schema en Postgres (`db:push`)

**Files:** ninguno (operación DB).

- [ ] **Step 1: Ejecutar db:push**

Run: `npm run db:push`
Expected: drizzle-kit detecta nueva tabla `quickbooks_tokens` y nuevo unique constraint en `financials.period`; los crea sin errores. Si la herramienta pide confirmar el constraint en datos existentes y los seeds actuales ya son únicos por period (6 filas, períodos distintos), confirmar/proceder. Si hubiera conflicto inesperado, reportarlo en lugar de forzar `--force` que pueda destruir datos.

- [ ] **Step 2: Verificar tabla creada + constraint**

```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); (async()=>{const t=await p.query(\"select table_name from information_schema.tables where table_schema='public' and table_name='quickbooks_tokens'\"); const u=await p.query(\"select constraint_name from information_schema.table_constraints where table_name='financials' and constraint_type='UNIQUE'\"); console.log('quickbooks_tokens:', t.rowCount); console.log('financials uniques:', u.rows.map(r=>r.constraint_name)); await p.end();})()"
```
Expected: `quickbooks_tokens: 1` y al menos un constraint unique sobre `financials` (drizzle-kit suele nombrarlo `financials_period_unique`).

- [ ] **Step 3: (sin commit — operación DB)**

---

## Task 3: Storage methods (tokens + upsert parcial)

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Ampliar el import de tipos en storage.ts**

En el bloque `import type { ... } from "@shared/schema";` añadir `QuickbooksToken, InsertQuickbooksToken`:
```ts
  User, InsertUser,
  QuickbooksToken, InsertQuickbooksToken,
} from "@shared/schema";
```

- [ ] **Step 2: Ampliar imports de valores**

En el bloque que importa tablas/eq/db, añadir `quickbooksTokens`:
```ts
import {
  jobs, productionRuns, financials, maintenanceTasks, sensorReadings,
  inventory, arAging, shipments, leads, vendors, pressLogs, users,
  quickbooksTokens,
} from "@shared/schema";
```

Asegurarse de que `sql` no se importe si no se usa. Para `upsertFinancialPartial` (Step 4) necesitamos `eq` (ya importado) y nada más; el upsert usa `.onConflictDoUpdate`.

- [ ] **Step 3: Añadir métodos a la interfaz IStorage**

En `export interface IStorage { ... }`, antes de la llave de cierre, añadir:
```ts
  // QuickBooks tokens
  getQbTokens(): Promise<QuickbooksToken | undefined>;
  upsertQbTokens(t: InsertQuickbooksToken): Promise<QuickbooksToken>;
  updateQbLastSync(at: Date): Promise<void>;
  clearQbTokens(): Promise<void>;

  // Financials — upsert parcial (solo columnas P&L)
  upsertFinancialPartial(period: string, partial: { revenue: number; cogs: number; operatingExpenses: number; netIncome: number; }): Promise<void>;
```

- [ ] **Step 4: Implementar en DrizzleStorage**

Dentro de `class DrizzleStorage`, antes de la llave de cierre, añadir:
```ts
  // QuickBooks tokens
  async getQbTokens(): Promise<QuickbooksToken | undefined> {
    const r = await db.select().from(quickbooksTokens).where(eq(quickbooksTokens.id, 1));
    return r[0];
  }
  async upsertQbTokens(t: InsertQuickbooksToken): Promise<QuickbooksToken> {
    const now = new Date();
    const r = await db
      .insert(quickbooksTokens)
      .values({ ...t, id: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: quickbooksTokens.id,
        set: {
          realmId: t.realmId,
          accessToken: t.accessToken,
          refreshToken: t.refreshToken,
          expiresAt: t.expiresAt,
          environment: t.environment,
          lastSyncAt: t.lastSyncAt ?? null,
          updatedAt: now,
        },
      })
      .returning();
    return r[0];
  }
  async updateQbLastSync(at: Date): Promise<void> {
    await db
      .update(quickbooksTokens)
      .set({ lastSyncAt: at, updatedAt: new Date() })
      .where(eq(quickbooksTokens.id, 1));
  }
  async clearQbTokens(): Promise<void> {
    await db.delete(quickbooksTokens).where(eq(quickbooksTokens.id, 1));
  }

  // Financials — upsert parcial (preserva cashPosition / arTotal / apTotal existentes)
  async upsertFinancialPartial(
    period: string,
    partial: { revenue: number; cogs: number; operatingExpenses: number; netIncome: number },
  ): Promise<void> {
    await db
      .insert(financials)
      .values({
        period,
        revenue: partial.revenue,
        cogs: partial.cogs,
        operatingExpenses: partial.operatingExpenses,
        netIncome: partial.netIncome,
      })
      .onConflictDoUpdate({
        target: financials.period,
        set: {
          revenue: partial.revenue,
          cogs: partial.cogs,
          operatingExpenses: partial.operatingExpenses,
          netIncome: partial.netIncome,
        },
      });
  }
```

- [ ] **Step 5: Implementar stubs en MemStorage**

Dentro de `class MemStorage`, añadir junto a los otros Maps el campo:
```ts
  private qbTokens: QuickbooksToken | undefined;
```
Y los métodos:
```ts
  async getQbTokens(): Promise<QuickbooksToken | undefined> {
    return this.qbTokens;
  }
  async upsertQbTokens(t: InsertQuickbooksToken): Promise<QuickbooksToken> {
    const now = new Date();
    this.qbTokens = { ...(t as any), id: 1, createdAt: this.qbTokens?.createdAt ?? now, updatedAt: now } as QuickbooksToken;
    return this.qbTokens;
  }
  async updateQbLastSync(at: Date): Promise<void> {
    if (this.qbTokens) this.qbTokens = { ...this.qbTokens, lastSyncAt: at, updatedAt: new Date() };
  }
  async clearQbTokens(): Promise<void> {
    this.qbTokens = undefined;
  }
  async upsertFinancialPartial(
    period: string,
    partial: { revenue: number; cogs: number; operatingExpenses: number; netIncome: number },
  ): Promise<void> {
    const existing = Array.from(this.financials.values()).find((f) => f.period === period);
    if (existing) {
      existing.revenue = partial.revenue;
      existing.cogs = partial.cogs;
      existing.operatingExpenses = partial.operatingExpenses;
      existing.netIncome = partial.netIncome;
    } else {
      const id = this.getNextId();
      this.financials.set(id, {
        id, period,
        revenue: partial.revenue, cogs: partial.cogs,
        operatingExpenses: partial.operatingExpenses, netIncome: partial.netIncome,
        cashPosition: null, arTotal: null, apTotal: null,
      } as any);
    }
  }
```

- [ ] **Step 6: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```
git add server/storage.ts
git commit -m "feat: storage methods for QB tokens and partial financials upsert"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 4: Parser puro (`server/quickbooks/parse.ts`)

**Files:**
- Create: `server/quickbooks/parse.ts`

- [ ] **Step 1: Crear el parser**

```ts
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
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Sanity check con fixture sintético**

Crear archivo temporal `tmp-parse-check.ts` en la raíz del proyecto con este contenido:

```ts
import { parseProfitAndLossReport } from "./server/quickbooks/parse";

const fixture = {
  Columns: {
    Column: [
      { ColTitle: "" },
      { ColTitle: "Jan 2026", MetaData: [{ Name: "StartDate", Value: "2026-01-01" }, { Name: "EndDate", Value: "2026-01-31" }] },
      { ColTitle: "Feb 2026", MetaData: [{ Name: "StartDate", Value: "2026-02-01" }, { Name: "EndDate", Value: "2026-02-28" }] },
      { ColTitle: "Total" },
    ],
  },
  Rows: {
    Row: [
      { group: "Income",    Summary: { ColData: [{ value: "" }, { value: "10000.00" }, { value: "8000.00" }, { value: "18000.00" }] } },
      { group: "COGS",      Summary: { ColData: [{ value: "" }, { value: "4000.00" },  { value: "3200.00" }, { value: "7200.00" } ] } },
      { group: "Expenses",  Summary: { ColData: [{ value: "" }, { value: "2500.00" },  { value: "2100.00" }, { value: "4600.00" } ] } },
      { group: "NetIncome", Summary: { ColData: [{ value: "" }, { value: "3500.00" },  { value: "2700.00" }, { value: "6200.00" } ] } },
    ],
  },
};

console.log(JSON.stringify(parseProfitAndLossReport(fixture)));
```

Run: `npx tsx tmp-parse-check.ts`
Expected output (un array JSON con dos entradas):
```
[{"period":"2026-01","revenue":10000,"cogs":4000,"operatingExpenses":2500,"netIncome":3500},{"period":"2026-02","revenue":8000,"cogs":3200,"operatingExpenses":2100,"netIncome":2700}]
```
Verificar: solo dos meses (no la columna "Total" sin MetaData), valores correctos, period `YYYY-MM`.

Borrar el archivo: `Remove-Item tmp-parse-check.ts`. NO commitear este archivo.

Expected output (JSON array con 2 entradas):
```
[{"period":"2026-01","revenue":10000,"cogs":4000,"operatingExpenses":2500,"netIncome":3500},{"period":"2026-02","revenue":8000,"cogs":3200,"operatingExpenses":2100,"netIncome":2700}]
```

Verificar: solo aparecen los meses (no la columna "Total" sin MetaData), valores correctos por columna, period en formato `YYYY-MM`.

- [ ] **Step 4: Commit**

```
git add server/quickbooks/parse.ts
git commit -m "feat: pure parser for QuickBooks P&L monthly report"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 5: OAuth module (`server/quickbooks/oauth.ts`)

**Files:**
- Create: `server/quickbooks/oauth.ts`

- [ ] **Step 1: Crear el módulo OAuth**

```ts
import crypto from "crypto";
import OAuthClient from "intuit-oauth";
import { storage } from "../storage";
import type { QuickbooksToken } from "@shared/schema";

const clientId = process.env.QB_CLIENT_ID || "";
const clientSecret = process.env.QB_CLIENT_SECRET || "";
const redirectUri = process.env.QB_REDIRECT_URI || "";
const environment = (process.env.QB_ENVIRONMENT || "sandbox") as "sandbox" | "production";

export function isQbConfigured(): boolean {
  return !!clientId && !!clientSecret && !!redirectUri;
}

function newClient(): OAuthClient {
  return new OAuthClient({
    clientId,
    clientSecret,
    environment,
    redirectUri,
  });
}

// State firmado HMAC para anti-CSRF en el OAuth flow.
function getStateSecret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret";
}

export function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60 * 1000): boolean {
  const idx = state.lastIndexOf(".");
  if (idx < 0) return false;
  const body = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed?.t !== "number") return false;
    if (Date.now() - parsed.t > maxAgeMs) return false;
    return true;
  } catch {
    return false;
  }
}

export function getAuthorizeUrl(): { url: string; state: string } {
  const client = newClient();
  const state = signState({ nonce: crypto.randomBytes(8).toString("hex") });
  const url = client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
  return { url, state };
}

// Intercambia el callback URL completo (con code, state, realmId) por tokens
// y los persiste. Devuelve el token guardado.
export async function exchangeCode(callbackUrl: string, realmId: string): Promise<QuickbooksToken> {
  const client = newClient();
  const authResponse = await client.createToken(callbackUrl);
  const token = authResponse.getJson() as {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
    x_refresh_token_expires_in?: number;
    token_type?: string;
  };
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  return storage.upsertQbTokens({
    realmId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    environment,
    lastSyncAt: null,
  });
}

// Devuelve un access_token válido. Si está por expirar (<5 min), refresca y persiste.
export async function ensureValidAccessToken(): Promise<{ accessToken: string; realmId: string; environment: string }> {
  const t = await storage.getQbTokens();
  if (!t) throw new Error("QB no conectado");
  const now = Date.now();
  const margin = 5 * 60 * 1000;
  if (t.expiresAt.getTime() - now > margin) {
    return { accessToken: t.accessToken, realmId: t.realmId, environment: t.environment };
  }
  // Refrescar.
  const client = newClient();
  client.setToken({
    access_token: t.accessToken,
    refresh_token: t.refreshToken,
    token_type: "bearer",
    expires_in: Math.max(0, Math.floor((t.expiresAt.getTime() - now) / 1000)),
    x_refresh_token_expires_in: 0,
    realmId: t.realmId,
  });
  let refreshed: any;
  try {
    const r = await client.refresh();
    refreshed = r.getJson();
  } catch (err: any) {
    // Refresh fallido (token expirado >100d, o revocado): borrar tokens.
    await storage.clearQbTokens();
    throw new Error("QB refresh falló — re-conectar requerido");
  }
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000);
  const saved = await storage.upsertQbTokens({
    realmId: t.realmId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: newExpires,
    environment: t.environment,
    lastSyncAt: t.lastSyncAt ?? null,
  });
  return { accessToken: saved.accessToken, realmId: saved.realmId, environment: saved.environment };
}

export async function getStatus(): Promise<{
  connected: boolean;
  realmId?: string;
  environment?: string;
  lastSyncAt?: string | null;
}> {
  const t = await storage.getQbTokens();
  if (!t) return { connected: false };
  return {
    connected: true,
    realmId: t.realmId,
    environment: t.environment,
    lastSyncAt: t.lastSyncAt ? t.lastSyncAt.toISOString() : null,
  };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS. Si el TS de `intuit-oauth` se queja de la firma de `setToken` o `getJson()`, inspeccionar `node_modules/intuit-oauth/...` y ajustar la forma del objeto a lo que pida el .d.ts. No insertar `any` indiscriminadamente — usar el tipo real. Reportar cualquier ajuste hecho.

- [ ] **Step 3: Commit**

```
git add server/quickbooks/oauth.ts
git commit -m "feat: QuickBooks OAuth client wrapper + token persistence + signed state"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 6: Sync module (`server/quickbooks/sync.ts`)

**Files:**
- Create: `server/quickbooks/sync.ts`

- [ ] **Step 1: Crear sync.ts**

```ts
import cron from "node-cron";
import { ensureValidAccessToken } from "./oauth";
import { parseProfitAndLossReport, type ParsedFinancial } from "./parse";
import { storage } from "../storage";

export interface SyncResult {
  periods: string[];
  updated: number;
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
  await storage.updateQbLastSync(new Date());
  return { periods: rows.map((r) => r.period), updated: rows.length };
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
        const r = await syncProfitAndLoss(12);
        console.log("[quickbooks] schedule sync OK:", JSON.stringify(r));
      } catch (err) {
        console.error("[quickbooks] schedule sync falló:", err);
      }
    },
    { timezone: tz },
  );
  console.log(`[quickbooks] schedule registrado: "${expr}" (${tz})`);
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add server/quickbooks/sync.ts
git commit -m "feat: QuickBooks P&L sync + daily schedule"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 7: Endpoints + index.ts wiring

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Añadir imports en routes.ts**

En `server/routes.ts`, junto a los imports existentes:
```ts
import {
  getAuthorizeUrl,
  verifyState,
  exchangeCode,
  getStatus as getQbStatus,
  isQbConfigured,
} from "./quickbooks/oauth";
import { syncProfitAndLoss } from "./quickbooks/sync";
```

- [ ] **Step 2: Añadir los 4 endpoints en registerRoutes**

Dentro de `registerRoutes`, AFTER `app.use("/api", requireAuth);` y antes de `return httpServer;`, añadir:
```ts
  // === QUICKBOOKS ===
  app.get("/api/qb/status", async (_req, res) => {
    res.json(await getQbStatus());
  });

  app.get("/api/qb/connect", (_req, res) => {
    if (!isQbConfigured()) {
      return res.status(400).json({ error: "QB no configurado (QB_CLIENT_ID / SECRET / REDIRECT_URI)" });
    }
    const { url } = getAuthorizeUrl();
    res.redirect(url);
  });

  app.get("/api/qb/callback", async (req, res) => {
    if (!isQbConfigured()) {
      return res.status(400).json({ error: "QB no configurado" });
    }
    const state = String(req.query.state || "");
    const realmId = String(req.query.realmId || "");
    if (!state || !verifyState(state)) {
      return res.status(400).json({ error: "state inválido" });
    }
    if (!realmId) {
      return res.status(400).json({ error: "realmId ausente" });
    }
    try {
      // intuit-oauth necesita la URL completa del callback (con query string).
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const host = req.get("host");
      const fullUrl = `${proto}://${host}${req.originalUrl}`;
      await exchangeCode(fullUrl, realmId);
      return res.redirect("/#/finance");
    } catch (err: any) {
      return res.status(502).json({ error: err?.message || "Error en OAuth callback" });
    }
  });

  app.post("/api/qb/sync", async (_req, res) => {
    if (!isQbConfigured()) {
      return res.status(400).json({ error: "QB no configurado" });
    }
    try {
      const summary = await syncProfitAndLoss(12);
      res.json(summary);
    } catch (err: any) {
      const msg = err?.message || "Error en sync QB";
      if (msg.includes("QB no conectado")) return res.status(400).json({ error: msg });
      res.status(502).json({ error: msg });
    }
  });
```

- [ ] **Step 3: Registrar schedule en index.ts**

En `server/index.ts`, añadir import junto a los otros:
```ts
import { registerQuickbooksSchedule } from "./quickbooks/sync";
```
Y después de `registerNotificationSchedule();`, añadir:
```ts
registerQuickbooksSchedule();
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Verificar arranque + protección + comportamiento sin QB configurado**

Start: `Start-Process -NoNewWindow -FilePath npm -ArgumentList 'run','dev'`. Wait ~6s. En los logs deben verse las dos líneas de schedule (`[notifications] schedule registrado: ...` y `[quickbooks] schedule registrado: "0 6 * * *" (America/Los_Angeles)`).

```
# Sin sesión → 401 en todos los endpoints qb
curl.exe -i http://localhost:5000/api/qb/status
curl.exe -i http://localhost:5000/api/qb/connect

# Con sesión + sin QB config → 400 (connect/callback/sync); status responde {connected:false}
curl.exe -i -c c.txt -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"Admin\",\"password\":\"OnyxCCD\"}"
curl.exe -b c.txt http://localhost:5000/api/qb/status
curl.exe -i -b c.txt http://localhost:5000/api/qb/connect
curl.exe -i -b c.txt -X POST http://localhost:5000/api/qb/sync
```
Expected:
- Sin sesión → 401.
- Con sesión `/api/qb/status` → 200 `{"connected":false}`.
- Con sesión sin QB config (env vacío) → `/api/qb/connect` 400 `{"error":"QB no configurado ..."}`. `/api/qb/sync` 400 mismo error.

Stop server: `Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`. `Remove-Item c.txt -ErrorAction SilentlyContinue`.
Si no manejas el background server fiable en Windows, reporta DONE_WITH_CONCERNS con lo obtenido; no dejes server corriendo.

- [ ] **Step 6: Commit**

```
git add server/routes.ts server/index.ts
git commit -m "feat: wire QuickBooks endpoints + daily sync schedule"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 8: Panel QuickBooks en finance.tsx

**Files:**
- Modify: `client/src/pages/finance.tsx`

**Contexto:** El archivo es grande (803 líneas). El componente principal de la página renderiza un encabezado con título "Financial Overview" (o similar) seguido de un selector de mes y luego cards. Añadir un panel COMPACTO encima de las cards (justo debajo del encabezado / selector). Helpers disponibles: `apiRequest` (`@/lib/queryClient`), `useToast` (`@/hooks/use-toast`), `useQuery` y `useQueryClient` (`@tanstack/react-query`).

- [ ] **Step 1: Añadir imports si faltan**

Verificar que `client/src/pages/finance.tsx` importe:
```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
```
Solo añadir las que no estén ya presentes; no duplicar.

- [ ] **Step 2: Añadir hook + handler de sync en el componente principal**

Dentro del componente principal de la página (el que renderiza el árbol completo), junto a otros hooks, añadir:
```tsx
  const qc = useQueryClient();
  const { toast } = useToast();
  const [syncingQb, setSyncingQb] = useState(false);
  const qbStatus = useQuery<{ connected: boolean; realmId?: string; environment?: string; lastSyncAt?: string | null }>({
    queryKey: ["/api/qb/status"],
  });

  async function handleQbSync() {
    setSyncingQb(true);
    try {
      const res = await apiRequest("POST", "/api/qb/sync");
      const data = await res.json();
      toast({
        title: "QuickBooks sync OK",
        description: `${data.updated} meses actualizados (${data.periods?.[0]} → ${data.periods?.[data.periods.length - 1]})`,
      });
      qc.invalidateQueries({ queryKey: ["/api/qb/status"] });
      qc.invalidateQueries({ queryKey: ["/api/financials"] });
    } catch (err: any) {
      let msg = err?.message || "No se pudo sincronizar";
      const jsonStart = msg.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(msg.slice(jsonStart));
          if (parsed?.error) msg = parsed.error;
        } catch { /* noop */ }
      }
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSyncingQb(false);
    }
  }
```

- [ ] **Step 3: Añadir el panel arriba (encima de las cards)**

Localizar dónde empieza el contenido principal de la página (justo después del encabezado de la página, antes del selector de mes o de las cards). Insertar el panel:

```tsx
        {/* QuickBooks status panel */}
        <div
          data-testid="qb-panel"
          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 mb-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 text-xs">
            <span className="uppercase tracking-[0.12em] text-white/40">QuickBooks</span>
            {qbStatus.isLoading ? (
              <span className="text-white/40">…</span>
            ) : qbStatus.data?.connected ? (
              <>
                <span className="text-emerald-400">● Connected</span>
                <span className="text-white/60">env: {qbStatus.data.environment}</span>
                <span className="text-white/40">
                  last sync: {qbStatus.data.lastSyncAt ? new Date(qbStatus.data.lastSyncAt).toLocaleString() : "—"}
                </span>
              </>
            ) : (
              <span className="text-white/50">● Disconnected</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {qbStatus.data?.connected ? (
              <button
                data-testid="qb-sync"
                onClick={handleQbSync}
                disabled={syncingQb}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/85 border border-white/[0.1] bg-white/[0.06] hover:bg-white/[0.1] transition-colors disabled:opacity-40"
              >
                {syncingQb ? "Sincronizando…" : "Sync now"}
              </button>
            ) : (
              <a
                data-testid="qb-connect"
                href="/api/qb/connect"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/85 border border-white/[0.1] bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
              >
                Connect QuickBooks
              </a>
            )}
          </div>
        </div>
```

El link "Connect QuickBooks" es un `<a>` con href `/api/qb/connect` (navegación top-level para que el server pueda 302 a Intuit). NO usar fetch para esto.

- [ ] **Step 4: Verificar typecheck + build cliente**

Run: `npm run check`
Expected: PASS.
Run: `npm run build`
Expected: PASS (cliente + servidor).

- [ ] **Step 5: Commit**

```
git add client/src/pages/finance.tsx
git commit -m "feat: QuickBooks status panel + connect/sync actions on finance page"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 9: Verificación E2E con QuickBooks real (requiere creds)

**Files:** ninguno (verificación). Si el usuario no proveyó `QB_CLIENT_ID` / `QB_CLIENT_SECRET`, reportar BLOCKED — Tasks 1-8 quedan completos y el endpoint responde 400 hasta configurar.

- [ ] **Step 1: Confirmar config**

```
node -e "require('dotenv').config(); console.log('client_id set:', !!process.env.QB_CLIENT_ID); console.log('secret set:', !!process.env.QB_CLIENT_SECRET); console.log('redirect:', process.env.QB_REDIRECT_URI); console.log('env:', process.env.QB_ENVIRONMENT)"
```
Expected: `client_id set: true`, `secret set: true`, redirect coincide con el registrado en Intuit Developer, env es `sandbox` o `production`.

- [ ] **Step 2: OAuth flow en el navegador**

Start `npm run dev`. Login con Admin/OnyxCCD. Ir a `/#/finance`. Verificar panel muestra "Disconnected" + botón "Connect QuickBooks".
Click "Connect QuickBooks" → debe redirigir a Intuit. Consentir. Volver a `/#/finance`. Panel debe mostrar "Connected · env: <sandbox|production> · last sync: —" + botón "Sync now".

- [ ] **Step 3: Sync manual + verificar DB**

Click "Sync now". Toast: "QuickBooks sync OK: 12 meses actualizados (YYYY-MM → YYYY-MM)".
Luego verificar en DB:
```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query('select period, revenue, cogs, operating_expenses, net_income, cash_position, ar_total, ap_total from financials order by period').then(r=>{console.table(r.rows); return p.end();})"
```
Expected: 12 filas con `period` cubriendo los últimos 12 meses; columnas revenue/cogs/operating_expenses/net_income con valores reales QB; `cash_position`/`ar_total`/`ap_total` siguen con sus valores previos (seed) donde corresponda (nulls para meses nuevos creados por el upsert).

- [ ] **Step 4: Verificar `lastSyncAt`**

```
curl.exe -b c.txt http://localhost:5000/api/qb/status
```
Expected: `{"connected":true,"realmId":"...","environment":"...","lastSyncAt":"..."}` con timestamp reciente.

- [ ] **Step 5: Probar cron (schedule temporal)**

Editar `.env` temporalmente: `QB_SYNC_CRON=*/2 * * * *`. Reiniciar `npm run dev`. Esperar ~2-3 min. Confirmar en log: `[quickbooks] schedule sync OK: {"periods":[...],"updated":12}`. Revertir `QB_SYNC_CRON` a `0 6 * * *`.

- [ ] **Step 6: Probar disconnect / reconnect**

```
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query('delete from quickbooks_tokens').then(()=>{console.log('tokens cleared'); return p.end();})"
```
Recargar `/#/finance` → panel "Disconnected". `POST /api/qb/sync` → 400 "QB no conectado". Click "Connect QuickBooks" otra vez → flujo completo nuevamente.

Stop server.

- [ ] **Step 7 (sin commit — verificación)**

Reportar resultados. Sin commits.

---

## Verificación final

- [ ] `npm run check` → PASS.
- [ ] `npm run build` → PASS.
- [ ] `npm run db:push` aplicado en Postgres (quickbooks_tokens + unique en financials.period).
- [ ] `/api/qb/status` sin sesión → 401; con sesión sin conectar → `{connected:false}`.
- [ ] `/api/qb/sync` sin conectar → 400; con conexión → 200 con 12 meses actualizados.
- [ ] Tabla `financials` tras sync: revenue/cogs/opex/netIncome reales; cashPosition/arTotal/apTotal preservados en filas existentes.
- [ ] Panel en finance.tsx funciona (Disconnected → Connect → Sync now → toast).
- [ ] Cron loguea al disparar (probado con schedule temporal).
- [ ] `.env` no en git status; `.env.example` con placeholders sin secretos.
