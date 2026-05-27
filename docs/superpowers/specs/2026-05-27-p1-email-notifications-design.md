# P1 — Email Notifications (Internas) — Design

**Fecha:** 2026-05-27
**Rama:** backend-func (o nueva rama desde main)
**Riesgo cubierto:** R4 (27 follow-ups vencidos sin alerta) + alertas de mantenimiento vencido
**Fuente:** discovery-report.md §12, §15 Fase 2.3
**Sub-proyecto de P1:** primero de 3 (Email → luego QuickBooks → FedEx)

## Objetivo

Convertir los follow-ups de leads vencidos (R4) y las tareas de mantenimiento vencidas en alertas de email automáticas internas para Moe. Sin emails a clientes (alcance interno solamente). Construir infraestructura de email reutilizable para futuras integraciones (notificación de envío a cliente, quotes, digest semanal — fuera de alcance aquí).

## Decisiones (brainstorming)

| Decisión | Elección |
|---|---|
| Alcance | Solo internas: follow-ups vencidos + mantenimiento vencido. Sin emails a clientes. |
| Proveedor | Resend (SDK, una API key). |
| Disparador | Cron diario in-process (node-cron) + botón/endpoint manual "enviar ahora". |
| Digest | Un email combinado, agrupado (anti-spam). Si nada vencido → no envía. |
| Estructura | Dos módulos: `email.ts` (transporte) + `notifications.ts` (lógica). |

## Estado actual relevante

- Auth server-side activo; rutas `/api/*` protegidas por `requireAuth` salvo `/api/auth/*`.
- `storage` = `DrizzleStorage` (Postgres). Tiene `getLeads()` y `getMaintenanceTasks()`.
- No hay infra de email ni scheduler.
- Lógica overdue de leads en frontend (`client/src/pages/leads.tsx:695-700`):
  `daysUntil(nextFollowUp) <= 0` (date ≤ hoy) **y** status ∉ {`won`, `lost`}.
  `daysUntil` = `Math.floor((new Date(dateStr) - now) / dayMs)` (`leads.tsx:46-51`).
- Mantenimiento overdue: el módulo de mantenimiento usa `status === 'overdue'` (campo en `maintenanceTasks`).

## Componentes

### Nuevos

| Archivo | Responsabilidad |
|---|---|
| `server/email.ts` | Wrapper fino sobre Resend. Exporta `sendEmail({ to, subject, html })`. Lee `RESEND_API_KEY` y `ALERT_FROM`. Si falta `RESEND_API_KEY`: log warn y retorna `{ skipped: true }` (no-op seguro en dev). Errores de Resend se propagan. Exporta `isEmailConfigured(): boolean`. |
| `server/notifications.ts` | Lógica de alertas. `getOverdueFollowUps()`, `getOverdueMaintenance()`, `buildDigestHtml(leads, tasks)`, `sendOverdueDigest()` (devuelve summary), `registerNotificationSchedule()` (node-cron). |

### Modificados

| Archivo | Cambio |
|---|---|
| `server/routes.ts` | + `POST /api/alerts/send-digest` (después del `requireAuth` global) → `sendOverdueDigest()`. 200 `{ sent, overdueLeads, overdueMaintenance }`. Si email no configurado → 400 `{ error: "Email no configurado (RESEND_API_KEY)" }`. Si Resend falla → 502 `{ error }`. |
| `server/index.ts` | + `registerNotificationSchedule()` después de `setupAuth(app)`. |
| `client/src/pages/leads.tsx` | Botón "Enviar digest ahora" junto al card "Overdue Follow-ups" → `POST /api/alerts/send-digest` (`credentials:"include"`) + toast con el summary. |
| `.env` / `.env.example` | + `RESEND_API_KEY`, `ALERT_FROM`, `ALERT_RECIPIENTS`, `ALERT_CRON`, `ALERT_TZ`. |
| `package.json` | + deps `resend`, `node-cron`, `@types/node-cron`. |
| `script/build.ts` | + `resend`, `node-cron` al allowlist. |

### Dependencias nuevas
- `resend` — SDK de envío.
- `node-cron` + `@types/node-cron` — scheduler in-process.

## Variables de entorno

```
RESEND_API_KEY=<resend api key>
ALERT_FROM=onboarding@resend.dev          # default para probar; luego dominio propio
ALERT_RECIPIENTS=moe@example.com          # lista coma-separada
ALERT_CRON=0 8 * * *                      # diario 8am
ALERT_TZ=America/Los_Angeles
```

