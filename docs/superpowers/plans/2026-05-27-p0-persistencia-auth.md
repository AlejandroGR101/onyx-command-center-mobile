# P0 — Persistencia PostgreSQL + Auth Server-Side — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar persistencia de `MemStorage` (RAM) a PostgreSQL real (Supabase) vía Drizzle, y mover la autenticación del frontend hardcoded a sesiones server-side con passport-local + bcrypt.

**Architecture:** `DrizzleStorage` implementa la interfaz `IStorage` existente y reemplaza a `MemStorage` (las rutas no cambian). Seed se extrae a script idempotente. Auth usa passport-local contra tabla `users` (bcrypt), sesiones server-side en tabla `session` (connect-pg-simple), middleware `requireAuth` protege `/api/*`.

**Tech Stack:** Express 5, Drizzle ORM + node-postgres (`pg`), Supabase (session pooler 5432), passport / passport-local, express-session + connect-pg-simple, bcryptjs, dotenv, React + TanStack Query (frontend).

**Spec:** `docs/superpowers/specs/2026-05-27-p0-persistencia-auth-design.md`

**Nota sobre testing:** El repo no tiene runner de tests unitarios. La verificación es por comandos: `tsc` (typecheck), `curl` (endpoints), `npm run dev` (arranque + persistencia), y Playwright (login E2E, ya instalado). No se fuerzan tests unitarios donde no hay harness.

**Prerequisito del usuario:** `.env` con `DATABASE_URL` real (password de Supabase rellenado) y `SESSION_SECRET` aleatorio. Sin esto, las tareas 4+ fallan.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `server/db.ts` (crear) | Pool `pg` + cliente Drizzle. Único punto de conexión a DB. |
| `shared/schema.ts` (modificar) | + tabla `users` + insert schema + tipos. |
| `server/storage.ts` (modificar) | + `getUserByUsername`/`createUser` en `IStorage`; + clase `DrizzleStorage`; swap del export. |
| `server/seed.ts` (crear) | Seed idempotente (datos relocalizados de `MemStorage.seedData()`) + usuario admin. |
| `server/auth.ts` (crear) | Config passport/session, endpoints `/api/auth/*`, middleware `requireAuth`. |
| `server/index.ts` (modificar) | `dotenv/config`; montar session + passport antes de rutas. |
| `server/routes.ts` (modificar) | Aplicar `requireAuth` a `/api/*`. |
| `drizzle.config.ts` (modificar) | `dotenv/config`. |
| `script/build.ts` (modificar) | + `bcryptjs`, `dotenv` al allowlist. |
| `client/src/lib/authContext.tsx` (modificar) | Auth async contra servidor. |
| `client/src/pages/login.tsx` (modificar) | `handleSubmit` async. |
| `client/src/App.tsx` (modificar) | AuthGate con estado de carga. |
| `client/src/components/TopBar.tsx` (modificar) | `logout` async. |
| `tests/login.spec.ts` (crear) | Playwright E2E login/logout. |
| `.env` / `.env.example` (ya creados) | Variables de entorno. |

---

## Task 1: Dependencias + wiring dotenv

**Files:**
- Modify: `package.json` (deps + script)
- Modify: `script/build.ts:7-33` (allowlist)
- Modify: `drizzle.config.ts:1`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install bcryptjs dotenv
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Añadir script `db:seed` a package.json**

En `package.json`, sección `"scripts"`, añadir tras la línea `"db:push"`:

```json
    "db:push": "drizzle-kit push",
    "db:seed": "cross-env tsx server/seed.ts"
```

- [ ] **Step 3: Añadir bcryptjs y dotenv al allowlist de build**

En `script/build.ts`, dentro del array `allowlist` (líneas 7-33), añadir dos entradas (orden alfabético aproximado, da igual el orden exacto):

```ts
const allowlist = [
  "@google/generative-ai",
  "axios",
  "bcryptjs",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "dotenv",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];
```

- [ ] **Step 4: Cargar dotenv en drizzle.config.ts**

En `drizzle.config.ts`, añadir como PRIMERA línea del archivo:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";
```

- [ ] **Step 5: Verificar instalación**

Run: `npm ls bcryptjs dotenv @types/bcryptjs`
Expected: las tres aparecen con versión, sin `(empty)` ni `UNMET`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json script/build.ts drizzle.config.ts
git commit -m "chore: add bcryptjs, dotenv deps and db:seed script"
```

