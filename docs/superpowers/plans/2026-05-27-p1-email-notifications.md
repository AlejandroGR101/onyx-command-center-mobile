# P1 — Email Notifications (Internas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar alertas de email internas (digest) a Moe con los follow-ups de leads vencidos (R4) y las tareas de mantenimiento vencidas, vía Resend, disparadas por un cron diario y por un botón manual.

**Architecture:** Dos módulos server: `email.ts` (transporte Resend) y `notifications.ts` (queries overdue + compose digest + schedule node-cron). Un endpoint protegido `POST /api/alerts/send-digest` y un cron in-process. Botón en la página de leads para disparo manual.

**Tech Stack:** Express 5, Resend SDK, node-cron, Drizzle (storage existente), React + use-toast (frontend).

**Spec:** `docs/superpowers/specs/2026-05-27-p1-email-notifications-design.md`

**Branch:** `p1-email-notifications` (ya creada desde main).

**Nota testing:** El repo no tiene runner unitario. Verificación por `npm run check` (tsc), `curl` (endpoint), envío real a un email de prueba, y prueba de cron con schedule temporal.

**Prerequisito del usuario (antes de Task 5 verificación real):** `.env` con `RESEND_API_KEY` y `ALERT_RECIPIENTS` (email de prueba). Sin esto, el endpoint responde 400 y el cron hace skip — el código se puede implementar y typecheckear igual.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `server/email.ts` (crear) | Transporte: `sendEmail`, `isEmailConfigured`, `getRecipients`. Aísla Resend. |
| `server/notifications.ts` (crear) | Lógica: filtros overdue, `buildDigestHtml`, `sendOverdueDigest`, `registerNotificationSchedule`. |
| `server/routes.ts` (modificar) | + endpoint `POST /api/alerts/send-digest`. |
| `server/index.ts` (modificar) | + `registerNotificationSchedule()`. |
| `client/src/pages/leads.tsx` (modificar) | Botón "Enviar digest ahora" + handler/toast. |
| `.env` / `.env.example` (modificar) | Variables Resend/cron. |
| `package.json` / `script/build.ts` (modificar) | Deps + allowlist. |

---

## Task 1: Dependencias + variables de entorno

**Files:**
- Modify: `package.json`
- Modify: `script/build.ts` (allowlist)
- Modify: `.env` y `.env.example`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install resend node-cron
npm install -D @types/node-cron
```

- [ ] **Step 2: Añadir resend y node-cron al allowlist de build**

En `script/build.ts`, dentro del array `allowlist`, añadir dos entradas: `"resend",` y `"node-cron",` (cualquier posición dentro del array; mantener JSON/array válido).

- [ ] **Step 3: Añadir variables a .env.example**

Al final de `.env.example`, añadir:

```
# Email notifications (Resend) — alertas internas
RESEND_API_KEY=<resend-api-key>
ALERT_FROM=onboarding@resend.dev
ALERT_RECIPIENTS=<email-de-moe>
ALERT_CRON=0 8 * * *
ALERT_TZ=America/Los_Angeles
```

- [ ] **Step 4: Añadir las mismas claves a .env (valores reales si el usuario los dio, si no placeholders)**

Al final de `.env`, añadir las mismas 5 líneas. Si el usuario aún no proporcionó `RESEND_API_KEY`/`ALERT_RECIPIENTS`, dejar `ALERT_FROM=onboarding@resend.dev`, `ALERT_CRON=0 8 * * *`, `ALERT_TZ=America/Los_Angeles` y dejar `RESEND_API_KEY=` y `ALERT_RECIPIENTS=` vacíos. NO commitear `.env` (está gitignored).

- [ ] **Step 5: Verificar instalación**

Run: `npm ls resend node-cron @types/node-cron`
Expected: las tres con versión, sin UNMET/(empty).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json script/build.ts .env.example
git commit -m "chore: add resend + node-cron deps and email alert env vars"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 2: Módulo de transporte de email (`server/email.ts`)

**Files:**
- Create: `server/email.ts`

- [ ] **Step 1: Crear server/email.ts**

```ts
import "dotenv/config";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.ALERT_FROM || "onboarding@resend.dev";
const resend = apiKey ? new Resend(apiKey) : null;

