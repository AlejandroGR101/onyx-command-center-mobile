# P1 — QuickBooks QB-1: OAuth + P&L Summary Sync — Design

**Fecha:** 2026-05-28
**Rama:** p1-quickbooks-pl-sync
**Riesgo cubierto:** R7 (P&L hardcoded/generado aleatoriamente) — primer paso. Cierra la parte de **resumen mensual**; line items detallados quedan para QB-2.
**Fuente:** discovery-report.md §9, §15 Fase 2.1
**Sub-proyecto de P1 R7:** fase 1 de 4 (QB-1 → QB-2 line items → QB-3 BS+AR+AP → QB-4 customer mapping)

## Objetivo

Conectar la app a QuickBooks Online vía OAuth 2.0 y sincronizar el **P&L mensual resumido** (revenue, COGS, operating expenses, net income) de los últimos 12 meses hacia la tabla `financials`. Dispara: cron diario (6am LA) y botón manual en la página de finanzas. Reemplaza los valores seed/random con datos reales.

Fuera de alcance (futuros sub-proyectos):
- Line items detallados del P&L (`MONTHLY_PL` hardcoded en `client/src/pages/finance.tsx`) → **QB-2**.
- Balance Sheet, AR aging (Invoices), AP (Bills) → **QB-3**.
- Customer mapping (jobs ↔ QB Customers) → **QB-4**.

## Decisiones (brainstorming)

| Decisión | Elección |
|---|---|
| Alcance | Solo P&L resumen mensual (4 columnas: revenue, cogs, operatingExpenses, netIncome). |
| Setup Intuit | Usuario tiene app Intuit Developer + creds + QBO real. |
| Disparador | Cron diario `0 6 * * *` (TZ LA) + botón manual. |
| Ventana | Últimos 12 meses rodantes. Upsert por `period` (idempotente). |
| Preservación | El upsert solo escribe revenue/cogs/operatingExpenses/netIncome; preserva cashPosition/arTotal/apTotal existentes. |
| SDK | `intuit-oauth` (oficial) para tokens; `fetch` directo para Reports API. |
| Tenancy | Single-row tokens (single-tenant Onyx). |

## Estado actual relevante

- Auth server-side activo; rutas `/api/*` protegidas. Sesión en cookies.
- `storage` = `DrizzleStorage` (Postgres). Tabla `financials` con 6 filas seed.
- `client/src/pages/finance.tsx` (803 líneas): `MONTHLY_PL` y `BALANCE_SHEETS` hardcodeados; lee `/api/financials` para totales pero ignora ese dato en sus secciones detalladas. UI muestra "FROM QUICKBOOKS" solo para Jan 2026.
- Infra de scheduler ya existe (node-cron) y patrón `registerNotificationSchedule()`.
- Sin tabla de tokens QB ni endpoint OAuth.

## Componentes

### Nuevos

| Archivo | Responsabilidad |
|---|---|
| `server/quickbooks/oauth.ts` | Init cliente `intuit-oauth` con env. `getAuthorizeUrl(state)`, `exchangeCode(url)`, `ensureValidAccessToken()` (refresca si expira en <5 min), `getStatus()` (`{connected, realmId?, environment?, lastSyncAt?}`), `signState()`/`verifyState()` (HMAC con SESSION_SECRET, anti-CSRF). |
| `server/quickbooks/sync.ts` | `syncProfitAndLoss(months=12): Promise<SyncResult>`: fetch report, parsea, upsert parcial. `registerQuickbooksSchedule()` (cron diario). |
| `server/quickbooks/parse.ts` | Parser del JSON de Reports API: extrae `{period, revenue, cogs, operatingExpenses, netIncome}` por columna mensual. Función pura, sin I/O. Aislada para testear lógica del parser. |

### Modificados