---

## Task 2: Tabla `users` en el esquema

**Files:**
- Modify: `shared/schema.ts` (añadir tabla + schema + tipos)

- [ ] **Step 1: Añadir tabla `users` y su insert schema**

En `shared/schema.ts`, tras el bloque `pressLogs` / `insertPressLogSchema` (línea ~271, antes de los `export type`), añadir:

```ts
// Users — server-side auth (single admin for now; roles = P2)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"), // admin (Operator/Sales = P2)
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
```

- [ ] **Step 2: Añadir tipos de `users`**

Al final de `shared/schema.ts`, tras `export type InsertPressLog = ...`, añadir:

```ts
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run check`
Expected: PASS (sin errores en `shared/schema.ts`). Puede haber errores preexistentes no relacionados; confirmar que ninguno menciona `users` ni `schema.ts`.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: add users table to schema for server-side auth"
```

---

## Task 3: Cliente de base de datos (`server/db.ts`)

**Files:**
- Create: `server/db.ts`

- [ ] **Step 1: Crear server/db.ts**

```ts
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida. Revisa tu archivo .env");
}

// Supabase requiere SSL
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS para `server/db.ts` (sin errores que mencionen `db.ts`).

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "feat: add postgres pool + drizzle client (server/db.ts)"
```

---

## Task 4: Crear tablas en Supabase (`db:push`)

**Files:** ninguno (operación de DB)

**Prerequisito:** `.env` con `DATABASE_URL` real (password rellenado).

- [ ] **Step 1: Ejecutar push del esquema**

Run: `npm run db:push`
Expected: drizzle-kit conecta a Supabase y crea las 12 tablas (`jobs`, `production_runs`, `financials`, `maintenance_tasks`, `sensor_readings`, `inventory`, `ar_aging`, `shipments`, `leads`, `vendors`, `press_logs`, `users`). Salida termina sin error de conexión.

Si falla con error de conexión: verificar que `DATABASE_URL` tiene el password correcto y el host es el session pooler (`aws-1-us-west-2.pooler.supabase.com:5432`).

- [ ] **Step 2: Verificar tablas creadas**

Run:
```bash
node -e "import('dotenv/config').then(async()=>{const{Pool}=await import('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});const r=await p.query(\"select table_name from information_schema.tables where table_schema='public' order by table_name\");console.log(r.rows.map(x=>x.table_name).join('\n'));await p.end();})"
```
Expected: lista que incluye las 12 tablas, entre ellas `users`.

- [ ] **Step 3: (sin commit — no hay cambios de archivos)**

Nota: no hay archivos que commitear en esta tarea.

---

## Task 5: `DrizzleStorage` reemplaza `MemStorage`

**Files:**
- Modify: `server/storage.ts` (interfaz `IStorage`, clase nueva, export)

- [ ] **Step 1: Añadir métodos de users a la interfaz IStorage**

En `server/storage.ts`, dentro de `export interface IStorage { ... }`, tras la sección `// Press Logs` (antes del `}` de cierre de la interfaz, ~línea 65), añadir:

```ts
  // Users
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
```

- [ ] **Step 2: Ampliar el import de tipos**

En `server/storage.ts`, en el bloque `import type { ... } from "@shared/schema";` (líneas 1-13), añadir `User, InsertUser`:

```ts
  PressLog, InsertPressLog,
  User, InsertUser,
} from "@shared/schema";
```

- [ ] **Step 3: Crear la clase DrizzleStorage**

En `server/storage.ts`, JUSTO ANTES de la línea `export const storage = new MemStorage();` (línea ~1219), añadir la clase completa. Importar al tope del archivo (tras los imports de tipos):

```ts
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  jobs, productionRuns, financials, maintenanceTasks, sensorReadings,
  inventory, arAging, shipments, leads, vendors, pressLogs, users,
} from "@shared/schema";
```

Y la clase:

