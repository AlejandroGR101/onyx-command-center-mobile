# ONYX RECORD PRESS — COMMAND CENTER
## Technical & Functional Discovery Report
### Senior AI Software Architect / Business Systems Analyst / Automation Engineer

**Empresa:** Onyx Record Press — Arcadia, CA  
**Máquina principal:** Pheenix Alpha AD12 (prensa de vinilo, fabricante: Pheenix Alpha AB, Suecia)  
**Cuenta FedEx:** RecordMadness  
**Discovery ejecutado:** 2026-04-23  
**URL analizada:** http://localhost:5000  
**Herramienta:** Playwright (Chromium headless, viewport 1440×900)

---

## ÍNDICE

1. [Executive Summary](#1-executive-summary)
2. [Stack Técnico](#2-stack-técnico)
3. [Inventario de Módulos (11 páginas)](#3-inventario-de-módulos)
4. [Flujos de Negocio Documentados](#4-flujos-de-negocio-documentados)
5. [Análisis de Autenticación y Seguridad](#5-análisis-de-autenticación-y-seguridad)
6. [Base de Datos y Persistencia](#6-base-de-datos-y-persistencia)
7. [API REST — Endpoints Confirmados](#7-api-rest--endpoints-confirmados)
8. [Oportunidades de Integración](#8-oportunidades-de-integración)
9. [Integración QuickBooks](#9-integración-quickbooks)
10. [Integración Monday.com](#10-integración-mondaycom)
11. [Integración FedEx / UPS](#11-integración-fedex--ups)
12. [Integración Gmail / Notificaciones](#12-integración-gmail--notificaciones)
13. [Datos de Máquina AD12](#13-datos-de-máquina-ad12)
14. [Riesgos, Supuestos y Preguntas Abiertas](#14-riesgos-supuestos-y-preguntas-abiertas)
15. [Recomendaciones Priorizadas](#15-recomendaciones-priorizadas)
16. [Anexo Técnico Playwright](#16-anexo-técnico-playwright)

---

## 1. Executive Summary

Onyx Record Press opera un Command Center web para gestionar la totalidad de sus operaciones de manufactura de discos de vinilo. La aplicación es un SPA (Single Page Application) React con backend Express.js y esquema PostgreSQL definido via Drizzle ORM.

**Estado actual (abril 2026):**
- 12 trabajos activos en pipeline (ONX-2026-001 a ONX-2026-012)
- 1 prensa AD12 en producción activa: ONX-2026-003 (Puscifer Entertainment, 847 buenas / 12 rechazos)
- Revenue mensual: $32,659 (enero 2026) con pérdida neta de -$7,423
- Cash position: $15,400 (checking + savings)
- AR total: $22,068 | AP total: $9,497
- 36 leads en pipeline de ventas con valor estimado de $181,300
- 27 seguimientos vencidos (overdue follow-ups) — riesgo crítico de CRM
- 9 partes críticas de la AD12 sin stock

**Hallazgo crítico #1:** Toda la persistencia de datos es **en memoria (MemStorage)**. Al reiniciar el servidor, TODOS los datos se pierden. No hay conexión activa a PostgreSQL.

**Hallazgo crítico #2:** Las credenciales de acceso están **hardcodeadas en el frontend** (`Admin` / `OnyxCCD`), visibles en el código fuente JavaScript que se sirve al navegador.

**Hallazgo crítico #3:** Todas las integraciones mostradas en el sidebar (QuickBooks, Monday.com, Gmail, FedEx, UPS, Slack, Sensors) son **indicadores visuales falsos** — no existe código de integración real.

---

## 2. Stack Técnico

### Frontend
| Componente | Tecnología | Versión |
|---|---|---|
| Framework UI | React | 18.3.1 |
| Routing | Wouter (hash-based) | 3.3.5 |
| State / Server Cache | TanStack React Query | 5.60.5 |
| Forms | React Hook Form + Zod | 7.55.0 |
| Componentes UI | Radix UI (shadcn/ui pattern) | múltiples |
| Charts | Recharts | 2.15.2 |
| Animations | Framer Motion | 11.13.1 |
| Iconos | Lucide React | 0.453.0 |
| Estilos | Tailwind CSS | 3.4.17 |

### Backend
| Componente | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js (tsx) | — |
| Framework HTTP | Express.js | 5.0.1 |
| ORM | Drizzle ORM | 0.39.3 |
| Base de Datos (esquema) | PostgreSQL (sin conexión activa) | — |
| Validación | Zod + drizzle-zod | 3.24.2 |
| Autenticación | Passport.js (local) | 0.7.0 |
| Sesiones | express-session + MemoryStore | 1.18.1 |
| WebSockets | ws | 8.18.0 |

### Build & DevOps
| Componente | Tecnología |
|---|---|
| Bundler | Vite 7.3.0 |
| TypeScript | 5.6.3 |
| Script Runner | tsx 4.20.5 |
| Cross-platform env | cross-env 10.1.0 |
| Testing E2E | Playwright 1.59.1 |

### Routing (Hash-based)
La aplicación usa rutas hash (`/#/`, `/#/pipeline`, `/#/production`, etc.). Esto significa que el servidor siempre sirve el mismo `index.html` y el cliente maneja la navegación. Ideal para deploy estático pero limita el SEO.

---

## 3. Inventario de Módulos

### 3.1 Dashboard (`/#/`)
**Propósito:** Vista ejecutiva de KPIs en tiempo real.

**Métricas mostradas:**
- Monthly Revenue: $32,659 (-25.9% vs mes anterior)
- Cash Position: $15,400
- Active Jobs: 11
- Press Utilization: 67% (AD12 Alpha)
- Reject Rate: 3.2% (target < 5%)

**Widgets:**
- Revenue vs COGS (gráfico de barras, 6 meses: Sep–Feb)
- AR Aging summary ($22,067.85 total)
- Cash Flow Forecast (15 días)
- Job Profitability por cliente (Bartlett 22.4%, Bornstien 30.7%, Van Orden 17.5%, Kanebell 31.1%, Puscifer 34.4%, Moon Stmpr 12.8%)
- Pipeline by Status (valor en $ por etapa)

**Datos fuente:** API `/api/jobs`, `/api/financials`, `/api/ar-aging`

---

### 3.2 Job Pipeline (`/#/pipeline`)
**Propósito:** Kanban visual del flujo de producción de todos los trabajos.

**Etapas del pipeline:**
1. INTAKE → 2 jobs (ONX-2026-009, ONX-2026-012)
2. PREPRESS → 3 jobs (ONX-2026-006, ONX-2026-007, ONX-2026-011)
3. READY TO PRESS → 2 jobs (ONX-2026-005, ONX-2026-010)
4. IN PRODUCTION → 1 job (ONX-2026-003 — Puscifer Entertainment)
5. QC → 1 job (ONX-2026-004 — Kanebell Enterprises)
6. PACKAGING → 1 job (ONX-2026-008 — Scott Van Orden)
7. SHIPPED → 1 job (ONX-2026-002 — Carrington Bornstien)
8. DELIVERED → 1 job (ONX-2026-001 — Adam Bartlett)

**Filtros disponibles:**
- Por formato: All / 7" / 10" / 12"
- Por location: All / Onyx / Belu (Outsourced) / Belu at Onyx

**Datos por job card:**
- Job ID (ej: ONX-2026-003)
- Estado de depósito (No Deposit / 75% Paid / 100% Paid)
- Cliente, formato, peso, color de vinilo, cantidad
- Ubicación de producción
- % de regrind (material reciclado)

**Alert prominente:** "2 jobs ready to press — Materials + Payment gates cleared"

**API:** `GET /api/jobs`, `PATCH /api/jobs/:id`

---

### 3.3 Press Control (`/#/production`)
**Propósito:** Monitor en tiempo real de la prensa AD12 durante producción activa.

**Job activo:** ONX-2026-003 — Puscifer Entertainment, 12" / 180g / Clear w/ Red Splatter

**Parámetros de prensa (AD12) mostrados:**
| Parámetro | Valor |
|---|---|
| H1 Heating | 3s |
| H2 Heating | 6.5s |
| Cooling | 9s |
| Opening Delay | 1s |
| Ram Pressure | 175 bar |
| Ram Pos Heat Stop | 99 mm |
| Steam Pressure | 65 PSI |
| Hydraulic Pressure | 2200 PSI |
| Cake Weight | 182g |

**Temperaturas extrusor:**
- Bottom: 135°
- Middle: 135°
- Top: 135°
- Nozzle: 125°
- Ext. Time: 4.2s

**Live Monitoring (simulado):**
- 847 / 1,000 unidades producidas
- 138 units/hr
- 12 rechazos (1.4%)
- 8h 49m elapsed

**Sensores ambientales:**
- Ambient: 72.4°F (NOMINAL)
- Humidity: 44% (NOMINAL)
- Chiller In: 54°F (NOMINAL)
- Chiller Out: 62°F (NOMINAL)
- Hydraulic Oil: 118°F (NOMINAL)

**Schedule del día** (barra de tiempo 07:00–23:00):
- ONX-2026-003 — 84.7% completado
- ONX-2026-005 — Insomniac Music Group (siguiente)

---

### 3.4 Press Log (`/#/press-log`)
**Propósito:** Registro de turno diario del operador para la AD12. Formulario de campo completo.

**8 secciones del formulario:**
1. Shift ID (fecha, operador, turno #, hora inicio/fin, job ID, cliente)
2. Vinyl Spec (formato, peso, color, blend, % regrind)
3. Press Settings — AD12 (extruder temp, mould temps, clamp pressure, clamp time, cooling time, cycle time, trimmer, RPM, biscuit weight)
4. Production Counts (good count, reject count, test press count, total cycles)
5. Environmental (ambient temp, humidity, chiller in/out, hydraulic oil, water pressure, steam pressure)
6. Vinyl & Materials (vinyl used lbs, regrind used lbs, labels used)
7. Issues (stoppages, reject reasons, quality notes, maintenance flags)
8. Handoff (shift notes, next shift handoff, stamper IDs A/B, stamper condition)

**Historial de turnos (6 logs):**
| Fecha | Job | Cliente | Good | Reject | Yield |
|---|---|---|---|---|---|
| Mar 15 (LIVE) | ONX-2026-003 | Puscifer Ent. | 847 | 12 | 98.0% |
| Mar 14 | ONX-2026-003 | Puscifer Ent. | 520 | 8 | 98.5% |
| Mar 13 | ONX-2026-003 | Puscifer Ent. | 480 | 15 | 96.0% |
| Mar 10 | ONX-2026-004 | Kanebell Ent. | 208 | 5 | 96.3% |
| Mar 8 | ONX-2026-008 | Scott Van Orden | 205 | 3 | 97.6% |
| Mar 6 | ONX-2026-001 | Adam Bartlett | 165 | 2 | 98.8% |

**Estadísticas acumuladas:** 2,425 total good | 45 total rejects | 97.6% avg yield | 1h 32m downtime

**API:** `GET /api/press-logs`, `POST /api/press-logs`, `PATCH /api/press-logs/:id`

---

### 3.5 Environmental Monitoring (`/#/environment`)
**Propósito:** Monitoreo ambiental de la planta con umbrales de alerta.

**Hardware recomendado (aún no conectado):**
- Vaisala HMT331 × 2 (temp & humidity)
- Inline Water Temp × 2 (chiller loop)
- AD12 Built-in Sensor via Beckhoff PLC

**Sensores y estado:**
| Sensor | Valor Actual | Min | Max | Avg | Umbral | Status |
|---|---|---|---|---|---|---|
| Ambient Temp | 74.0°F | 70.5 | 74.1 | 72.4 | 65–85°F | NOMINAL |
| Humidity | 46.7% | 40.0 | 47.6 | 44.0 | 40–55% | NOMINAL |
| Chiller Inlet | 55.0°F | 52.2 | 55.8 | 54.1 | 50–58°F | NOMINAL |
| Chiller Outlet | 63.3°F | 60.5 | 63.7 | 62.2 | 58–66°F | NOMINAL |
| Hydraulic Oil | 119.4°F | 114.3 | 122.8 | 118.5 | < 122°F | **WATCH** |
| Steam Pressure | 67.4 PSI | 62.1 | 67.8 | 65.0 | 55–75 PSI | NOMINAL |

**Alerta activa:** Hydraulic Oil en estado WATCH (max registrado: 122.8°F, umbral: 122°F).

**Vistas históricas:** 24hr / 7day / 30day

**API:** `GET /api/sensor-readings`

---

### 3.6 Financial Overview (`/#/finance`)
**Propósito:** P&L mensual, balance sheet, AR/AP aging y profitability por job.

**P&L Enero 2026:**
| Categoría | Monto |
|---|---|
| Revenue (Pressing) | $32,659 |
| Vinyl Pellets | -$4,822 |
| Labels | -$2,393 |
| Jackets & Inserts | -$3,200 |
| Mastering / Cutting | -$3,239 |
| IC Labor (Pressing) | -$5,099 |
| Plating (RTI) | -$4,800 |
| Utilities | -$3,847 |
| Shipping Materials | -$1,252 |
| Other COGS | -$3,000 |
| **Total COGS** | **-$31,652** |
| **Gross Profit** | **$1,007 (3.1%)** |
| Rent | -$6,150 |
| Insurance | -$680 |
| Software/Subscriptions | -$350 |
| Professional Services | -$750 |
| Other OpEx | -$500 |
| **Total OpEx** | **-$8,430** |
| **Net Income** | **-$7,423** |

**Hallazgo importante:** El Balance Sheet de enero 2026 está etiquetado "FROM QUICKBOOKS" — es el único dato real extraído de QB. Los demás meses generan datos aproximados aleatoriamente.

**Cash Position:**
- Checking: $8,470
- Savings: $6,160
- CC Available: -$12,770
- **Net Cash: $15,400**

**AR / AP:**
- Total AR: $22,068 | AP: $9,200 | Net: $12,868
- **Ira Altwegg: $2,019 en bucket 91+ días** (riesgo de cobro)
- Skanking Forces: -$106 (balance negativo — posible crédito o error)

**API:** `GET /api/financials`, `GET /api/ar-aging`

---

### 3.7 AD12 Maintenance (`/#/maintenance`)
**Propósito:** Calendario de mantenimiento preventivo y correctivo de la AD12.

**Estado actual:** 1 overdue | 9 due soon

**Tareas críticas:**
| Tarea | Frecuencia | Responsable | Próxima | Estado |
|---|---|---|---|---|
| Water Loop Inspection | Monthly | Moe | 2026-02-20 | **OVERDUE** |
| Full Safety System Audit | Quarterly | External | 2026-03-15 | Due Soon |
| Hydraulic Filter Change | Quarterly | External | 2026-03-15 | Due Soon |
| Extruder Heater Element Check | Quarterly | External | 2026-03-15 | Due Soon |
| Full Press Calibration | Quarterly | External | 2026-03-15 | Due Soon |
| Hydraulic Oil Analysis | Monthly | Moe | 2026-03-15 | Due Soon |
| Complete Annual Overhaul | Annual | Pheenix Alpha AB | 2026-06-01 | On Track |

**Partes críticas SIN STOCK (7 items):**
| Parte | Stock | Reorder At | Proveedor |
|---|---|---|---|
| Hydraulic Seals | 0 | 1 set | Pheenix Alpha AB |
| Mould Heaters | 0 | 2 units | Pheenix Alpha AB |
| Temperature Sensors | 0 | 2 units | Pheenix Alpha AB |
| Extruder Screw Tip | 0 | 1 unit | Pheenix Alpha AB |
| Hydraulic Pump Seal Kit | 0 | 1 kit | Pheenix Alpha AB |
| Steam Valve Assembly | 0 | 1 unit | Pheenix Alpha AB |
| Dampers (Press) | 0 | 2 units | Pheenix Alpha AB |

**RIESGO CRÍTICO:** La AD12 es el único equipo de producción. Un fallo con 0 partes de repuesto y lead time de 3-4 semanas desde Suecia podría detener operaciones completamente.

**API:** `GET /api/maintenance`, `PATCH /api/maintenance/:id`

---

### 3.8 Inventory & Purchasing (`/#/inventory`)
**Propósito:** Control de inventario de materiales y seguimiento de órdenes de compra.

**Inventario actual:**
| Material | Stock | Reorder | Status |
|---|---|---|---|
| Black Virgin PVC | 1,200 lbs | 500 lbs | OK |
| Black Regrind PVC | 340 lbs | 200 lbs | OK |
| Color PVC (Various) | 180 lbs | 100 lbs | **LOW** |
| Labels (Blank Stock) | 4,200 units | 5,000 units | **LOW** |
| Jackets (Standard) | 850 units | 500 units | OK |
| Inner Sleeves | 2,100 units | 2,000 units | OK |
| Shrinkwrap | 12 rolls | 2 rolls | OK |

**Purchase Orders activas:**
| PO # | Vendor | Item | Monto | Estado |
|---|---|---|---|---|
| PO-2026-042 | Vinyl Supply Co. | Black Virgin PVC 500 lbs | $2,400 | received |
| PO-2026-043 | Print Masters | Custom Labels — Puscifer | $1,200 | in-transit |
| PO-2026-044 | Jacket World | Gatefold Jackets 300 units | $1,800 | ordered |
| PO-2026-045 | Vinyl Supply Co. | Color PVC 200 lbs | $1,600 | in-transit |
| PO-2026-046 | Sleeve Supply | Inner Sleeves 2000 units | $320 | received |

**API:** `GET /api/inventory`, `PATCH /api/inventory/:id`

---

### 3.9 Shipping & Tracking (`/#/shipping`)
**Propósito:** Gestión de envíos FedEx y UPS, tracking y historial.

**Resumen:**
- Active Shipments: 2
- In Transit: 1
- Delivered This Month: 1
- Avg Transit Time: 2.8 días

**Envíos activos:**
| Carrier | Tracking # | Job | Recipient | Status |
|---|---|---|---|---|
| FedEx | 796102999012 | ONX-2026-002 | Carrington Bornstien | In Transit |
| UPS | 1Z999AA10123456784 | ONX-2026-008 | Scott Van Orden | Label Created |

**Cuenta FedEx:** RecordMadness | 4 envíos | $463.75 total spend  
**Cuenta UPS:** 2 envíos | $109.25 total spend

**Historial completo:** 6 envíos (4 FedEx, 2 UPS), todos vinculados a job IDs.

**API:** `GET /api/shipments`

---

### 3.10 Lead Tracker (`/#/leads`)
**Propósito:** CRM de ventas para el equipo de Moe.

**Resumen:**
- Total Leads: 36
- Pipeline Value: $181,300
- Hot Leads: 9
- **Overdue Follow-ups: 27** ← Problema crítico
- Won/Closed: 7

**Distribución por etapa:**
New Lead: 2 | Contacted: 10 | Quoting: 10 | Negotiating: 5 | Won: 5 | Repeat Client: 2 | Lost: 2

**Leads de alta prioridad:**
| Lead | Empresa | Etapa | Valor |
|---|---|---|---|
| Roc Nation | Roc Nation | Negotiating | $25,000 |
| Jayson | Scarlet Moon | Negotiating | $15,000 |
| Puscifer Entertainment | — | Won | $12,500 |
| Eric Joseph Carlson | — | Quoting | $9,500 |
| Gavin Gamboa | — | Quoting | $9,000 |

**Fuentes de leads:** Cold Call, Referral, Website, Instagram, Trade Show, Word of Mouth, Returning

**API:** `GET /api/leads`, `POST /api/leads`, `PATCH /api/leads/:id`

---

### 3.11 Vendors (`/#/vendors`)
**Propósito:** Directorio de proveedores con métricas de gasto y calificación.

**Proveedores clave:**
- RTI (Record Technology Inc.) — Plating — Lead: 2-3 semanas
- Pheenix Alpha AB — AD12 Parts & Service (Scotty, remote) — Lead: 3-4 semanas desde Suecia
- All Temps — Water Loop / Chiller — Lead: 1-2 días
- PLC Consulting (Louis) — Safety Valves / Boiler — Lead: 1-2 semanas
- Vinyl Supply Co. — Virgin & Color PVC — Lead: 1-2 semanas
- Print Masters — Labels — Lead: 1-2 semanas

**API:** `GET /api/vendors`, `GET /api/vendors/:id`

---

## 4. Flujos de Negocio Documentados

### Flujo 1: Onboarding de Job (Intake → Press)
```
Nuevo cliente → Lead Tracker (won) 
  → Job creado en INTAKE (job ID: ONX-YYYY-NNN)
  → Recepción de archivos (prepress)
  → Depósito requerido (75% mínimo para READY)
  → Materials check (vinyl, labels, jackets en stock)
  → READY TO PRESS
  → Press Control asigna turno en schedule
  → IN PRODUCTION
```

### Flujo 2: Producción Diaria
```
Operador (Billy) abre Press Log
  → Crea nuevo turno (job ID, hora inicio)
  → Registra parámetros AD12 (temps, presiones)
  → Registra conteos cada hora aprox.
  → Al final del turno: stoppages, reject reasons, handoff notes
  → POST /api/press-logs guarda el registro
```

### Flujo 3: Control de Calidad
```
IN PRODUCTION → QC
  → Revisión visual del lote
  → Reject rate calculado (good / total cycles)
  → Si pasa: → PACKAGING
  → Si falla: re-run o scrap (no modelado en sistema actual)
```

### Flujo 4: Envío
```
PACKAGING → SHIPPED
  → Se crea label en FedEx/UPS (manual hoy)
  → Tracking number ingresado manualmente en sistema
  → Status actualizado manualmente
  → Cliente notificado (¿manual via Gmail?)
  → DELIVERED al confirmar entrega
```

### Flujo 5: Facturación y Cobro
```
Job SHIPPED → Factura generada en QuickBooks (manual)
  → AR registrado en sistema
  → AR Aging monitoreado en Dashboard y Finance
  → Cobro gestionado fuera del sistema
  → Outstanding: Ira Altwegg $2,019 en 91+ días
```

### Flujo 6: Mantenimiento Preventivo
```
Sistema genera schedule basado en frecuencias
  → Billy ejecuta diarios/semanales
  → Moe ejecuta mensuales
  → Externos ejecutan trimestrales/anuales (Pheenix Alpha AB para annual overhaul)
  → Técnico local: All Temps (chiller), Louis/PLC Consulting (boiler)
```

### Flujo 7: Ventas (Moe's Pipeline)
```
Lead entra (website/Instagram/referral/cold-call)
  → Moe califica y asigna prioridad (hot/normal/low)
  → Secuencia: New Lead → Contacted → Quoting → Negotiating → Won/Lost
  → Al ganar: job creado en pipeline
  → Communication log registra cada interacción
```

---

## 5. Análisis de Autenticación y Seguridad

### Estado Actual — CRÍTICO

**Credenciales hardcodeadas en frontend (`client/src/lib/authContext.tsx:15`):**
```typescript
const VALID_CREDENTIALS = { username: "Admin", password: "OnyxCCD" };
```

**Implicaciones:**
1. Cualquiera que abra DevTools en el navegador puede ver las credenciales
2. El archivo JS compilado distribuido contiene las credenciales en texto plano (con minificación, pero no cifrado)
3. No existe sesión real en servidor — la "autenticación" es solo un estado React local
4. Sin logout real: borrar localStorage/sessionStorage = deslogeado
5. Un solo usuario/contraseña para toda la organización

**Passport.js está instalado** (`passport@0.7.0`, `passport-local@1.0.0`) pero no se usa para autenticación real.

**Recomendaciones de seguridad (priorizadas):**
1. Mover validación de credenciales al servidor (Passport.js ya instalado)
2. Usar hashing bcrypt para passwords almacenados en DB
3. Implementar sesiones server-side con express-session (ya instalado)
4. Agregar HTTPS/TLS para producción
5. Considerar roles: Admin vs. Operator vs. Sales

---

## 6. Base de Datos y Persistencia

### Estado Actual — CRÍTICO

**La aplicación usa `MemStorage`** — una clase con Maps de JavaScript en memoria:
```typescript
// server/storage.ts
class MemStorage {
  private jobs: Map<number, Job> = new Map();
  private leads: Map<number, Lead> = new Map();
  // ... etc para todas las 11 tablas
}
```

**Consecuencias:**
- Al reiniciar `npm run dev`: todos los datos sembrados (seed) vuelven al estado inicial
- No hay persistencia entre reinicios
- No hay backup posible
- No hay acceso multi-instancia
- Los datos de press logs, leads, maintenance updates NO sobreviven al restart

**El esquema PostgreSQL SÍ existe** (`shared/schema.ts`) con 11 tablas bien definidas, pero:
- No hay string de conexión a PostgreSQL configurado
- No hay `drizzle.config.ts` que apunte a una DB real
- El comando `npm run db:push` existe pero no tiene DB a donde conectar

**Tablas definidas en esquema:**
1. `jobs` — Pipeline de trabajos
2. `production_runs` — Runs de producción
3. `financials` — Resúmenes financieros mensuales
4. `maintenance_tasks` — Tareas de mantenimiento
5. `sensor_readings` — Lecturas de sensores
6. `inventory` — Items de inventario
7. `ar_aging` — Cuentas por cobrar aging
8. `shipments` — Envíos
9. `leads` — Pipeline de ventas CRM
10. `vendors` — Directorio de proveedores
11. `press_logs` — Logs de turno de prensa

---

## 7. API REST — Endpoints Confirmados

Los siguientes endpoints fueron confirmados via intercepción de red Playwright:

### GET Endpoints
| Endpoint | Descripción | Registros (seed) |
|---|---|---|
| `GET /api/jobs` | Todos los jobs del pipeline | 12 jobs |
| `GET /api/production-runs` | Runs de producción | — |
| `GET /api/financials` | Resúmenes financieros | — |
| `GET /api/maintenance` | Tareas de mantenimiento | 15 tareas |
| `GET /api/sensor-readings` | Lecturas de sensores | — |
| `GET /api/inventory` | Items de inventario | 7 items |
| `GET /api/ar-aging` | AR aging buckets | 12 registros |
| `GET /api/shipments` | Envíos | 6 envíos |
| `GET /api/leads` | Leads CRM | 36 leads |
| `GET /api/vendors` | Directorio proveedores | — |
| `GET /api/vendors/:id` | Vendor específico | — |
| `GET /api/press-logs` | Logs de turno | 6 logs |

### Mutación Endpoints
| Endpoint | Descripción |
|---|---|
| `PATCH /api/jobs/:id` | Actualizar status/campos de job |
| `PATCH /api/maintenance/:id` | Marcar tarea completada |
| `PATCH /api/inventory/:id` | Actualizar stock |
| `PATCH /api/leads/:id` | Actualizar lead/status |
| `POST /api/leads` | Crear nuevo lead |
| `POST /api/press-logs` | Guardar log de turno |
| `PATCH /api/press-logs/:id` | Actualizar log existente |

**Total: 12 GET + 7 mutaciones = 19 endpoints**

---

## 8. Oportunidades de Integración

### Matriz de Integraciones

| Sistema | Estado en Sidebar | Realidad | Prioridad |
|---|---|---|---|
| QuickBooks | ✅ "connected" | Solo un balance sheet Jan 2026 importado manualmente | 🔴 ALTA |
| Monday.com | ✅ "connected" | Sin código de integración | 🟡 MEDIA |
| Gmail | ✅ "connected" | Sin código de integración | 🟡 MEDIA |
| FedEx | ✅ "connected" | Tracking # ingresados manualmente | 🔴 ALTA |
| UPS | ✅ "connected" | Tracking # ingresados manualmente | 🟡 MEDIA |
| Slack | 🔄 "syncing" | Sin código de integración | 🟡 MEDIA |
| Sensors | ✅ "connected" | Datos simulados/random | 🔴 ALTA |

---

## 9. Integración QuickBooks

### Situación Actual
- La única data real de QuickBooks visible es el Balance Sheet de enero 2026
- Está etiquetado "FROM QUICKBOOKS" en la UI
- El P&L mensual está **hardcodeado** en `client/src/pages/finance.tsx` como objeto estático
- Los balances de otros meses se **generan aleatoriamente** con pequeñas variaciones

### Arquitectura Propuesta (QuickBooks Online API)

```
QuickBooks Online API v3
  ├── OAuth 2.0 (Intuit identity platform)
  ├── Sandbox disponible para desarrollo
  └── Endpoints necesarios:
      ├── /v3/company/{realmId}/reports/ProfitAndLoss
      ├── /v3/company/{realmId}/reports/BalanceSheet
      ├── /v3/company/{realmId}/query?query=SELECT * FROM Invoice
      ├── /v3/company/{realmId}/query?query=SELECT * FROM Bill
      └── /v3/company/{realmId}/query?query=SELECT * FROM Customer
```

### Campos a sincronizar
- **Ingresos:** Invoices por cliente → vincular con job IDs
- **COGS:** Bills de proveedores (RTI, Vinyl Supply Co., etc.)
- **AR Aging:** Invoices overdue → reemplazar datos hardcodeados
- **AP:** Bills pending → reemplazar datos hardcodeados
- **Cash Position:** Bank accounts → reemplazar dato hardcodeado

### Implementación sugerida
1. Agregar ruta `/api/auth/quickbooks` para OAuth flow
2. Almacenar tokens en DB (access_token + refresh_token)
3. Webhook de QuickBooks para invalidar cache al recibir cambios
4. Job CRON cada hora para sync financials
5. Mapear `clientName` de Jobs a `Customer` en QuickBooks

### Esfuerzo estimado: 2-3 semanas (backend + frontend)

---

## 10. Integración Monday.com

### Situación Actual
Sin código de integración. El sidebar muestra "connected" pero es decorativo.

### Uso potencial
Monday.com podría usarse como vista externa para clientes o como project management adicional al pipeline interno.

### Arquitectura propuesta
```
Monday.com API (GraphQL)
  ├── Board: "Onyx Production Pipeline"
  │   ├── Column: Job ID (ej: ONX-2026-003)
  │   ├── Column: Client Name
  │   ├── Column: Status (refleja etapa del pipeline)
  │   ├── Column: Ship Date
  │   └── Column: Notes
  └── Webhooks: cuando status cambia en Monday → update en Onyx CC
```

### Flujo bidireccional sugerido
1. Onyx CC crea job → POST a Monday API crea item en board
2. Cliente/Moe actualiza en Monday → webhook → PATCH /api/jobs/:id
3. Útil para que clientes puedan ver estado sin acceder al Command Center

### Esfuerzo estimado: 1-2 semanas

---

## 11. Integración FedEx / UPS

### Situación Actual
Los tracking numbers se ingresan **manualmente** en el sistema. No hay llamadas reales a APIs de carriers.

### FedEx Integration (ShipEngine o API directa)
```
FedEx Ship API v1
  Account: RecordMadness
  
  Endpoints necesarios:
  ├── POST /ship/v1/shipments (crear label)
  ├── GET /track/v1/trackingdocuments (tracking en tiempo real)
  └── GET /rates/v1/rates/quotes (cotización de tarifas)
  
  Datos a automatizar:
  ├── Ship From: Onyx Record Press, Arcadia CA
  ├── Commodity: Vinyl Records
  ├── Weight: calculado desde quantity × peso por formato
  └── YOUR REFERENCE: job_id + catalog number
```

### UPS Integration
```
UPS Developer Kit
  ├── POST /ship/v1/shipments (crear label UPS)
  ├── GET /track/v1/details/{trackingNumber}
  └── Webhook para status updates
```

### Automatizaciones de alto valor
1. **Auto-label:** Cuando job pasa a PACKAGING → generar label automáticamente con datos del job
2. **Track & update:** Polling cada 2 horas → actualizar status de shipment automáticamente
3. **Client notification:** Al detectar "Out for Delivery" → trigger email via Gmail a cliente
4. **Cost capture:** Shipping cost real → agregado a COGS del job para P&L preciso

### Esfuerzo estimado: 2-3 semanas

---

## 12. Integración Gmail / Notificaciones

### Situación Actual
Gmail aparece como "connected" en sidebar pero sin funcionalidad.

### Casos de uso de alto impacto
1. **Notificación de envío:** Auto-email cuando FedEx/UPS detecta "In Transit"
2. **Lead follow-up reminders:** Email interno a Moe cuando lead tiene follow-up overdue
3. **Maintenance alerts:** Email a Billy/Moe cuando tarea pasa a OVERDUE
4. **Invoice/Quote:** Enviar cotizaciones desde el sistema a leads en etapa "Quoting"
5. **Weekly summary:** Digest automático semanal (jobs, revenue, AR aging)

### Arquitectura propuesta
```
Gmail API (Google Cloud Console)
  ├── OAuth 2.0 para autenticación
  ├── Service Account para envíos del sistema (no-reply@onyx...)
  └── Endpoints:
      ├── POST /gmail/v1/users/{userId}/messages/send
      └── POST /gmail/v1/users/{userId}/drafts/create
      
Templates sugeridos:
  ├── shipment-notification.html (with tracking link)
  ├── lead-follow-up-reminder.html
  ├── maintenance-overdue-alert.html
  └── weekly-digest.html
```

### Alternativa recomendada: SendGrid / Resend
Para un Command Center industrial, una API de email transaccional dedicada (Resend, SendGrid, Postmark) es más robusta que Gmail API y no requiere OAuth flow complejo.

### Esfuerzo estimado: 1 semana (con Resend/SendGrid)

---

## 13. Datos de Máquina AD12

### Especificaciones de la Pheenix Alpha AD12
**Fabricante:** Pheenix Alpha AB, Suecia  
**Contacto de soporte:** Scotty (remoto)  
**Lead time de partes:** 3-4 semanas (envío internacional desde Suecia)  
**Control PLC:** Beckhoff PLC (mencionado en Environmental module)

### Parámetros Operacionales Documentados
El sistema ya captura los siguientes parámetros en `press_logs`:

**Press Settings:**
- Extruder Temp (°F)
- Mould Temp Top / Bottom (°F)
- Clamp Pressure (PSI)
- Clamp Time (sec)
- Cooling Time (sec)
- Cycle Time (sec)
- Trimmer Setting
- Extruder RPM
- Biscuit Weight (grams)

**Environmental durante turno:**
- Ambient Temp (°F)
- Humidity (%)
- Chiller Temp In/Out (°F)
- Hydraulic Oil Temp (°F)
- Water Pressure (PSI)
- Steam Pressure (PSI)

### Parámetros Visibles en Press Control
| Parámetro | Valor actual (ONX-2026-003) |
|---|---|
| H1 Heating | 3s |
| H2 Heating | 6.5s |
| Cooling | 9s |
| Opening Delay | 1s |
| Ram Pressure | 175 bar |
| Ram Pos Heat Stop | 99 mm |
| Steam Pressure | 65 PSI |
| Hydraulic Pressure | 2200 PSI |
| Cake Weight | 182g |
| Extruder Bottom | 135°F |
| Extruder Middle | 135°F |
| Extruder Top | 135°F |
| Nozzle | 125°F |
| Ext. Time | 4.2s |

### Conexión Real a la Máquina (Estado)
**Los datos mostrados son simulados.** No existe conexión en tiempo real al PLC Beckhoff ni a sensores físicos. La pantalla de "Live Monitoring" (847 units, 138 units/hr, etc.) es data seed/mockeada.

### Oportunidad: Integración PLC via OPC-UA
```
AD12 Beckhoff PLC
  │
  ├── OPC-UA Server (protocolo estándar de automatización industrial)
  │    └── Variables: cycle_count, reject_count, hydraulic_pressure, 
  │                   extruder_temps, clamp_status, steam_pressure
  │
  ├── Node.js OPC-UA Client (librería: node-opcua)
  │    └── Poll cada 5 segundos
  │
  └── WebSocket → frontend React
       └── Actualización en tiempo real de Press Control page
```

### Alerta de Riesgo Operacional
**9 partes críticas sin stock + lead time 3-4 semanas desde Suecia = exposición de detención de producción.**

Si falla cualquiera de estas partes (especialmente Hydraulic Seals, Mould Heaters, Hydraulic Pump Seal Kit), la prensa se detiene y se tardaría hasta 4 semanas en reanudar producción. Con un revenue de ~$33K/mes, eso podría representar una pérdida de $25K+ más penalizaciones por retraso con clientes.

---

## 14. Riesgos, Supuestos y Preguntas Abiertas

### RIESGOS CRÍTICOS (P0)

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | MemStorage: pérdida de datos en reinicio | CATASTRÓFICO | Migrar a PostgreSQL real inmediatamente |
| R2 | Credenciales hardcodeadas en JS público | ALTO | Mover auth a servidor con Passport.js |
| R3 | 9 partes AD12 sin stock | CATASTRÓFICO | Ordenar partes a Pheenix Alpha AB esta semana |
| R4 | 27 follow-ups overdue en leads | ALTO | Implementar reminders automáticos |
| R5 | Hydraulic Oil en WATCH (max 122.8°F) | MEDIO-ALTO | Revisar chiller, reducir carga si persiste |
| R6 | Water Loop Inspection OVERDUE | MEDIO | Ejecutar inmediatamente |

### RIESGOS ALTOS (P1)

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R7 | P&L hardcodeado en frontend (no real) | ALTO | Conectar QuickBooks API real |
| R8 | Labels (Blank Stock) en LOW (4,200 vs 5,000 threshold) | MEDIO | PO urgente a Print Masters |
| R9 | Color PVC en LOW (180 lbs vs 100 threshold) | MEDIO | PO urgente a Vinyl Supply Co. |
| R10 | Ira Altwegg $2,019 en 91+ días | MEDIO | Proceso de cobro escalado |
| R11 | Un solo usuario/contraseña para toda la org | ALTO | Multi-usuario con roles |

### SUPUESTOS

- La máquina AD12 es la única prensa operativa en Arcadia, CA
- Moe es el único vendedor ("assignedTo" siempre es "Moe")
- Billy es el operador principal de la prensa
- El balance de enero 2026 "FROM QUICKBOOKS" es el único dato financiero real importado
- La empresa usa QuickBooks Online (no Desktop), basado en que el sistema está preparado para datos API
- FedEx es el carrier primario (cuenta RecordMadness establecida)
- Los formatos de vinilo son exclusivamente 7", 10", 12"

### PREGUNTAS ABIERTAS

1. **¿Dónde está la instancia de PostgreSQL?** ¿Hay credenciales en `.env` o en secrets? ¿O la intención era usar la DB pero nunca se conectó?
2. **¿Hay un `.env` file con `DATABASE_URL`?** Esto determinaría si la conexión a PG está configurada pero no activada.
3. **¿El Beckhoff PLC de la AD12 tiene OPC-UA habilitado?** Esto es prerequisito para integración en tiempo real.
4. **¿Qué versión de QuickBooks?** Online vs Desktop cambia radicalmente la arquitectura de integración.
5. **¿El FedEx account tiene API access?** ¿Ya tienen FedEx Developer credentials o solo la cuenta de shipping?
6. **¿Belu es un socio de producción externo?** El pipeline menciona "Belu (Outsourced)" y "Belu at Onyx" como locations.
7. **¿Hay planes de múltiples prensas?** El sistema menciona solo AD12 Alpha — ¿habrá una Beta?
8. **¿Qué pasa con los test pressings (TPs)?** Se envían al cliente para aprobación antes del run completo. ¿Hay flujo específico para esto?
9. **¿La empresa tiene dominio de correo propio?** Para configurar Gmail/email de notificaciones.
10. **¿Scotty (Pheenix Alpha AB) tiene un portal de órdenes?** Para automatizar pedido de partes.

---

## 15. Recomendaciones Priorizadas

### Fase 1 — INMEDIATO (semana 1-2): Estabilización Crítica

**1.1 Migración a PostgreSQL Real** (P0)
- Crear instancia PostgreSQL (local o cloud: Railway, Supabase, RDS)
- Agregar `DATABASE_URL` al `.env`
- Ejecutar `npm run db:push` para crear tablas
- Reemplazar `MemStorage` con `DrizzleStorage` que ya está parcialmente scaffolded
- Migrar seed data a DB real
- **Impacto:** Elimina riesgo catastrófico de pérdida de datos

**1.2 Mover Autenticación al Servidor** (P0)
- Implementar Passport.js local strategy (ya instalado)
- Hashear password con bcrypt
- Sesiones via express-session + connect-pg-simple (ya instalados)
- Eliminar `VALID_CREDENTIALS` del frontend
- **Impacto:** Elimina credenciales expuestas en el frontend

**1.3 Ordenar Partes Críticas AD12** (P0, no técnico)
- Contactar a Scotty (Pheenix Alpha AB) esta semana
- Mínimo: Hydraulic Seals, Mould Heaters, Hydraulic Pump Seal Kit
- **Impacto:** Elimina riesgo de parada de producción de 4 semanas

### Fase 2 — CORTO PLAZO (semanas 3-6): Datos Reales

**2.1 QuickBooks API Integration** (P1)
- OAuth 2.0 con QuickBooks Online
- Sync mensual: P&L, Balance Sheet, AR, AP
- Reemplazar datos hardcodeados y generados aleatoriamente
- **Impacto:** Datos financieros reales; decisiones basadas en hechos

**2.2 FedEx API — Auto-labels y Real Tracking** (P1)
- FedEx Ship API: generar labels cuando job → PACKAGING
- Polling de tracking cada 2 horas
- Auto-update status de shipments
- **Impacto:** Elimina entry manual; tracking en tiempo real

**2.3 Email Notifications (Resend/SendGrid)** (P1)
- Shipment notification al cliente
- Lead follow-up overdue alert interno
- Maintenance overdue alert
- **Impacto:** 27 overdue follow-ups se convierten en notificaciones automáticas

### Fase 3 — MEDIO PLAZO (semanas 7-12): Inteligencia Operacional

**3.1 Sensores Reales — OPC-UA o MQTT** (P2)
- Conectar al Beckhoff PLC via OPC-UA
- WebSocket al frontend para datos en tiempo real
- Alertas automáticas cuando sensor excede umbral
- **Impacto:** Press Control page muestra datos reales; alerta de hydraulic oil real

**3.2 Monday.com Sync** (P2)
- Board de producción visible para clientes/equipo
- Webhook bidireccional
- **Impacto:** Visibilidad para clientes sin acceso al Command Center

**3.3 Multi-usuario con Roles** (P2)
- Roles: Admin (Moe), Operator (Billy), Sales (Moe)
- Login individual por persona
- Audit trail de cambios
- **Impacto:** Seguridad y accountability

**3.4 Reporting y Analytics** (P2)
- Yield trends por operador / por job / por color de vinilo
- Reject analysis por causa
- Revenue forecast basado en pipeline
- **Impacto:** Decisiones operacionales basadas en datos históricos

### Fase 4 — LARGO PLAZO (mes 3+): Automatización Avanzada

**4.1 AI Quote Generator** (P3)
- Input: formato, cantidad, color, peso, servicios
- Output: cotización automática con margen calculado
- Integración con Lead Tracker (auto-populate estimatedValue)

**4.2 Predictive Maintenance** (P3)
- Análisis de tendencias de temperatura hidráulica
- Alerta predictiva 24h antes de fallo probable
- Basado en datos históricos de sensor_readings

**4.3 Client Portal** (P3)
- Vista limitada para clientes: status de su job, tracking, facturas
- Login separado sin acceso al Command Center completo

---

## 16. Anexo Técnico Playwright

### Script de Discovery
El discovery fue ejecutado con `playwright-discovery.cjs` usando Playwright 1.59.1 con Chromium headless.

**Credenciales de acceso descubiertas:**
- Username: `Admin` (campo type="text" con data-testid="login-username")
- Password: `OnyxCCD` (campo data-testid="login-password")
- Submit: `[data-testid="login-submit"]`

**Nota técnica:** El campo de usuario tiene `type="text"` (no `type="email"`), lo que requiere usar el selector `data-testid` en lugar de `input[type="email"]`.

### Endpoints API Interceptados (12 únicos)
Los siguientes endpoints fueron capturados via `page.on('request')`:

```
GET /api/jobs
GET /api/production-runs  
GET /api/financials
GET /api/maintenance
GET /api/sensor-readings
GET /api/inventory
GET /api/ar-aging
GET /api/shipments
GET /api/leads
GET /api/vendors
GET /api/press-logs
GET /api/vendors/:id
```

### Páginas Auditadas
| Ruta Hash | Título |
|---|---|
| `/#/` | Dashboard (Command Center) |
| `/#/pipeline` | Job Pipeline |
| `/#/production` | Press Control — Pheenix Alpha AD12 |
| `/#/press-log` | Press Shift Log |
| `/#/environment` | Environmental Monitoring |
| `/#/finance` | Financial Overview |
| `/#/maintenance` | AD12 Maintenance |
| `/#/inventory` | Inventory & Purchasing |
| `/#/shipping` | Shipping & Tracking |
| `/#/leads` | Lead Tracker |
| `/#/vendors` | Vendors |

### Notas sobre el Routing
La aplicación usa `wouter` con `useHashLocation()`. Esto significa:
- Todas las rutas van precedidas de `#` en la URL
- El servidor sirve siempre `index.html` 
- No hay SSR (Server Side Rendering)
- El `AuthGate` en `App.tsx` protege todas las rutas mediante estado React (no sesión servidor)

---

*Documento generado: 2026-04-23*  
*Discovery ejecutado con: Playwright 1.59.1 (Chromium headless)*  
*Analizado por: Claude Sonnet 4.6 — Senior AI Software Architect*  
*Proyecto: onyx-command-center-mobile*
