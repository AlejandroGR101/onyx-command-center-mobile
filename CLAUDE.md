# CLAUDE.md

Onboarding para Claude / Codex / cualquier IA o dev que ataque este repo.
Léelo antes de tocar código.

## Qué es este proyecto

**ONYX Command Center** — SPA web que opera la fábrica de discos de vinilo Onyx Record Press (Arcadia, CA). Cubre pipeline de producción, monitoreo de la prensa Pheenix AD12, mantenimiento, inventario, ventas/CRM, envíos FedEx/UPS, y finanzas en vivo con QuickBooks Online.

Estado: producción, sin deploy externo aún. Base de datos en Supabase (cloud Postgres).

Referencias clave:

- `discovery-report.md` — análisis funcional completo (módulos, flujos, riesgos).
- `docs/superpowers/specs/` — specs de cada feature (uno por sub-proyecto).
- `docs/superpowers/plans/` — implementation plans correspondientes.

## Stack

| Capa      | Tech                                                                               |
| --------- | ---------------------------------------------------------------------------------- |
| Frontend  | React 18 + Vite 7 + TanStack Query 5 + Wouter routing (hash) + Radix UI + Tailwind |
| Backend   | Express 5 + Passport.js (local) + express-session + connect-pg-simple              |
| ORM       | Drizzle 0.45.x + node-postgres (`pg`) sobre Supabase (session pooler)              |
| Auth      | bcryptjs + sesiones server-side, single admin user                                 |
| Email     | Resend (alertas internas)                                                          |
| External  | QuickBooks Online (OAuth 2.0 vía intuit-oauth)                                     |
| Scheduler | node-cron 4.x (in-process, single instance)                                        |
| Build     | Vite (cliente) + esbuild (servidor) → `dist/index.cjs`                             |
| Tests     | Vitest (unit) + Playwright (E2E login)                                             |
| CI        | GitHub Actions (typecheck + tests + build en push/PR a main)                       |

## Quickstart

```bash
# 1. Setup
cp .env.example .env       # llenar valores (ver sección Env)
npm install
npm run db:migrate         # aplica baseline + cualquier pending
npm run db:seed            # idempotente, datos de discovery report

# 2. Dev
npm run dev                # tsx watch → auto-reinicia al guardar

# 3. Verificaciones
npm run check              # tsc
npm test                   # 27 unit tests (parsers QB)
npm run build              # vite + esbuild
```

App corre en `http://localhost:5000` (mismo origen para API + cliente).
Login default: `Admin` / `OnyxCCD` (cambiar en `.env` via `ADMIN_USERNAME`/`ADMIN_PASSWORD`).

## Convenciones críticas

### 1. PowerShell, no Bash inline

La máquina dev es Windows. Las verificaciones live de endpoints van por **PowerShell**, no Bash. Gotchas:

- `curl` en PS es alias de Invoke-WebRequest → siempre usar `curl.exe`.
- PowerShell rompe quoting de JSON inline (`-d '{"a":"b"}'`). **Solución:** escribir body a archivo temporal:
  ```powershell
  '{"username":"Admin","password":"OnyxCCD"}' | Out-File -Encoding ascii body.json
  curl.exe -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" --data "@body.json"
  Remove-Item body.json
  ```
- `Start-Process -FilePath npm` falla con "not Win32 application" (npm es .cmd wrapper). Para arrancar el server en background, usar **Bash tool con `run_in_background: true`** corriendo `npm run dev`.
- Para matar el server tras tests: `Get-Process node | Stop-Process -Force`.

### 2. DB migrations versionadas — NUNCA db:push

El proyecto migró de `drizzle-kit push` (interactivo, drift) a migrations versionadas:

```bash
# Cambio de schema
1. editar shared/schema.ts
2. npm run db:generate -- --name=<short_description>
3. revisar migrations/NNNN_<name>.sql (editar si necesita IF NOT EXISTS u otros guards)
4. npm run db:migrate    # aplica pending, registra en drizzle.__drizzle_migrations
5. commit migrations/NNNN_<name>.sql + migrations/meta/
```

**No usar `drizzle-kit push` directo** — drift entre envs. El comando ya no está en scripts.

Si necesitas hacer cambios DDL ad-hoc en Supabase (no recomendado), usa `node -e "..."` con SQL idempotente — y crea la migration equivalente después para que el journal refleje el estado.

### 3. Env validation at boot (Zod)

`server/env.ts` valida `process.env` y `process.exit(1)` si falta algo crítico. Importado primero en `server/index.ts` después de `dotenv/config`. Si añades nueva env var server-side, agrégala al schema con required/optional + tipo. Defaults gentiles solo para vars con sentido sin config.