```ts
export class DrizzleStorage implements IStorage {
  // Jobs
  async getJobs(): Promise<Job[]> {
    return db.select().from(jobs);
  }
  async getJob(id: number): Promise<Job | undefined> {
    const r = await db.select().from(jobs).where(eq(jobs.id, id));
    return r[0];
  }
  async getJobsByStatus(status: string): Promise<Job[]> {
    return db.select().from(jobs).where(eq(jobs.status, status));
  }
  async createJob(job: InsertJob): Promise<Job> {
    const r = await db.insert(jobs).values(job).returning();
    return r[0];
  }
  async updateJob(id: number, updates: Partial<InsertJob>): Promise<Job | undefined> {
    const r = await db.update(jobs).set(updates).where(eq(jobs.id, id)).returning();
    return r[0];
  }

  // Production Runs
  async getProductionRuns(): Promise<ProductionRun[]> {
    return db.select().from(productionRuns);
  }
  async getProductionRunsByJob(jobId: string): Promise<ProductionRun[]> {
    return db.select().from(productionRuns).where(eq(productionRuns.jobId, jobId));
  }
  async createProductionRun(run: InsertProductionRun): Promise<ProductionRun> {
    const r = await db.insert(productionRuns).values(run).returning();
    return r[0];
  }

  // Financials
  async getFinancials(): Promise<Financial[]> {
    return db.select().from(financials);
  }
  async getFinancialByPeriod(period: string): Promise<Financial | undefined> {
    const r = await db.select().from(financials).where(eq(financials.period, period));
    return r[0];
  }

  // Maintenance
  async getMaintenanceTasks(): Promise<MaintenanceTask[]> {
    return db.select().from(maintenanceTasks);
  }
  async updateMaintenanceTask(id: number, updates: Partial<InsertMaintenanceTask>): Promise<MaintenanceTask | undefined> {
    const r = await db.update(maintenanceTasks).set(updates).where(eq(maintenanceTasks.id, id)).returning();
    return r[0];
  }

  // Sensors
  async getSensorReadings(sensorType?: string, limit?: number): Promise<SensorReading[]> {
    const rows = sensorType
      ? await db.select().from(sensorReadings).where(eq(sensorReadings.sensorType, sensorType))
      : await db.select().from(sensorReadings);
    return limit ? rows.slice(0, limit) : rows;
  }
  async createSensorReading(reading: InsertSensorReading): Promise<SensorReading> {
    const r = await db.insert(sensorReadings).values(reading).returning();
    return r[0];
  }

  // Inventory
  async getInventory(): Promise<InventoryItem[]> {
    return db.select().from(inventory);
  }
  async updateInventoryItem(id: number, updates: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const r = await db.update(inventory).set(updates).where(eq(inventory.id, id)).returning();
    return r[0];
  }

  // AR Aging
  async getArAging(): Promise<ArAgingItem[]> {
    return db.select().from(arAging);
  }

  // Shipments
  async getShipments(): Promise<Shipment[]> {
    return db.select().from(shipments);
  }
  async getShipmentsByJob(jobId: string): Promise<Shipment[]> {
    return db.select().from(shipments).where(eq(shipments.jobId, jobId));
  }

  // Leads
  async getLeads(): Promise<Lead[]> {
    return db.select().from(leads);
  }
  async getLead(id: number): Promise<Lead | undefined> {
    const r = await db.select().from(leads).where(eq(leads.id, id));
    return r[0];
  }
  async createLead(lead: InsertLead): Promise<Lead> {
    const r = await db.insert(leads).values(lead).returning();
    return r[0];
  }
  async updateLead(id: number, updates: Partial<InsertLead>): Promise<Lead | undefined> {
    const r = await db.update(leads).set(updates).where(eq(leads.id, id)).returning();
    return r[0];
  }

  // Vendors
  async getVendors(): Promise<Vendor[]> {
    return db.select().from(vendors);
  }
  async getVendor(id: number): Promise<Vendor | undefined> {
    const r = await db.select().from(vendors).where(eq(vendors.id, id));
    return r[0];
  }

  // Press Logs
  async getPressLogs(): Promise<PressLog[]> {
    return db.select().from(pressLogs);
  }
  async getPressLog(id: number): Promise<PressLog | undefined> {
    const r = await db.select().from(pressLogs).where(eq(pressLogs.id, id));
    return r[0];
  }
  async createPressLog(log: InsertPressLog): Promise<PressLog> {
    const r = await db.insert(pressLogs).values(log).returning();
    return r[0];
  }
  async updatePressLog(id: number, updates: Partial<InsertPressLog>): Promise<PressLog | undefined> {
    const r = await db.update(pressLogs).set(updates).where(eq(pressLogs.id, id)).returning();
    return r[0];
  }

  // Users
  async getUserByUsername(username: string): Promise<User | undefined> {
    const r = await db.select().from(users).where(eq(users.username, username));
    return r[0];
  }
  async createUser(user: InsertUser): Promise<User> {
    const r = await db.insert(users).values(user).returning();
    return r[0];
  }
}
```