| Archivo | Cambio |
|---|---|
| `shared/schema.ts` | + tabla `quickbooks_tokens` (id PK fijo=1, realmId, accessToken, refreshToken, expiresAt, environment, lastSyncAt, createdAt, updatedAt). + tipos `QuickbooksToken`, `InsertQuickbooksToken`. |
| `server/storage.ts` | + en `IStorage`: `getQbTokens(): Promise<QuickbooksToken \| undefined>`, `upsertQbTokens(t: InsertQuickbooksToken): Promise<QuickbooksToken>`, `updateQbLastSync(at: Date): Promise<void>`, `clearQbTokens(): Promise<void>`. Impl en `DrizzleStorage` + stubs equivalentes en `MemStorage` (mantener compilable). |
| `server/storage.ts` | + `upsertFinancialPartial(period, partial): Promise<void>` — INSERT ... ON CONFLICT (period) DO UPDATE SET solo de las 4 columnas P&L (preserva el resto). Implementado vía `db.insert(financials).values(...).onConflictDoUpdate({...})`. Para esto, agregar `unique("period")` en el schema (cambio aditivo). |
| `shared/schema.ts` | Agregar `.unique()` a `financials.period` (constraint nuevo; `db:push` lo crea). |
| `server/routes.ts` | + 4 endpoints (todos tras `requireAuth`): `GET /api/qb/connect`, `GET /api/qb/callback`, `POST /api/qb/sync`, `GET /api/qb/status`. |
| `server/index.ts` | + `registerQuickbooksSchedule()` después de `registerNotificationSchedule()`. |
| `client/src/pages/finance.tsx` | Panel compacto al tope (sobre las tarjetas): estado QB + botones. Si disconnected → "Connect QuickBooks". Si connected → "Last synced: X" + "Sync now". Aprovecha `apiRequest` + `useToast`. |
| `.env` / `.env.example` | + `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`, `QB_ENVIRONMENT` (sandbox\|production), `QB_SYNC_CRON` (default `0 6 * * *`). |
| `package.json` / `script/build.ts` | + dep `intuit-oauth`; allowlist. |

### Dependencias nuevas
- `intuit-oauth` — cliente OAuth oficial de Intuit (maneja exchange + refresh).

## Variables de entorno

```
QB_CLIENT_ID=<intuit-app-client-id>
QB_CLIENT_SECRET=<intuit-app-client-secret>
QB_REDIRECT_URI=http://localhost:5000/api/qb/callback   # dev; en prod la URL real
QB_ENVIRONMENT=sandbox                                  # o production
QB_SYNC_CRON=0 6 * * *
```

`QB_REDIRECT_URI` debe estar registrado idéntico en la app Intuit Developer. `QB_ENVIRONMENT` determina la URL base de la API (`sandbox-quickbooks.api.intuit.com` vs `quickbooks.api.intuit.com`).

## Schema DB nuevo

```ts
export const quickbooksTokens = pgTable("quickbooks_tokens", {
  id: integer("id").primaryKey().default(1),       // single-row
  realmId: text("realm_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  environment: text("environment").notNull(),      // sandbox | production
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

Y constraint nuevo: `financials.period` recibe `.unique()` para soportar `onConflictDoUpdate`.

## Flujo OAuth

```
1) User click "Connect QuickBooks" en /finance
   → POST/GET /api/qb/connect (con sesión)
   → server: state = HMAC(SESSION_SECRET, random+timestamp)
            url = intuitClient.authorizeUri({ scope:'com.intuit.quickbooks.accounting', state })
   → 302 a `url` (host Intuit)

2) Intuit consent → redirect a QB_REDIRECT_URI
   → GET /api/qb/callback?code=...&realmId=...&state=...
   → server verifica state firmado (rechaza si no coincide o caduca)
   → intuitClient.createToken(fullCallbackUrl) → tokens
   → upsertQbTokens({ realmId, accessToken, refreshToken, expiresAt, environment })
   → 302 a `/#/finance`

3) Cualquier llamada a Reports API:
   → ensureValidAccessToken(): si expiresAt-now < 5min → intuitClient.refresh()
                                                     → upsert tokens
   → fetch con Authorization: Bearer ...
```

## Sync de P&L

```
syncProfitAndLoss(12):
  tokens = await getQbTokens(); if !tokens → throw "QB no conectado"
  await ensureValidAccessToken()
  endDate = último día del mes actual
  startDate = primer día de 11 meses atrás (12 meses rodantes)
  base = environment==='sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com'
  url = `${base}/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&summarize_column_by=Month&accounting_method=Accrual&minorversion=70`
  res = fetch(url, { headers: { Authorization: Bearer accessToken, Accept: 'application/json' } })
  json = await res.json()
  rows = parseProfitAndLossReport(json)  // → Array<{period, revenue, cogs, operatingExpenses, netIncome}>
  for (const r of rows) await storage.upsertFinancialPartial(r.period, r)
  await storage.updateQbLastSync(new Date())
  return { periods: rows.map(r=>r.period), updated: rows.length }
