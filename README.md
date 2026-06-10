# Onyx Record Press — Command Center

Executive & operational dashboard for Onyx Record Press, a vinyl record pressing facility in Arcadia, CA running automated Pheenix Alpha AD12 presses.

![CI](https://github.com/AlejandroGR101/onyx-command-center-mobile/actions/workflows/ci.yml/badge.svg)
![Status](https://img.shields.io/badge/Status-Production%20ready-00c853?style=flat-square)

## What it does

Single-page web app that runs the entire operation: production pipeline, AD12 press monitoring, maintenance, inventory, sales/CRM, shipping, and live financials synced from QuickBooks Online. Persistent on Supabase Postgres, session-based auth, daily cron jobs for email alerts + QB sync.

## Pages

| Page               | Description                                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Command Center** | KPIs, Revenue vs COGS, AR Aging, Cash Flow Forecast, Job Profitability, Pipeline    |
| **Job Pipeline**   | Active jobs with status, deposits, production location, regrind eligibility         |
| **Press Control**  | Live AD12 monitoring — cycle count, press parameters, extruder temps, environmental |
| **Environment**    | 24-hour sensor history (temp, humidity, chiller, hydraulic oil)                     |
| **Finance**        | P&L (real QB), Balance Sheet, AR/AP aging, customer mapping, sync controls          |
| **Maintenance**    | Daily → annual schedule, spare parts inventory, overdue alerts                      |
| **Inventory**      | Raw material levels, purchase orders, vendor directory                              |
| **Leads**          | CRM pipeline, follow-up reminders, conversion tracking                              |
| **Shipping**       | FedEx/UPS tracking integration (planned)                                            |

## Stack

| Layer      | Technology                                                                         |
| ---------- | ---------------------------------------------------------------------------------- |
| Frontend   | React 18 + Vite 7 + TypeScript + Tailwind + Radix UI + TanStack Query 5 + Recharts |
| Backend    | Express 5 + Passport.js (session-based auth, bcrypt)                               |
| Database   | Postgres on Supabase via Drizzle ORM 0.45.x (versioned migrations)                 |
| Logs       | Pino (JSON in prod, pretty in dev)                                                 |
| Monitoring | Sentry (opt-in via DSN), `/api/health` for uptime checks                           |
| Email      | Resend (internal alerts)                                                           |
| External   | QuickBooks Online (OAuth 2.0) — P&L, Balance Sheet, AR aging, customer mapping     |
| Scheduler  | node-cron (in-process daily jobs)                                                  |
| Tests      | Vitest (unit, 27 tests on QB parsers) + Playwright (E2E login)                     |
| Quality    | ESLint + Prettier + husky pre-commit + lint-staged                                 |
| CI         | GitHub Actions (lint + typecheck + tests + build on push/PR to main)               |

## Setup

```bash
# 1. Clone + install
git clone <repo>
cd onyx-command-center-mobile
npm install

# 2. Configure environment
cp .env.example .env
# edit .env — required: DATABASE_URL (Supabase), SESSION_SECRET (>=32 chars)
# optional: RESEND_API_KEY, QB_CLIENT_ID/SECRET/REDIRECT_URI/ENVIRONMENT, SENTRY_DSN

# 3. Apply DB schema + seed
npm run db:migrate     # idempotent, creates tables + records in drizzle.__drizzle_migrations
npm run db:seed        # idempotent (skips if data exists), seeds 12 jobs + 36 leads + ...

# 4. Run
npm run dev            # tsx watch — auto-restarts on file save
```

App serves at `http://localhost:5000` (same origin for API + client).
Default login: `Admin` / `OnyxCCD` (override via `ADMIN_USERNAME` / `ADMIN_PASSWORD` env).

## Scripts

```bash
npm run dev          # dev server with tsx watch
npm run check        # typecheck only (tsc)
npm test             # vitest unit tests
npm run lint         # eslint
npm run lint:fix     # eslint --fix
npm run format       # prettier --write .
npm run build        # vite (client) + esbuild (server)
npm start            # production: node dist/index.cjs

# Database
npm run db:generate -- --name=<short_desc>   # produce migration SQL from schema diff
npm run db:migrate                            # apply pending migrations
npm run db:seed                               # idempotent seed
```

## Integrations status

| Service                    | Status                                                               |
| -------------------------- | -------------------------------------------------------------------- |
| Supabase Postgres          | ✅ Active (free tier auto-pauses; resume in dashboard if needed)     |
| Resend (email alerts)      | ✅ Configured; verify a custom domain to send beyond owner mailbox   |
| QuickBooks Online          | ✅ OAuth + 4 sync phases (P&L summary, line items, BS+AR, customers) |
| Sentry                     | ⚙️ Opt-in via `SENTRY_DSN` / `VITE_SENTRY_DSN`                       |
| FedEx / UPS                | ❌ Planned                                                           |
| Beckhoff PLC (AD12)        | ❌ Planned (OPC-UA real-time sensor feed)                            |
| Monday.com / Gmail / Slack | ❌ Decorative sidebar entries                                        |

## AD12 Press Defaults

| Parameter                      | Value   |
| ------------------------------ | ------- |
| Extruder Bottom / Middle / Top | 135 °C  |
| Extruder Nozzle                | 125 °C  |
| H1 Heating                     | 3.0 s   |
| H2 Heating                     | 6.5 s   |
| Cooling                        | 9.0 s   |
| Opening Delay                  | 1.0 s   |
| Ram Pressure                   | 175 bar |
| Ram Pos Heating Stop           | 99 mm   |

(From Pheenix Alpha AB operational manual.)

## For developers / AI agents

See [`CLAUDE.md`](./CLAUDE.md) for project conventions, gotchas (PowerShell, drizzle migrations workflow, auth pattern, QB integration shape), file map, and anti-patterns.

Feature work follows the brainstorming → writing-plans → subagent-driven-development workflow. Specs live in [`docs/superpowers/specs/`](./docs/superpowers/specs/) and plans in [`docs/superpowers/plans/`](./docs/superpowers/plans/).

## License

Proprietary — Onyx Record Press. All rights reserved.