Nota: `MemStorage` se conserva en el archivo (referencia histórica), pero también debe declarar los dos métodos nuevos de la interfaz para no romper `implements IStorage`. Añadir dentro de `MemStorage` (junto a un `Map` `private usersMap = new Map<number, User>()`):

```ts
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.usersMap.values()).find(u => u.username === username);
  }
  async createUser(user: InsertUser): Promise<User> {
    const id = this.getNextId();
    const created = { ...user, id, createdAt: new Date() } as User;
    this.usersMap.set(id, created);
    return created;
  }
```

(Declarar `private usersMap: Map<number, User> = new Map();` junto a los otros Maps al inicio de `MemStorage`.)

- [ ] **Step 4: Cambiar el export a DrizzleStorage**

En `server/storage.ts`, última línea:

```ts
export const storage = new DrizzleStorage();
```

- [ ] **Step 5: Verificar typecheck**

Run: `npm run check`
Expected: PASS (sin errores en `storage.ts`). Tanto `MemStorage` como `DrizzleStorage` deben satisfacer `IStorage`.

- [ ] **Step 6: Verificar arranque con DB vacía**

Run (en una terminal): `npm run dev`
En otra: `curl http://localhost:5000/api/jobs`
Expected: `[]` (array vacío — tablas creadas pero aún sin seed). Sin error 500. Detener `npm run dev` tras verificar.

- [ ] **Step 7: Commit**

```bash
git add server/storage.ts
git commit -m "feat: DrizzleStorage backed by postgres, replaces MemStorage"
```

---

## Task 6: Seed idempotente (`server/seed.ts`)

**Files:**
- Create: `server/seed.ts`

**Contexto:** Los datos seed actuales están en `server/storage.ts` dentro de `MemStorage.seedData()` (arrays `jobsData`, `financialsData`, `runsData`, `maintenanceData`, `inventoryData`, `arData`, `shipmentsData`, `leadsData`, y los de vendors/pressLogs si existen, más la generación de `sensorReadings`). Este task RELOCALIZA esos arrays a `seed.ts` e inserta vía Drizzle. Copiar los arrays VERBATIM desde `storage.ts` (no reescribir los valores).

- [ ] **Step 1: Crear server/seed.ts con estructura idempotente + admin**

Estructura base (copiar dentro cada array de datos desde `MemStorage.seedData()`):

```ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, pool } from "./db";
import {
  jobs, productionRuns, financials, maintenanceTasks, sensorReadings,
  inventory, arAging, shipments, leads, vendors, pressLogs, users,
} from "@shared/schema";
import type {
  InsertJob, InsertProductionRun, InsertFinancial, InsertMaintenanceTask,
  InsertInventoryItem, InsertArAgingItem, InsertShipment, InsertLead,
  InsertVendor, InsertPressLog,
} from "@shared/schema";

// Inserta `rows` en `table` solo si la tabla está vacía. Idempotente.
async function seedIfEmpty<T extends Record<string, any>>(
  table: any, rows: T[], label: string,
) {
  const existing = await db.select().from(table).limit(1);
  if (existing.length > 0) {
    console.log(`skip ${label}: ya tiene datos`);
    return;
  }
  if (rows.length === 0) {
    console.log(`skip ${label}: sin datos seed`);
    return;
  }
  await db.insert(table).values(rows);
  console.log(`seeded ${label}: ${rows.length} filas`);
}

async function seedUsers() {
  const username = process.env.ADMIN_USERNAME || "Admin";
  const password = process.env.ADMIN_PASSWORD || "OnyxCCD";
  const existing = await db.select().from(users).where(eq(users.username, username));
  if (existing.length > 0) {
    console.log("skip users: admin ya existe");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({ username, passwordHash, role: "admin" });
  console.log(`seeded admin user: ${username}`);
}

async function main() {
  // ── DATOS RELOCALIZADOS DESDE storage.ts (copiar verbatim) ──
  const jobsData: InsertJob[] = [ /* copiar de MemStorage.seedData() */ ];
  const financialsData: InsertFinancial[] = [ /* copiar */ ];
  const runsData: InsertProductionRun[] = [ /* copiar */ ];
  const maintenanceData: InsertMaintenanceTask[] = [ /* copiar */ ];
  const inventoryData: InsertInventoryItem[] = [ /* copiar */ ];
  const arData: InsertArAgingItem[] = [ /* copiar */ ];
  const shipmentsData: InsertShipment[] = [ /* copiar */ ];
  const leadsData: InsertLead[] = [ /* copiar */ ];
  const vendorsData: InsertVendor[] = [ /* copiar si existe, si no [] */ ];
  const pressLogsData: InsertPressLog[] = [ /* copiar si existe, si no [] */ ];

  // sensorReadings: copiar el loop generador de MemStorage.seedData()
  // construyendo un array `sensorData: InsertSensorReading[]` (sin el campo id)
  // y luego seedIfEmpty(sensorReadings, sensorData, "sensor_readings").

  await seedIfEmpty(jobs, jobsData, "jobs");
  await seedIfEmpty(financials, financialsData, "financials");
  await seedIfEmpty(productionRuns, runsData, "production_runs");
  await seedIfEmpty(maintenanceTasks, maintenanceData, "maintenance_tasks");
  await seedIfEmpty(inventory, inventoryData, "inventory");
  await seedIfEmpty(arAging, arData, "ar_aging");
  await seedIfEmpty(shipments, shipmentsData, "shipments");
  await seedIfEmpty(leads, leadsData, "leads");
  await seedIfEmpty(vendors, vendorsData, "vendors");
  await seedIfEmpty(pressLogs, pressLogsData, "press_logs");
  // await seedIfEmpty(sensorReadings, sensorData, "sensor_readings");
  await seedUsers();

  await pool.end();
  console.log("seed completo");
}

main().catch((err) => {
  console.error("seed falló:", err);
  process.exit(1);
});
```

