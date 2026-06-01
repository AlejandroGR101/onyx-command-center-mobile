import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { sendOverdueDigest } from "./notifications";
import { isEmailConfigured } from "./email";
import {
  getAuthorizeUrl,
  verifyState,
  exchangeCode,
  getStatus as getQbStatus,
  isQbConfigured,
} from "./quickbooks/oauth";
import { syncAll } from "./quickbooks/sync";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Proteger todas las rutas /api registradas a partir de aquí.
  // Los endpoints /api/auth/* se montan en setupAuth (antes de registerRoutes) y NO pasan por requireAuth.
  app.use("/api", requireAuth);

  // === JOBS ===
  app.get("/api/jobs", async (_req, res) => {
    const jobs = await storage.getJobs();
    res.json(jobs);
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getJob(parseInt(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  app.patch("/api/jobs/:id", async (req, res) => {
    const updated = await storage.updateJob(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Job not found" });
    res.json(updated);
  });

  // === PRODUCTION RUNS ===
  app.get("/api/production-runs", async (_req, res) => {
    const runs = await storage.getProductionRuns();
    res.json(runs);
  });

  app.get("/api/production-runs/:jobId", async (req, res) => {
    const runs = await storage.getProductionRunsByJob(req.params.jobId);
    res.json(runs);
  });

  // === FINANCIALS ===
  app.get("/api/financials", async (_req, res) => {
    const financials = await storage.getFinancials();
    res.json(financials);
  });

  // === MAINTENANCE ===
  app.get("/api/maintenance", async (_req, res) => {
    const tasks = await storage.getMaintenanceTasks();
    res.json(tasks);
  });

  app.patch("/api/maintenance/:id", async (req, res) => {
    const updated = await storage.updateMaintenanceTask(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Task not found" });
    res.json(updated);
  });

  // === SENSOR READINGS ===
  app.get("/api/sensors", async (req, res) => {
    const sensorType = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const readings = await storage.getSensorReadings(sensorType, limit);
    res.json(readings);
  });

  // === INVENTORY ===
  app.get("/api/inventory", async (_req, res) => {
    const items = await storage.getInventory();
    res.json(items);
  });

  app.patch("/api/inventory/:id", async (req, res) => {
    const updated = await storage.updateInventoryItem(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Item not found" });
    res.json(updated);
  });

  // === AR AGING ===
  app.get("/api/ar-aging", async (_req, res) => {
    const items = await storage.getArAging();
    res.json(items);
  });

  // === FINANCIAL LINE ITEMS ===
  app.get("/api/financials/line-items", async (req, res) => {
    const period = String(req.query.period || "");
    if (!period) {
      return res.status(400).json({ error: "period requerido" });
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: "period inválido (formato YYYY-MM)" });
    }
    const items = await storage.getLineItemsByPeriod(period);

    // Agrupar por category, sort por sortOrder, flip sign para COGS/OpEx.
    const order = ["Revenue", "Cost of Goods Sold", "Operating Expenses"];
    const grouped: Array<{ category: string; items: Array<{ label: string; amount: number }> }> = [];
    for (const category of order) {
      const matching = items
        .filter((i) => i.category === category)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      if (matching.length === 0) continue;
      const isExpense = category !== "Revenue";
      grouped.push({
        category,
        items: matching.map((i) => ({
          label: i.label,
          amount: isExpense ? -Math.abs(i.amount) : i.amount,
        })),
      });
    }
    res.json(grouped);
  });

  // === BALANCE SHEET ===
  app.get("/api/financials/balance-sheet", async (req, res) => {
    const period = String(req.query.period || "");
    if (!period) {
      return res.status(400).json({ error: "period requerido" });
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: "period inválido (formato YYYY-MM)" });
    }
    const items = await storage.getBalanceSheetByPeriod(period);

    const order = ["Assets", "Liabilities", "Equity"];
    const grouped: Array<{ heading: string; lines: Array<{ label: string; amount: number; indent: number; bold: boolean }> }> = [];
    for (const section of order) {
      const matching = items
        .filter((i) => i.section === section)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      if (matching.length === 0) continue;
      grouped.push({
        heading: section,
        lines: matching.map((i) => ({
          label: i.label,
          amount: i.amount,
          indent: i.indent ?? 0,
          bold: i.isBold ?? false,
        })),
      });
    }
    res.json(grouped);
  });

  // === DASHBOARD SUMMARY (aggregated) ===
  app.get("/api/dashboard-summary", async (_req, res) => {
    const jobs = await storage.getJobs();
    const financials = await storage.getFinancials();
    const arAging = await storage.getArAging();
    // Use January 2026 (most recent full month) for the KPI display
    const janFinancial = financials.find((f: any) => f.period === '2026-01');
    const latestFinancial = janFinancial || financials[financials.length - 1];
    const prevFinancial = financials.find((f: any) => f.period === '2025-12') || (financials.length > 1 ? financials[financials.length - 2] : null);

    const activeJobs = jobs.filter(j => !["delivered", "closed"].includes(j.status));
    const totalRejects = jobs.reduce((sum, j) => sum + (j.actualCogs || 0), 0);
    
    const arBuckets = {
      current: arAging.filter(a => a.agingBucket === "current").reduce((s, a) => s + a.amount, 0),
      "1-30": arAging.filter(a => a.agingBucket === "1-30").reduce((s, a) => s + a.amount, 0),
      "31-60": arAging.filter(a => a.agingBucket === "31-60").reduce((s, a) => s + a.amount, 0),
      "61-90": arAging.filter(a => a.agingBucket === "61-90").reduce((s, a) => s + a.amount, 0),
      "91+": arAging.filter(a => a.agingBucket === "91+").reduce((s, a) => s + a.amount, 0),
    };

    res.json({
      revenue: latestFinancial?.revenue ?? 0,
      prevRevenue: prevFinancial?.revenue ?? 0,
      cashPosition: latestFinancial?.cashPosition ?? 0,
      activeJobCount: activeJobs.length,
      pressUtilization: 67,
      rejectRate: 3.2,
      financials,
      arBuckets,
      arTotal: arAging.reduce((s, a) => s + a.amount, 0),
      jobs: activeJobs,
    });
  });

  // === SHIPMENTS ===
  app.get("/api/shipments", async (_req, res) => {
    const shipments = await storage.getShipments();
    res.json(shipments);
  });

  app.get("/api/shipments/job/:jobId", async (req, res) => {
    const shipments = await storage.getShipmentsByJob(req.params.jobId);
    res.json(shipments);
  });

  // === LEADS / CRM ===
  app.get("/api/leads", async (_req, res) => {
    const leads = await storage.getLeads();
    res.json(leads);
  });

  app.get("/api/leads/:id", async (req, res) => {
    const lead = await storage.getLead(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  });

  app.patch("/api/leads/:id", async (req, res) => {
    const updated = await storage.updateLead(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Lead not found" });
    res.json(updated);
  });

  app.post("/api/leads", async (req, res) => {
    const lead = await storage.createLead(req.body);
    res.status(201).json(lead);
  });

  // === VENDORS ===
  app.get("/api/vendors", async (_req, res) => {
    const vendors = await storage.getVendors();
    res.json(vendors);
  });

  app.get("/api/vendors/:id", async (req, res) => {
    const vendor = await storage.getVendor(parseInt(req.params.id));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  });

  // === PRESS LOGS ===
  app.get("/api/press-logs", async (_req, res) => {
    const logs = await storage.getPressLogs();
    res.json(logs);
  });

  app.get("/api/press-logs/:id", async (req, res) => {
    const log = await storage.getPressLog(parseInt(req.params.id));
    if (!log) return res.status(404).json({ error: "Press log not found" });
    res.json(log);
  });

  app.post("/api/press-logs", async (req, res) => {
    const log = await storage.createPressLog(req.body);
    res.status(201).json(log);
  });

  app.patch("/api/press-logs/:id", async (req, res) => {
    const updated = await storage.updatePressLog(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Press log not found" });
    res.json(updated);
  });

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
      const summary = await syncAll(12);
      res.json(summary);
    } catch (err: any) {
      const msg = err?.message || "Error en sync QB";
      if (msg.includes("QB no conectado")) return res.status(400).json({ error: msg });
      res.status(502).json({ error: msg });
    }
  });

  return httpServer;
}