```

### Parser

`parseProfitAndLossReport(json)`:
- `json.Columns.Column[]` da los meses (primera col es etiqueta, resto son periodos YYYY-MM).
- Recorrer `json.Rows.Row[]` con `group="Income"`, `group="COGS"`, `group="Expenses"`, y la `Summary` row `group="NetIncome"`.
- Por cada grupo, extraer `.Summary.ColData[i].value` (i por columna mensual). Convertir string→number (vacío → 0).
- Para cada columna mensual, derivar el `period` como `YYYY-MM` (mismo formato que el seed actual de `financials.period`, ej. `"2026-01"`). Source: el `ColMetaData` de la columna trae `StartDate` en formato `YYYY-MM-DD`; tomar los primeros 7 caracteres.
- Construir array `[{ period: "YYYY-MM", revenue, cogs, operatingExpenses, netIncome }, ...]`.
- Función pura; recibe JSON, devuelve array. Sin dependencias.

## Endpoints

| Método | Ruta | Behavior |
|---|---|---|
| GET | `/api/qb/connect` | `state = sign()`; redirige (302) a Intuit con scope accounting + state. |
| GET | `/api/qb/callback` | Verifica state. `intuitClient.createToken(reqUrl)` → upsert tokens. 302 a `/#/finance`. Si error: 400 con mensaje claro. |
| POST | `/api/qb/sync` | `syncProfitAndLoss(12)`. Si no conectado → 400. Si error API → 502. Éxito → 200 `{ periods, updated }`. |
| GET | `/api/qb/status` | `{ connected: bool, realmId?, environment?, lastSyncAt? }`. |

Todos requieren `requireAuth` (la sesión sobrevive el round-trip a Intuit porque la cookie persiste).

## Cron

`registerQuickbooksSchedule()` (en `sync.ts`):
- `expr = process.env.QB_SYNC_CRON || "0 6 * * *"`, tz = `America/Los_Angeles`.
- `cron.validate(expr)`; si inválido → warn + skip.
- `cron.schedule(expr, () => syncProfitAndLoss(12).then(log).catch(error))`. Errores logueados, nunca tumban el proceso.
- Si no hay tokens al disparar → log "QB no conectado, skip" y retorna sin error.

## Frontend (finance.tsx — panel compacto)

Bloque arriba (encima del selector de mes o de las tarjetas). Hook `useQuery(["/api/qb/status"])` para refrescar estado.

- Si `connected:false` → botón "Connect QuickBooks" (link a `/api/qb/connect`, abre en la misma ventana para que el server redirija a Intuit).
- Si `connected:true` → "Connected · last sync: <relative time>" + botón "Sync now" (POST /api/qb/sync con toast del resultado).

Layout pequeño, no rompe el diseño existente. Reporta error toast si endpoint falla.

## Errores / edge cases

- Sin tokens → status `connected:false`; sync 400; cron skip.
- State inválido en callback → 400.
- Refresh token expirado (100d inactividad) → `ensureValidAccessToken` falla; marca disconnected (clearQbTokens) y reportar "Re-connect required" en el siguiente status.
- Estructura de reporte inesperada (parser no encuentra Income/COGS/Expenses) → log con snippet + lanza error claro; endpoint 502.
- API Intuit 401 (token revocado) → clearQbTokens + 401 propagado.
- Concurrencia: dos sync simultáneos → último gana (upsert idempotente). No se añade lock para QB-1.

## Seguridad

- `QB_CLIENT_SECRET` y tokens nunca en logs, frontend, o respuestas.
- State firmado anti-CSRF en OAuth.
- Tokens en DB; `.env` gitignored.
- `QB_REDIRECT_URI` debe usar HTTPS en producción (registrar la URL prod aparte en Intuit Developer).
- Endpoint `/api/qb/connect` y `/callback` exigen sesión (no se puede iniciar OAuth sin estar logueado).

## Testing / verificación

Sin runner unitario salvo Playwright (no aplica aquí). Manual:

1. `npm run db:push` aplica `quickbooks_tokens` + unique en `financials.period`.
2. `GET /api/qb/status` sin sesión → 401; con sesión sin conectar → `{connected:false}`.
3. Click "Connect QuickBooks" → flujo OAuth completo → vuelve a `/#/finance` → status `connected:true` con realmId.
4. `POST /api/qb/sync` → 200 `{periods:[12], updated:12}`. Verificar en DB:
   ```sql
   SELECT period, revenue, cogs, operating_expenses, net_income, cash_position, ar_total, ap_total FROM financials ORDER BY period;
   ```
   Las 4 columnas P&L cambian a valores QB; cashPosition/arTotal/apTotal conservan valor previo.
5. Cron temporal `*/2 * * * *` → confirmar log de disparo + sync.
6. Borrar fila qb tokens en DB → status connected:false; sync 400.
7. Parser: invocar `parseProfitAndLossReport(fixtureJson)` manualmente con un payload de prueba (sandbox QBO) y verificar el array resultante.

## Fuera de alcance explícito

- Almacenar el JSON crudo del reporte (no se necesita para QB-1).
- Multi-company / multi-tenant.
- Webhooks de QB (cuándo cambia algo, refrescar). Cron diario es suficiente.
- Cifrado at-rest de tokens en DB (Postgres ya cifrado en disco por Supabase; sin requerimiento extra acá).