Añadir el import faltante al tope: `import { eq } from "drizzle-orm";`

Nota sobre sensorReadings: el seed original genera filas con `id` explícito y campo `timestamp`. Para el insert vía Drizzle, construir objetos SIN `id` (serial autogenera) con los campos `{ timestamp, sensorType, value, unit, location }`.

- [ ] **Step 2: Copiar los arrays de datos desde storage.ts**

Abrir `server/storage.ts`, localizar `MemStorage.seedData()`. Copiar cada array de datos (`jobsData`, `financialsData`, etc.) VERBATIM al `main()` de `seed.ts`. Para `sensorReadings`, copiar el loop generador adaptándolo a construir `InsertSensorReading[]` sin `id`. Si vendors o pressLogs no tienen seed en el original, dejar `[]`.

- [ ] **Step 3: Verificar typecheck**

Run: `npm run check`
Expected: PASS para `server/seed.ts`.

- [ ] **Step 4: Ejecutar el seed**

Run: `npm run db:seed`
Expected: salida con `seeded jobs: 12 filas`, `seeded financials: 6 filas`, ..., `seeded admin user: Admin`, `seed completo`. Sin errores.

- [ ] **Step 5: Verificar idempotencia**

Run: `npm run db:seed` (segunda vez)
Expected: todas las líneas dicen `skip ...: ya tiene datos` / `skip users: admin ya existe`. Ninguna inserción.

- [ ] **Step 6: Verificar persistencia tras reinicio**

Run (terminal A): `npm run dev`
Run (terminal B): `curl http://localhost:5000/api/jobs`
Expected: array con 12 jobs. Detener `npm run dev`, volver a arrancar, repetir `curl`: siguen los 12 jobs (persisten, no se regeneran).

- [ ] **Step 7: Commit**

```bash
git add server/seed.ts
git commit -m "feat: idempotent postgres seed script + admin user"
```

---

## Task 7: Módulo de autenticación (`server/auth.ts`)

**Files:**
- Create: `server/auth.ts`

- [ ] **Step 1: Crear server/auth.ts**

```ts
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";

// Passport: validar usuario vs bcrypt hash
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) return done(null, false);
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return done(null, false);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }),
);

passport.serializeUser((user, done) => {
  done(null, (user as User).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const all = await storage.getUserByUsername; // placeholder removed below
    // buscamos por id directamente:
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const r = await db.select().from(users).where(eq(users.id, id));
    done(null, r[0] || false);
  } catch (err) {
    done(err);
  }
});

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "dev-insecure-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Endpoints de auth
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json({ user: { id: user.id, username: user.username, role: user.role } });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const u = req.user as User;
      return res.json({ user: { id: u.id, username: u.username, role: u.role } });
    }
    return res.status(401).json({ error: "No autenticado" });
  });
}

// Middleware: exige sesión válida
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: "No autenticado" });
}
```