Defaults en código: `ALERT_FROM` → `onboarding@resend.dev`, `ALERT_CRON` → `0 8 * * *`, `ALERT_TZ` → `America/Los_Angeles`. `ALERT_RECIPIENTS` vacío → cron skip con warn; endpoint manual 400.

## Lógica de negocio

### `getOverdueFollowUps()`
Lee `storage.getLeads()`. Filtra:
- `nextFollowUp` no nulo.
- `daysUntil(nextFollowUp) <= 0` (mismo cálculo que frontend: floor de diferencia en días).
- `status` ∉ {`won`, `lost`}.
Devuelve `Lead[]` ordenado por `nextFollowUp` ascendente (más vencido primero).
**Verificar:** la cuenta debe coincidir con el "27" del dashboard de leads (seed actual tiene 36 leads).

### `getOverdueMaintenance()`
Lee `storage.getMaintenanceTasks()`. Filtra `status === 'overdue'`. Devuelve `MaintenanceTask[]`.

### `buildDigestHtml(leads, tasks)`
HTML simple (inline styles, sin dependencias de plantillas):
- Encabezado "ONYX — Alertas internas — {fecha}".
- Sección "Follow-ups vencidos ({n})": tabla con contacto, empresa, días vencido, último contacto.
- Sección "Mantenimiento vencido ({n})": tabla con tarea, responsable, próxima fecha.
- Si una sección vacía, se omite.

### `sendOverdueDigest()`
1. `leads = getOverdueFollowUps()`, `tasks = getOverdueMaintenance()`.
2. Si `leads.length === 0 && tasks.length === 0` → return `{ sent: false, overdueLeads: 0, overdueMaintenance: 0, reason: "nada vencido" }` (no envía).
3. Construye HTML, `sendEmail({ to: ALERT_RECIPIENTS, subject, html })`.
4. Si email no configurado → return `{ sent: false, reason: "email no configurado", ... }` (cron) o el endpoint lo traduce a 400.
5. Return `{ sent: true, overdueLeads: leads.length, overdueMaintenance: tasks.length }`.

### `registerNotificationSchedule()`
`cron.schedule(ALERT_CRON, () => sendOverdueDigest().catch(logError), { timezone: ALERT_TZ })`. Log al iniciar ("schedule registrado: {cron} {tz}"). Errores logueados, nunca tumban el proceso.

## Flujo de datos

```
Cron (8am, TZ LA) ─┐
Botón UI → POST /api/alerts/send-digest (requireAuth) ─┘─→ sendOverdueDigest()
  → getOverdueFollowUps() + getOverdueMaintenance()  (DrizzleStorage → Postgres)
  → buildDigestHtml()
  → email.sendEmail() → Resend API → inbox de Moe
```

## Errores / edge cases

- Sin `RESEND_API_KEY`: `email.ts` no-op + warn; endpoint 400; cron skip.
- `ALERT_RECIPIENTS` vacío: tratado como no configurado (no hay a quién enviar).
- Resend devuelve error: endpoint 502 con mensaje; cron loguea, sigue vivo.
- Nada vencido: no se envía (evita ruido diario).
- Fecha `nextFollowUp` malformada: `daysUntil` retorna basado en `new Date(...)`; si inválida (NaN) se excluye (no `<= 0`).
- Cron in-process: corre solo mientras el server está arriba. Aceptable (single instance). Documentar como limitación.

## Testing / verificación

Sin runner unitario. Verificación manual:
1. `POST /api/alerts/send-digest` sin sesión → 401 (requireAuth).
2. Con sesión y `RESEND_API_KEY` ausente → 400 "Email no configurado".
3. Configurar `RESEND_API_KEY` + `ALERT_RECIPIENTS` (email real de prueba); llamar endpoint → 200 con `{sent:true, overdueLeads:N, overdueMaintenance:M}`; confirmar recepción del email y que N coincide con el dashboard de leads.
4. Sin vencidos (manipular fechas o filtro) → `{sent:false}`, no llega email.
5. Cron: setear `ALERT_CRON` temporal (ej. `*/1 * * * *`) en dev, confirmar log de disparo + envío; revertir.
6. Botón en leads page dispara endpoint y muestra toast con el summary.

## Seguridad

- `RESEND_API_KEY` solo en `.env` (gitignored). `.env.example` con placeholder.
- Endpoint protegido por `requireAuth` (no abierto).
- Sin datos de cliente enviados externamente; el digest va solo a `ALERT_RECIPIENTS` internos.

## Fuera de alcance (futuro)
- Email a clientes (notificación de envío, quotes).
- Digest semanal de KPIs.
- Verificación de dominio propio en Resend (usar `onboarding@resend.dev` para empezar).
- Persistir historial de envíos / dedupe avanzado.
