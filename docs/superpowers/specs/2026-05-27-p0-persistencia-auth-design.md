# P0 — Persistencia PostgreSQL + Auth Server-Side

**Fecha:** 2026-05-27
**Rama:** backend-func
**Riesgos cubiertos:** R1 (MemStorage → pérdida de datos), R2 (credenciales hardcoded en frontend)
**Fuente:** discovery-report.md §15 Fase 1

## Objetivo

Eliminar los dos riesgos catastróficos P0:

1. **R1** — Toda la persistencia vive en `MemStorage` (Maps en RAM). Reinicio del servidor = pérdida total de datos. Migrar a PostgreSQL real (Supabase) vía Drizzle ORM.
2. **R2** — Credenciales `Admin`/`OnyxCCD` hardcodeadas en JS público (`client/src/lib/authContext.tsx:15`). Mover validación al servidor con passport-local + bcrypt + sesiones server-side.

Fuera de alcance (queda P2): multi-usuario con roles. Se implementa un solo usuario admin server-side.

## Estado actual

- `server/storage.ts` (1220 líneas): solo `MemStorage implements IStorage`. `export const storage = new MemStorage()` (línea 1219). Seed inline en `seedData()`.
- `shared/schema.ts`: esquema Drizzle completo (11 tablas pgTable + drizzle-zod). Sin tabla `users`.
- `server/routes.ts`: rutas `/api/*` usan `storage.*`. Sin middleware de auth.
- `server/index.ts`: Express + http server. Sin express-session, sin passport.
- `drizzle.config.ts`: lee `process.env.DATABASE_URL`, dialect postgresql, schema `./shared/schema.ts`, out `./migrations`.
- Deps ya instaladas: `pg`, `drizzle-orm`, `drizzle-zod`, `drizzle-kit`, `connect-pg-simple`, `express-session`, `passport`, `passport-local`, `memorystore`.
- NO existe: `.env`, `server/db.ts`, tabla `users`, carga de env (ningún script carga `.env`).

## Decisiones (brainstorming)

| Decisión | Elección |
|---|---|
| Destino DB | Cloud — Supabase |
| Alcance P0 | R1 + R2 juntos (R2 depende de R1: users + session store en DB) |
| Auth scope | Single Admin server-side (roles = P2) |
| Seed data | Migrar dataset actual a DB, idempotente (insertar solo si tabla vacía) |
| Storage | `DrizzleStorage` reemplaza `MemStorage`, misma interfaz `IStorage` (rutas no cambian) |

## Conexión Supabase

Session pooler (sirve runtime + migraciones):

```
host:     aws-1-us-west-2.pooler.supabase.com
port:     5432
database: postgres
user:     postgres.tmnfswtdoxzqeumrmtkj
password: <en .env, no en repo>
```

`DATABASE_URL=postgresql://postgres.tmnfswtdoxzqeumrmtkj:<PASSWORD>@aws-1-us-west-2.pooler.supabase.com:5432/postgres`

SSL requerido: pool con `ssl: { rejectUnauthorized: false }`.

## Componentes

### Nuevos archivos

| Archivo | Propósito |
|---|---|
| `server/db.ts` | Pool `pg` + cliente Drizzle (`drizzle(pool, { schema })`). SSL on. Lee `DATABASE_URL`. |
| `server/seed.ts` | Seed idempotente. Mueve datos de `MemStorage.seedData()`. Inserta por tabla solo si `count === 0`. Siembra usuario admin (bcrypt). |
| `server/auth.ts` | Config passport-local, serialize/deserialize, express-session + connect-pg-simple, middleware `requireAuth`, registro de endpoints `/api/auth/*`. |
| `.env.example` | Plantilla: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. |
| `.env` | Valores reales. Gitignored. |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `shared/schema.ts` | + tabla `users` (id serial PK, username text unique notNull, passwordHash text notNull, role text default `'admin'`, createdAt timestamp default now). + insert schema drizzle-zod. |
| `server/storage.ts` | + clase `DrizzleStorage implements IStorage` (todos los métodos vía Drizzle). + métodos `getUserByUsername`, `createUser` en `IStorage`. `export const storage = new DrizzleStorage()`. `MemStorage` puede quedar como referencia o eliminarse; el seed inline migra a `seed.ts`. |
| `server/index.ts` | `import 'dotenv/config'` al tope. Montar express-session + passport ANTES de `registerRoutes`. |
| `server/routes.ts` | Aplicar `requireAuth` a `/api/*` excepto `/api/auth/login` y `/api/auth/me`. |
| `client/src/lib/authContext.tsx` | Borrar `VALID_CREDENTIALS`. `login()` async → `POST /api/auth/login`. Estado inicial via `GET /api/auth/me`. `logout()` → `POST /api/auth/logout`. Firma `login` pasa a `Promise<boolean>`. |
| `client/src/` (consumidores de `useAuth`) | Ajustar a `login` async (await). |
| `package.json` | + script `db:seed`. + deps `bcryptjs`, `@types/bcryptjs`, `dotenv`. |
| `drizzle.config.ts` | `import 'dotenv/config'` al tope (asegurar carga de `DATABASE_URL`). |
| `.gitignore` | Asegurar `.env`. |