Nota: simplificar `deserializeUser` — eliminar la línea placeholder `const all = await storage.getUserByUsername;`. Versión limpia:

```ts
passport.deserializeUser(async (id: number, done) => {
  try {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const r = await db.select().from(users).where(eq(users.id, id));
    done(null, r[0] || false);
  } catch (err) {
    done(err);
  }
});
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS para `server/auth.ts`. Si TS se queja del tipo de `req.user`, es esperado que `User` se use vía cast (`as User`); no añadir augmentación de tipos salvo que el build falle.

- [ ] **Step 3: Commit**

```bash
git add server/auth.ts
git commit -m "feat: passport-local auth module with pg session store"
```

---

## Task 8: Integrar auth en el servidor (`index.ts` + `routes.ts`)

**Files:**
- Modify: `server/index.ts:1-23`
- Modify: `server/routes.ts`

- [ ] **Step 1: Cargar dotenv y montar auth en index.ts**

En `server/index.ts`, añadir como PRIMERA línea del archivo:

```ts
import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupAuth } from "./auth";
import { createServer } from "http";
```

Luego, tras `app.use(express.urlencoded({ extended: false }));` (línea ~23) y ANTES del bloque `app.use((req, res, next) => { ... })` de logging, montar auth:

```ts
app.use(express.urlencoded({ extended: false }));

setupAuth(app);
```

- [ ] **Step 2: Aplicar requireAuth a las rutas /api en routes.ts**

En `server/routes.ts`, importar el middleware al tope:

```ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
```

Y dentro de `registerRoutes`, como PRIMERA instrucción tras la apertura de la función (antes del primer `app.get("/api/jobs", ...)`), aplicar el middleware a todo `/api` excepto los endpoints de auth (que ya están registrados en `setupAuth`, montado antes):

```ts
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Proteger todas las rutas /api registradas a partir de aquí.
  // Los endpoints /api/auth/* se montan en setupAuth (antes que esto) y NO pasan por requireAuth.
  app.use("/api", requireAuth);

  // === JOBS ===
  app.get("/api/jobs", async (_req, res) => {
```

Importante: como `setupAuth(app)` se ejecuta en `index.ts` ANTES de `registerRoutes`, los handlers `/api/auth/login`, `/api/auth/logout` y `/api/auth/me` quedan registrados antes del `app.use("/api", requireAuth)` y por lo tanto NO se ven afectados. Verificar este orden en el Step 4.

- [ ] **Step 3: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Verificar protección y login vía curl**

Run (terminal A): `npm run dev`

Run (terminal B):
```bash
# 1) Ruta protegida sin sesión → 401
curl -i http://localhost:5000/api/jobs
```
Expected: `HTTP/1.1 401` con `{"error":"No autenticado"}`.

```bash
# 2) /api/auth/me sin sesión → 401 (pero accesible, no bloqueado por requireAuth)
curl -i http://localhost:5000/api/auth/me
```
Expected: `HTTP/1.1 401` con `{"error":"No autenticado"}` (respuesta del handler, no del middleware).

```bash
# 3) Login con admin → 200 + cookie
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"OnyxCCD"}'
```
Expected: `HTTP/1.1 200` con `{"user":{...}}` y `Set-Cookie: connect.sid=...`.

```bash
# 4) Ruta protegida con cookie → 200
curl http://localhost:5000/api/jobs -b cookies.txt
```
Expected: array con 12 jobs.

```bash
# 5) Login con password incorrecto → 401
curl -i -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"wrong"}'
```
Expected: `HTTP/1.1 401`.

Detener `npm run dev`. Borrar `cookies.txt`.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/routes.ts
git commit -m "feat: wire session/passport into server, protect /api routes"
```

---

## Task 9: Frontend — auth contra el servidor

**Files:**
- Modify: `client/src/lib/authContext.tsx` (reescritura)
- Modify: `client/src/pages/login.tsx:15-23`
- Modify: `client/src/App.tsx:60-76`
- Modify: `client/src/components/TopBar.tsx` (logout async)

- [ ] **Step 1: Reescribir authContext.tsx**