### 4. Auth pattern

- `app.use("/api", requireAuth)` es el primer statement de `registerRoutes` → todo `/api/*` requiere sesión por defecto.
- Excepciones: `/api/auth/*` (montadas en `setupAuth` antes de `registerRoutes`), `/api/health` (registrada antes del middleware).
- Si añades nuevo endpoint público, regístralo ANTES de `app.use("/api", requireAuth)` en `routes.ts`.
- Login tiene rate limit (5 fallos/15min/IP, `skipSuccessfulRequests: true`).

### 5. Storage abstraction

`IStorage` (interfaz) implementada por `DrizzleStorage` (prod, en `server/storage.ts`) y `MemStorage` (legacy, intacta para tests). Las rutas usan `storage.*` — nunca importar `db` directamente desde rutas (excepto para queries one-off como `/api/health` ping).

Pattern para nuevos métodos:

- Añadir signature en `interface IStorage`.
- Implementar en `DrizzleStorage`.
- Implementar stub en `MemStorage` (mantiene compilación; tests no usan MemStorage para datos reales).

### 6. QB integration shape (5 fases ya implementadas)

| Fase  | Responsabilidad                                           |
| ----- | --------------------------------------------------------- |
| QB-1  | OAuth + tokens + P&L summary (`syncProfitAndLoss`)        |
| QB-2  | P&L line items (`financial_line_items`)                   |
| QB-3  | Balance Sheet + AR aging + side-effect cash/ap/ar metrics |
| QB-4  | Customer mapping (jobs ↔ qb_customers + auto-match)       |
| (orq) | `syncAll(months)` ejecuta los 4 secuencialmente fail-fast |

Files clave:

- `server/quickbooks/oauth.ts` — token CRUD + signed state HMAC + `ensureValidAccessToken`.
- `server/quickbooks/parse.ts` — **funciones puras**, todas testeadas. **Si tocas un parser, añade test en `tests/quickbooks/parse.test.ts`**.
- `server/quickbooks/sync.ts` — fetch + parse + persist. Cron diario via `registerQuickbooksSchedule`.

Endpoints QB: `/api/qb/{status,connect,callback,sync,customers}` y `/api/financials/{line-items,balance-sheet}`.

### 7. Cron in-process

`node-cron` corre en el mismo proceso que el server. Funciona para single-instance. Si despliegas multi-instance, **cada instancia disparará el cron** → dup-sync. Soluciones futuras: lock distribuido (Postgres `pg_advisory_lock`) o extraer a worker dedicado.

Schedules actuales:

- `[notifications]` — digest email 8am LA daily.
- `[quickbooks]` — `syncAll(12)` 6am LA daily.

Logs al arrancar: `[<name>] schedule registrado: "<expr>" (<tz>)`.

### 8. Testing

- **Unit (vitest):** `tests/**/*.test.ts`. Hoy solo cubre parsers QB (27 tests). Funciones puras = candidatas obvias. Para storage/sync que dependen de DB, integration tests futuros.
- **E2E (Playwright):** `tests/login.spec.ts`. Necesita server corriendo en :5000 con DB up.
- **CI:** `npm test` corre en cada push/PR a main.
- Si añades parser nuevo en `parse.ts`, **escribe test con fixture inline** (mismo pattern que los 5 existentes).

## Arquitectura — mapa de archivos

```
shared/schema.ts         # Drizzle pgTable + zod insertSchemas + tipos. Source of truth.
server/
  env.ts                 # Zod env validation (importado primero por index.ts)
  index.ts               # Express bootstrap: session+passport, schedulers, routes
  auth.ts                # passport-local, requireAuth, /api/auth/* endpoints
  db.ts                  # pg Pool + drizzle client
  storage.ts             # IStorage + DrizzleStorage + MemStorage (legacy)
  routes.ts              # /api/* handlers (excepto /api/auth/*)
  email.ts               # Resend transport
  notifications.ts       # Overdue digest + cron
  quickbooks/
    oauth.ts             # tokens + state HMAC
    parse.ts             # 5 parsers puros (TESTED)
    sync.ts              # syncAll + 4 sub-syncs + cron
  seed.ts                # Idempotent seed data
  migrate.ts             # drizzle-orm migrator runner
client/src/
  App.tsx                # AuthGate + Router (Wouter, hash)
  pages/                 # Una page por módulo (finance, pipeline, leads, etc.)
  lib/
    authContext.tsx      # Server-side session (no hardcoded creds)
    queryClient.ts       # apiRequest + TanStack config (staleTime: Infinity por default)
  hooks/use-toast.ts     # toast({title, description, variant})
migrations/              # Versioned SQL + meta journal
docs/superpowers/        # Specs + plans (workflow brainstorm→plan→implement)
.github/workflows/ci.yml # tsc + vitest + build
script/build.ts          # Production bundle (esbuild + vite); allowlist controla qué deps bundle
```