### Dependencias nuevas

- `bcryptjs` + `@types/bcryptjs` — hash puro JS, sin build nativo (Windows-friendly).
- `dotenv` — cargar `.env` en runtime y scripts (hoy nada lo carga).

## Auth — flujo

```
POST /api/auth/login   body {username,password} → passport-local → bcrypt.compare vs users.passwordHash
                       → éxito: session cookie + 200 {user}; fallo: 401
POST /api/auth/logout  → req.logout + destruye sesión → 200
GET  /api/auth/me      → sesión válida: 200 {user}; sin sesión: 401
```

- Sesiones server-side: tabla `session` gestionada por connect-pg-simple (auto-crea con `createTableIfMissing: true`).
- Cookie: httpOnly, `secure` en producción, `sameSite: 'lax'`.
- `SESSION_SECRET` desde env.
- `requireAuth`: si `req.isAuthenticated()` → next; si no → 401.
- Admin sembrado desde `ADMIN_USERNAME`/`ADMIN_PASSWORD` (fallback `Admin`/`OnyxCCD`), hash bcrypt en `seed.ts`.

## Flujo de datos

```
Browser → GET /api/auth/me (al cargar) → 401 → muestra login
        → POST /api/auth/login → cookie sesión → app
Request /api/jobs → requireAuth (sesión OK) → DrizzleStorage.getJobs() → pg pool → Supabase
```

## Setup / migraciones

1. `npm run db:push` — crea tablas en Supabase (incluye `users`). Session pooler 5432 sirve.
2. `npm run db:seed` — siembra datos idempotentes + admin.
3. `npm run dev` — app contra DB real.

## Orden de implementación (fases)

1. **Infra base** — deps (`bcryptjs`, `@types/bcryptjs`, `dotenv`), `.env`/`.env.example`, `.gitignore`, tabla `users` en schema, dotenv en `drizzle.config.ts` + `index.ts`.
2. **DB + push** — `server/db.ts`, `npm run db:push`. Verificar conexión real a Supabase (tablas creadas).
3. **DrizzleStorage + seed** — implementar clase, `seed.ts`, script `db:seed`. Verificar: datos en DB, reinicio del server NO pierde datos.
4. **Auth servidor** — `auth.ts`, session+passport en `index.ts`, `requireAuth` en `routes.ts`, endpoints. Verificar: `/api/jobs` sin sesión → 401; login → 200.
5. **Frontend auth** — `authContext.tsx` async contra servidor, ajustar consumidores. Verificar login/logout E2E (Playwright).

## Errores / edge cases

- `DATABASE_URL` ausente → fallo claro al arrancar (drizzle.config ya lanza; replicar en `db.ts`).
- SSL Supabase → `ssl: { rejectUnauthorized: false }`.
- 401 en frontend → redirige a login (AuthGate).
- Seed re-ejecutado → no duplica (chequeo `count === 0` por tabla).
- Password admin solo se hashea/inserta si no existe el usuario.

## Testing / verificación

Manual por fase + Playwright para login E2E (ya instalado):

- Fase 2: `db:push` crea tablas (verificar en Supabase dashboard / `\dt`).
- Fase 3: crear/editar registro, reiniciar `npm run dev`, dato persiste.
- Fase 4: `curl /api/jobs` sin cookie → 401; con login → 200.
- Fase 5: login con credenciales correctas/incorrectas, logout, recarga mantiene sesión.

## Seguridad

- `.env` gitignored; nunca commitear `DATABASE_URL` ni `SESSION_SECRET`.
- Password DB y session secret solo en `.env`.
- bcrypt cost factor 10+.
- Recomendar rotar password de DB si se expuso en chat.
- Cookies httpOnly + secure(prod).