Reemplazar TODO el contenido de `client/src/lib/authContext.tsx` por:

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface AuthUser {
  id: number;
  username: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: async () => false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Comprobar sesión existente al cargar
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(username: string, password: string): Promise<boolean> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setUser(data.user);
    return true;
  }

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: !!user, isLoading, user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Hacer handleSubmit async en login.tsx**

En `client/src/pages/login.tsx`, reemplazar la función `handleSubmit` (líneas 15-23) por:

```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const success = await login(username, password);
    if (!success) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }
```

- [ ] **Step 3: Manejar estado de carga en AuthGate (App.tsx)**

En `client/src/App.tsx`, reemplazar la función `AuthGate` (líneas 60-76) por:

```tsx
function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white/40 text-xs tracking-widest uppercase">
        Cargando…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <UserProvider>
      <MobileNavProvider>
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </MobileNavProvider>
    </UserProvider>
  );
}
```

- [ ] **Step 4: logout async en TopBar.tsx**

En `client/src/components/TopBar.tsx`, localizar el handler que llama a `logout()` (botón LogOut). Cambiar la llamada a `void logout();` o envolver en handler async. Si el onClick es `onClick={logout}`, cambiarlo a:

```tsx
onClick={() => { void logout(); }}
```

(Buscar `logout` en el JSX del archivo y aplicar el cambio en el `onClick` del botón de cerrar sesión.)

- [ ] **Step 5: Verificar typecheck + build del cliente**

Run: `npm run check`
Expected: PASS (sin errores en authContext, login, App, TopBar).

- [ ] **Step 6: Verificación manual E2E**

Run (terminal A): `npm run dev`
En el navegador → `http://localhost:5000`:
1. Aparece login (tras breve "Cargando…").
2. Login con `Admin` / `OnyxCCD` → entra al dashboard, datos cargan.
3. Recargar página → sigue autenticado (sesión persiste, no vuelve a login).
4. Login con password incorrecto → mensaje de error + shake.
5. Cerrar sesión (TopBar) → vuelve a login.
Detener `npm run dev`.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/authContext.tsx client/src/pages/login.tsx client/src/App.tsx client/src/components/TopBar.tsx
git commit -m "feat: frontend auth via server session, remove hardcoded credentials"
```

---

## Task 10: Playwright E2E del login

**Files:**
- Create: `tests/login.spec.ts`

**Contexto:** Existe `playwright-discovery.cjs` y `@playwright/test` instalado. Confirmar si hay `playwright.config.ts`; si no, este test asume `baseURL` `http://localhost:5000` y servidor ya corriendo.

- [ ] **Step 1: Crear tests/login.spec.ts**

```ts
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5000";

test("login con credenciales válidas entra al dashboard", async ({ page }) => {
  await page.goto(BASE);
  await page.getByTestId("login-username").fill("Admin");
  await page.getByTestId("login-password").fill("OnyxCCD");
  await page.getByTestId("login-submit").click();
  // Tras login, el login form desaparece
  await expect(page.getByTestId("login-submit")).toHaveCount(0, { timeout: 10000 });
});

test("login con credenciales inválidas muestra error", async ({ page }) => {
  await page.goto(BASE);
  await page.getByTestId("login-username").fill("Admin");
  await page.getByTestId("login-password").fill("wrong-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText(/Invalid credentials/i)).toBeVisible({ timeout: 10000 });
});
```

- [ ] **Step 2: Ejecutar el test E2E**

Run (terminal A): `npm run dev`
Run (terminal B): `npx playwright test tests/login.spec.ts --reporter=list`
Expected: ambos tests PASS. Si Playwright pide instalar Chromium: `npx playwright install chromium` y reintentar.
Detener `npm run dev`.

- [ ] **Step 3: Commit**

```bash
git add tests/login.spec.ts
git commit -m "test: playwright e2e for server-side login"
```

---

## Verificación final (post-implementación)

- [ ] `npm run check` → PASS.
- [ ] `npm run db:seed` (segunda corrida) → todo `skip` (idempotente).
- [ ] Reinicio de `npm run dev` → datos persisten (no se regeneran).
- [ ] `curl /api/jobs` sin cookie → 401; con login → datos.
- [ ] Navegador: login, recarga mantiene sesión, logout funciona, credenciales malas fallan.
- [ ] Grep de `VALID_CREDENTIALS` en `client/` → 0 resultados (credenciales eliminadas del frontend).
- [ ] `.env` NO está en `git status` (gitignored).
- [ ] `npm run build` → compila sin error (cliente + servidor).
