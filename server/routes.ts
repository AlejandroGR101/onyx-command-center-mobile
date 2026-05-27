import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { sendOverdueDigest } from "./notifications";
import { isEmailConfigured } from "./email";

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

  return httpServer;
}