export function getRecipients(): string[] {
  return (process.env.ALERT_RECIPIENTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Email está configurado si hay API key y al menos un destinatario.
export function isEmailConfigured(): boolean {
  return !!apiKey && getRecipients().length > 0;
}

export interface SendEmailArgs {
  to: string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  skipped: boolean;
  id?: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<SendEmailResult> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY no configurada — envío omitido");
    return { skipped: true };
  }
  if (to.length === 0) {
    console.warn("[email] sin destinatarios (ALERT_RECIPIENTS) — envío omitido");
    return { skipped: true };
  }
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
  }
  return { skipped: false, id: data?.id };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS (sin errores en email.ts). Si el SDK de Resend expone `emails.send` con una firma distinta a `{ from, to, subject, html }`, ajustar a la firma real del paquete instalado y reportarlo; no inventar campos.

- [ ] **Step 3: Commit**

```bash
git add server/email.ts
git commit -m "feat: Resend email transport module"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 3: Módulo de notificaciones (`server/notifications.ts`)

**Files:**
- Create: `server/notifications.ts`

- [ ] **Step 1: Crear server/notifications.ts**

```ts
import cron from "node-cron";
import { storage } from "./storage";
import { sendEmail, getRecipients, isEmailConfigured } from "./email";
import type { Lead, MaintenanceTask } from "@shared/schema";

// Días hasta una fecha (mismo cálculo que client/src/pages/leads.tsx:46-51).
// Negativo o 0 = vencido o vence hoy.
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// Leads con follow-up vencido (espeja leads.tsx:695-700):
// nextFollowUp <= hoy y status no en {won, lost}.
export async function getOverdueFollowUps(): Promise<Lead[]> {
  const leads = await storage.getLeads();
  return leads
    .filter((l) => {
      const d = daysUntil(l.nextFollowUp);
      return d != null && d <= 0 && !["won", "lost"].includes(l.status);
    })
    .sort((a, b) => (a.nextFollowUp || "").localeCompare(b.nextFollowUp || ""));
}

export async function getOverdueMaintenance(): Promise<MaintenanceTask[]> {
  const tasks = await storage.getMaintenanceTasks();
  return tasks.filter((t) => t.status === "overdue");
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildDigestHtml(leads: Lead[], tasks: MaintenanceTask[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const sections: string[] = [];

  if (leads.length > 0) {
    const rows = leads
      .map((l) => {
        const d = daysUntil(l.nextFollowUp);
        const overdueBy = d == null ? "" : `${Math.abs(d)}d`;
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.contactName)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.companyName) || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.status)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.nextFollowUp)} (${overdueBy})</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(l.lastCommunication) || "—"}</td>
        </tr>`;
      })
      .join("");
    sections.push(`
      <h2 style="font:600 16px sans-serif;color:#b00020;margin:20px 0 8px;">Follow-ups vencidos (${leads.length})</h2>
      <table style="border-collapse:collapse;width:100%;font:13px sans-serif;color:#222;">
        <tr style="text-align:left;background:#f5f5f5;">
          <th style="padding:6px 10px;">Contacto</th><th style="padding:6px 10px;">Empresa</th>
          <th style="padding:6px 10px;">Etapa</th><th style="padding:6px 10px;">Follow-up</th>
          <th style="padding:6px 10px;">Último contacto</th>
        </tr>${rows}
      </table>`);
  }

  if (tasks.length > 0) {
    const rows = tasks
      .map((t) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(t.title)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(t.assignedTo) || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(t.nextDue)}</td>
      </tr>`)
      .join("");
    sections.push(`
      <h2 style="font:600 16px sans-serif;color:#b00020;margin:20px 0 8px;">Mantenimiento vencido (${tasks.length})</h2>
      <table style="border-collapse:collapse;width:100%;font:13px sans-serif;color:#222;">
        <tr style="text-align:left;background:#f5f5f5;">
          <th style="padding:6px 10px;">Tarea</th><th style="padding:6px 10px;">Responsable</th>
          <th style="padding:6px 10px;">Próxima</th>
        </tr>${rows}
      </table>`);
  }

  return `<div style="max-width:680px;margin:0 auto;font:14px sans-serif;color:#222;">
    <h1 style="font:700 18px sans-serif;">ONYX — Alertas internas</h1>
    <p style="color:#666;">Resumen del ${today}</p>
    ${sections.join("")}
  </div>`;
}

export interface DigestSummary {
  sent: boolean;
  overdueLeads: number;
  overdueMaintenance: number;
  reason?: string;
}

export async function sendOverdueDigest(): Promise<DigestSummary> {
  const leads = await getOverdueFollowUps();
  const tasks = await getOverdueMaintenance();

  if (leads.length === 0 && tasks.length === 0) {
    return { sent: false, overdueLeads: 0, overdueMaintenance: 0, reason: "nada vencido" };
  }
  if (!isEmailConfigured()) {
    return {
      sent: false,
      overdueLeads: leads.length,
      overdueMaintenance: tasks.length,
      reason: "email no configurado",
    };
  }

  const html = buildDigestHtml(leads, tasks);
  const subject = `ONYX — ${leads.length} follow-ups + ${tasks.length} mantenimiento vencidos`;
  await sendEmail({ to: getRecipients(), subject, html });

  return { sent: true, overdueLeads: leads.length, overdueMaintenance: tasks.length };
}