## Env vars (server)

Required:

- `DATABASE_URL` — Supabase session pooler (puerto 5432). Falla boot si falta.
- `SESSION_SECRET` — ≥ 32 chars random. Gen: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

Optional con defaults:

- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — semilla del usuario admin (default Admin/OnyxCCD).
- `PORT` (5000), `NODE_ENV` (development), `ALERT_CRON` (`0 8 * * *`), `ALERT_TZ` (`America/Los_Angeles`), `QB_SYNC_CRON` (`0 6 * * *`).

Optional features (degradan con warn, no fail):

- Resend: `RESEND_API_KEY`, `ALERT_FROM`, `ALERT_RECIPIENTS`.
- QuickBooks: `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`, `QB_ENVIRONMENT` (sandbox|production).
- Sentry error tracking: `SENTRY_DSN` (backend) + `VITE_SENTRY_DSN` (frontend, expuesto en bundle). Si vacíos → no-op silencioso.

`.env.example` tiene placeholders. **`.env` está gitignored — nunca commitearlo.**

## Workflow de feature (superpowers)

El proyecto sigue el flow `brainstorming → writing-plans → subagent-driven-development`:

1. **brainstorming** — explora alcance, decisiones, propone 2-3 enfoques, presenta diseño, escribe spec a `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. **writing-plans** — desglosa spec en tasks bite-sized (cada step 2-5 min), código completo en cada step. Plan a `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
3. **subagent-driven-development** — despacha implementer + 2 reviewers (spec compliance + code quality) por task. Fresh subagent por task = sin pollution de contexto.

Tras todas las tasks: review holístico + `finishing-a-development-branch` (merge/PR/etc).

## Antipatrones a evitar

- **No commitear `.env`** ni secretos en código. Si un secreto se filtra en un transcript → rotar inmediatamente.
- **No usar `drizzle-kit push`** (drift). Usar el flow versionado de §2.
- **No usar `console.log` en código nuevo** sin un wrapper (mientras no haya pino aún, OK ad-hoc; cuando se implemente `#12` migrar todos).
- **No tocar `parse.ts`** sin actualizar `tests/quickbooks/parse.test.ts`. CI lo atrapará pero mejor mantener sincronía.
- **No hacer requests Drizzle con identifiers user-controlled** (SQL injection en identifiers fue el motivo del upgrade 0.39→0.45). Columns siempre son refs estáticos de schema.
- **No olvidar `requireAuth`** en endpoints `/api/*` que manejan data. El middleware global lo cubre, pero si registras antes del `app.use` se hace público (intencional para `/api/health`).
- **No spinnar tareas sin pasar por brainstorming/writing-plans** para feature work. Mantiene calidad de spec y review checkpoints.

## Integrations status

| Servicio                     | Estado                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Supabase Postgres            | ✅ Conectado. Free tier auto-pausa tras inactividad — Resume en dashboard si falla DB con "tenant not found".                |
| Resend (email)               | ✅ API key configurada. From `onboarding@resend.dev` (limita a 1 recipient verificado). Verificar dominio onyx para escalar. |
| QuickBooks Online            | ✅ Sandbox app creada. Token persistence + auto-refresh. Browser OAuth flow validado E2E pendiente.                          |
| FedEx / UPS                  | ❌ Sidebar muestra "connected" pero sin código. Próximo P1.                                                                  |
| Monday.com / Gmail / Slack   | ❌ Decorativos. No prioritarios.                                                                                             |
| Beckhoff PLC (AD12 sensores) | ❌ Datos simulados. Futuro P2 (OPC-UA).                                                                                      |

## Pending senior tasks (tracked)

- **#1** rotar password Supabase (apareció en transcript inicial; postergado).
- **#4** mutex refresh QB token (race condition bajo carga real).
- **#12** Pino structured logs (reemplazar console.\*).
- **#13** Sentry error tracking.
- **#16** Frontend code-splitting (bundle ~925KB → -50% target).
- **#17** Resend dominio propio.
- ESLint + Prettier + husky + commitlint.
- Branch protection en main (require PR + status checks).
- T7 browser OAuth + QB sync verify (acumulado QB-1..4).