export function registerNotificationSchedule(): void {
  const expr = process.env.ALERT_CRON || "0 8 * * *";
  const tz = process.env.ALERT_TZ || "America/Los_Angeles";
  if (!cron.validate(expr)) {
    console.warn(`[notifications] ALERT_CRON inválido: "${expr}" — schedule no registrado`);
    return;
  }
  cron.schedule(
    expr,
    () => {
      sendOverdueDigest()
        .then((s) => console.log("[notifications] digest:", JSON.stringify(s)))
        .catch((err) => console.error("[notifications] digest falló:", err));
    },
    { timezone: tz },
  );
  console.log(`[notifications] schedule registrado: "${expr}" (${tz})`);
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: PASS. Si `node-cron` no exporta `default` (import error), usar `import * as cron from "node-cron";`. Si `cron.schedule` rechaza la opción `{ timezone }` por tipos, confirmar la firma del paquete instalado y ajustar; reportar el cambio.

- [ ] **Step 3: Commit**

```bash
git add server/notifications.ts
git commit -m "feat: overdue follow-up + maintenance digest notifications"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 4: Endpoint + schedule wiring

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Importar y registrar el endpoint en routes.ts**

En `server/routes.ts`, añadir imports al tope (junto a los existentes):

```ts
import { sendOverdueDigest } from "./notifications";
import { isEmailConfigured } from "./email";
```

Dentro de `registerRoutes`, DESPUÉS del `app.use("/api", requireAuth);` (queda protegido) y antes de `return httpServer;`, añadir:

```ts
  // === ALERTS ===
  app.post("/api/alerts/send-digest", async (_req, res) => {
    if (!isEmailConfigured()) {
      return res.status(400).json({ error: "Email no configurado (RESEND_API_KEY / ALERT_RECIPIENTS)" });
    }
    try {
      const summary = await sendOverdueDigest();
      res.json(summary);
    } catch (err: any) {
      res.status(502).json({ error: err?.message || "Error enviando email" });
    }
  });
```

- [ ] **Step 2: Registrar el schedule en index.ts**

En `server/index.ts`, añadir import junto a `import { setupAuth } from "./auth";`:

```ts
import { registerNotificationSchedule } from "./notifications";
```

Y después de la línea `setupAuth(app);`, añadir:

```ts
registerNotificationSchedule();
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Verificar arranque + protección + comportamiento sin config**

Asume que `.env` aún NO tiene `RESEND_API_KEY`/`ALERT_RECIPIENTS` (o sí — el comportamiento se indica para ambos casos).

Start server: `Start-Process -NoNewWindow -FilePath npm -ArgumentList 'run','dev'`. Esperar ~6s. En el log debe verse `[notifications] schedule registrado: "0 8 * * *" (America/Los_Angeles)`.

```
# Sin sesión → 401
curl.exe -i -X POST http://localhost:5000/api/alerts/send-digest
```
Expected: HTTP 401.

```
# Con sesión:
curl.exe -i -c c.txt -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"Admin\",\"password\":\"OnyxCCD\"}"
curl.exe -i -b c.txt -X POST http://localhost:5000/api/alerts/send-digest
```
Expected:
- Si email NO configurado → HTTP 400 `{"error":"Email no configurado ..."}`.
- Si email configurado y hay vencidos → HTTP 200 `{"sent":true,"overdueLeads":N,"overdueMaintenance":M}`.

Stop server: `Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`. `Remove-Item c.txt -ErrorAction SilentlyContinue`.
Si no puedes manejar el server en background de forma fiable, reporta DONE_WITH_CONCERNS con lo que obtuviste; no dejes server corriendo.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/index.ts
git commit -m "feat: wire send-digest endpoint + daily notification schedule"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 5: Botón "Enviar digest" en la página de leads

**Files:**
- Modify: `client/src/pages/leads.tsx`

**Contexto:** La página de leads (`LeadsPage`/componente principal) calcula `overdueFollowUps` (~línea 695) y muestra un card "Overdue Follow-ups" (~línea 760). El proyecto tiene `useToast` (`@/hooks/use-toast`) con API `toast({ title, description, variant })`, `<Toaster />` ya montado en App.tsx, y `apiRequest(method, url, data?)` en `@/lib/queryClient` (lanza error si la respuesta no es ok). `useState` ya está importado en el archivo.

- [ ] **Step 1: Añadir imports**

En `client/src/pages/leads.tsx`, añadir (si no están ya):

```tsx
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
```

- [ ] **Step 2: Añadir estado + handler en el componente de la página**

Dentro del componente principal de la página (el que ya define `overdueFollowUps` con `useMemo`), añadir junto a los otros hooks:

```tsx
  const { toast } = useToast();
  const [sendingDigest, setSendingDigest] = useState(false);

  async function handleSendDigest() {
    setSendingDigest(true);
    try {
      const res = await apiRequest("POST", "/api/alerts/send-digest");
      const data = await res.json();
      toast({
        title: data.sent ? "Digest enviado" : "Nada que enviar",
        description: data.sent
          ? `${data.overdueLeads} follow-ups + ${data.overdueMaintenance} mantenimiento`
          : data.reason || "Sin vencidos",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "No se pudo enviar el digest",
        variant: "destructive",
      });
    } finally {
      setSendingDigest(false);
    }
  }
```

- [ ] **Step 3: Añadir el botón junto al card "Overdue Follow-ups"**

Localizar el card "Overdue Follow-ups" (~línea 760). Inmediatamente después de ese card (o dentro de su contenedor, donde quede visualmente sensato), añadir un botón. Usar clases coherentes con el resto de la página (botones usan estilos tipo `rounded-lg px-3 py-2 text-xs`). Ejemplo:

```tsx
        <button
          data-testid="send-digest"
          onClick={handleSendDigest}
          disabled={sendingDigest}
          className="rounded-lg px-3 py-2 text-xs font-medium text-white/80 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-40"
        >
          {sendingDigest ? "Enviando…" : "Enviar digest ahora"}
        </button>
```

Reportar dónde exactamente se colocó el botón.

- [ ] **Step 4: Verificar typecheck + build cliente**

Run: `npm run check`
Expected: PASS.
Run: `npm run build`
Expected: build de cliente y servidor sin error.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/leads.tsx
git commit -m "feat: manual send-digest button on leads page"
```
Trailer en línea propia:
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## Task 6: Verificación end-to-end (requiere RESEND configurado)

**Files:** ninguno (verificación). Si el usuario aún no dio `RESEND_API_KEY`/`ALERT_RECIPIENTS`, reportar BLOCKED esperando esas credenciales; los Tasks 1-5 quedan completos y funcionales (endpoint responde 400 hasta configurar).

- [ ] **Step 1: Confirmar config**

Verificar (sin imprimir secretos):
```
node -e "require('dotenv').config(); console.log('key set:', !!process.env.RESEND_API_KEY); console.log('recipients:', (process.env.ALERT_RECIPIENTS||'').split(',').filter(Boolean).length)"
```
Expected: `key set: true`, `recipients: >=1`.

- [ ] **Step 2: Verificar conteo de overdue vs dashboard**

Start server (`npm run dev`), login, y:
```
curl.exe -s -b c.txt -X POST http://localhost:5000/api/alerts/send-digest
```
Expected: 200 `{"sent":true,"overdueLeads":N,"overdueMaintenance":M}`. Confirmar que `N` coincide con el número "Overdue Follow-ups" mostrado en la página de leads del navegador (mismo filtro). Confirmar recepción del email en la bandeja del `ALERT_RECIPIENTS` de prueba con ambas secciones.

- [ ] **Step 3: Probar el cron (schedule temporal)**

Temporalmente poner `ALERT_CRON=*/1 * * * *` en `.env`, reiniciar `npm run dev`, esperar hasta ~70s y confirmar en el log una línea `[notifications] digest: {...}`. Revertir `ALERT_CRON` a `0 8 * * *`. (No commitear cambios temporales de `.env`.)

- [ ] **Step 4: Probar botón en navegador**

Abrir leads page → click "Enviar digest ahora" → aparece toast con el summary. Stop server.

- [ ] **Step 5 (sin commit — verificación)**

No hay archivos que commitear. Reportar resultados.

---

## Verificación final

- [ ] `npm run check` → PASS.
- [ ] `npm run build` → PASS.
- [ ] `/api/alerts/send-digest` sin sesión → 401; con sesión sin config → 400; con config y vencidos → 200 con counts correctos.
- [ ] Email recibido con secciones de follow-ups y mantenimiento; `overdueLeads` coincide con el dashboard.
- [ ] Cron loguea al disparar (probado con schedule temporal).
- [ ] Botón en leads page funciona con toast.
- [ ] `.env` NO en git status; `.env.example` con placeholders.
