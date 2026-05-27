import type {
  Job, InsertJob,
  ProductionRun, InsertProductionRun,
  Financial, InsertFinancial,
  MaintenanceTask, InsertMaintenanceTask,
  SensorReading, InsertSensorReading,
  InventoryItem, InsertInventoryItem,
  ArAgingItem, InsertArAgingItem,
  Shipment, InsertShipment,
  Lead, InsertLead,
  Vendor, InsertVendor,
  PressLog, InsertPressLog,
  User, InsertUser,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  jobs, productionRuns, financials, maintenanceTasks, sensorReadings,
  inventory, arAging, shipments, leads, vendors, pressLogs, users,
} from "@shared/schema";

export interface IStorage {
  // Jobs
  getJobs(): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  getJobsByStatus(status: string): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, updates: Partial<InsertJob>): Promise<Job | undefined>;

  // Production Runs
  getProductionRuns(): Promise<ProductionRun[]>;
  getProductionRunsByJob(jobId: string): Promise<ProductionRun[]>;
  createProductionRun(run: InsertProductionRun): Promise<ProductionRun>;

  // Financials
  getFinancials(): Promise<Financial[]>;
  getFinancialByPeriod(period: string): Promise<Financial | undefined>;

  // Maintenance
  getMaintenanceTasks(): Promise<MaintenanceTask[]>;
  updateMaintenanceTask(id: number, updates: Partial<InsertMaintenanceTask>): Promise<MaintenanceTask | undefined>;

  // Sensors
  getSensorReadings(sensorType?: string, limit?: number): Promise<SensorReading[]>;
  createSensorReading(reading: InsertSensorReading): Promise<SensorReading>;

  // Inventory
  getInventory(): Promise<InventoryItem[]>;
  updateInventoryItem(id: number, updates: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;

  // AR Aging
  getArAging(): Promise<ArAgingItem[]>;

  // Shipments
  getShipments(): Promise<Shipment[]>;
  getShipmentsByJob(jobId: string): Promise<Shipment[]>;

  // Leads
  getLeads(): Promise<Lead[]>;
  getLead(id: number): Promise<Lead | undefined>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: number, updates: Partial<InsertLead>): Promise<Lead | undefined>;

  // Vendors
  getVendors(): Promise<Vendor[]>;
  getVendor(id: number): Promise<Vendor | undefined>;

  // Press Logs
  getPressLogs(): Promise<PressLog[]>;
  getPressLog(id: number): Promise<PressLog | undefined>;
  createPressLog(log: InsertPressLog): Promise<PressLog>;
  updatePressLog(id: number, updates: Partial<InsertPressLog>): Promise<PressLog | undefined>;

  // Users
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

export class MemStorage implements IStorage {
  private jobs: Map<number, Job> = new Map();
  private productionRuns: Map<number, ProductionRun> = new Map();
  private financials: Map<number, Financial> = new Map();
  private maintenanceTasks: Map<number, MaintenanceTask> = new Map();
  private sensorReadings: Map<number, SensorReading> = new Map();
  private inventoryItems: Map<number, InventoryItem> = new Map();
  private arAgingItems: Map<number, ArAgingItem> = new Map();
  private shipmentsMap: Map<number, Shipment> = new Map();
  private leadsMap: Map<number, Lead> = new Map();
  private vendorsMap: Map<number, Vendor> = new Map();
  private pressLogsMap: Map<number, PressLog> = new Map();
  private usersMap: Map<number, User> = new Map();
  private nextId = 1;

  constructor() {
    this.seedData();
  }

  private getNextId(): number {
    return this.nextId++;
  }

  private seedData() {
    // === SEED JOBS ===
    const jobsData: InsertJob[] = [
      { jobId: "ONX-2026-001", clientName: "Adam Bartlett", catalogNumber: "ABR-001", format: '12"', weight: "180g", vinylColor: "Black", quantity: 500, status: "delivered", depositStatus: "100%", estimatedRevenue: 6200, actualRevenue: 5284, estimatedCogs: 4200, actualCogs: 4100, pressDate: "2026-01-15", shipDate: "2026-02-01", productionLocation: "onyx", regrindEligible: true, regrindRatio: "25%", operatorNotes: "Clean run, good fill", specialInstructions: null },
      { jobId: "ONX-2026-002", clientName: "Carrington Bornstien", catalogNumber: "CB-LP1", format: '12"', weight: "180g", vinylColor: "Black", quantity: 300, status: "shipped", depositStatus: "100%", estimatedRevenue: 5800, actualRevenue: 5266, estimatedCogs: 3800, actualCogs: 3650, pressDate: "2026-02-10", shipDate: "2026-03-05", productionLocation: "onyx", regrindEligible: true, regrindRatio: "0%", operatorNotes: null, specialInstructions: "Handle with care — special gatefold" },
      { jobId: "ONX-2026-003", clientName: "Puscifer Entertainment", catalogNumber: "PUS-2026", format: '12"', weight: "180g", vinylColor: "Clear w/ Red Splatter", quantity: 1000, status: "in-production", depositStatus: "75%", estimatedRevenue: 12500, actualRevenue: null, estimatedCogs: 8200, actualCogs: null, pressDate: "2026-03-15", shipDate: null, productionLocation: "onyx", regrindEligible: false, regrindRatio: "0%", operatorNotes: "Color match critical", specialInstructions: "Splatter pattern per client mockup. No regrind." },
      { jobId: "ONX-2026-004", clientName: "Kanebell Enterprises", catalogNumber: "KNB-007", format: '12"', weight: "140g", vinylColor: "Black", quantity: 200, status: "qc", depositStatus: "100%", estimatedRevenue: 3200, actualRevenue: null, estimatedCogs: 2100, actualCogs: 1950, pressDate: "2026-03-10", shipDate: null, productionLocation: "onyx", regrindEligible: true, regrindRatio: "50%", operatorNotes: "Regrind blend successful", specialInstructions: null },
      { jobId: "ONX-2026-005", clientName: "Insomniac Music Group", catalogNumber: "INSOM-42", format: '12"', weight: "180g", vinylColor: "Galaxy Blue", quantity: 750, status: "ready-to-press", depositStatus: "75%", estimatedRevenue: 9800, actualRevenue: null, estimatedCogs: 6500, actualCogs: null, pressDate: null, shipDate: null, productionLocation: "onyx", regrindEligible: false, regrindRatio: "0%", operatorNotes: null, specialInstructions: "Metallic labels. Handle with lint-free gloves." },
      { jobId: "ONX-2026-006", clientName: "Skanking Forces", catalogNumber: "SKF-003", format: '7"', weight: "140g", vinylColor: "Black", quantity: 500, status: "prepress", depositStatus: "75%", estimatedRevenue: 3500, actualRevenue: null, estimatedCogs: 2200, actualCogs: null, pressDate: null, shipDate: null, productionLocation: "onyx", regrindEligible: true, regrindRatio: "25%", operatorNotes: null, specialInstructions: null },
      { jobId: "ONX-2026-007", clientName: "Eben Eldridge", catalogNumber: "EE-LP2", format: '12"', weight: "180g", vinylColor: "Bone White", quantity: 300, status: "prepress", depositStatus: "100%", estimatedRevenue: 4200, actualRevenue: null, estimatedCogs: 2800, actualCogs: null, pressDate: null, shipDate: null, productionLocation: "onyx", regrindEligible: false, regrindRatio: "0%", operatorNotes: null, specialInstructions: "Audiophile grade — virgin vinyl only" },
      { jobId: "ONX-2026-008", clientName: "Scott Van Orden", catalogNumber: "SVO-004", format: '12"', weight: "140g", vinylColor: "Black", quantity: 200, status: "packaging", depositStatus: "100%", estimatedRevenue: 2800, actualRevenue: null, estimatedCogs: 1800, actualCogs: 1750, pressDate: "2026-03-08", shipDate: null, productionLocation: "onyx", regrindEligible: true, regrindRatio: "50%", operatorNotes: "Good run", specialInstructions: null },
      { jobId: "ONX-2026-009", clientName: "Robbie Waldman", catalogNumber: "RW-12", format: '12"', weight: "180g", vinylColor: "Orange Marble", quantity: 250, status: "intake", depositStatus: "none", estimatedRevenue: 3800, actualRevenue: null, estimatedCogs: 2500, actualCogs: null, pressDate: null, shipDate: null, productionLocation: "onyx", regrindEligible: false, regrindRatio: "0%", operatorNotes: null, specialInstructions: "New client — needs pressing agreement" },
      { jobId: "ONX-2026-010", clientName: "Moon Stomper Records", catalogNumber: "MSR-018", format: '12"', weight: "180g", vinylColor: "Black", quantity: 500, status: "ready-to-press", depositStatus: "100%", estimatedRevenue: 6000, actualRevenue: null, estimatedCogs: 3900, actualCogs: null, pressDate: null, shipDate: null, productionLocation: "onyx", regrindEligible: true, regrindRatio: "25%", operatorNotes: null, specialInstructions: null },
      { jobId: "ONX-2026-011", clientName: "Iration Music", catalogNumber: "IRAT-LP5", format: '12"', weight: "180g", vinylColor: "Sea Green", quantity: 2000, status: "prepress", depositStatus: "75%", estimatedRevenue: 24000, actualRevenue: null, estimatedCogs: 15500, actualCogs: null, pressDate: null, shipDate: null, productionLocation: "onyx", regrindEligible: false, regrindRatio: "0%", operatorNotes: null, specialInstructions: "Large run — may split across weeks. Deposit held." },
      { jobId: "ONX-2026-012", clientName: "Dave Cooley", catalogNumber: "DC-MSTR01", format: '10"', weight: "180g", vinylColor: "Black", quantity: 100, status: "intake", depositStatus: "none", estimatedRevenue: 1800, actualRevenue: null, estimatedCogs: 1200, actualCogs: null, pressDate: null, shipDate: null, productionLocation: "onyx", regrindEligible: true, regrindRatio: "0%", operatorNotes: null, specialInstructions: "Mastering included" },
    ];
    for (const j of jobsData) {
      const id = this.getNextId();
      this.jobs.set(id, { ...j, id } as Job);
    }

    // === SEED FINANCIALS ===
    const financialsData: InsertFinancial[] = [
      { period: "2025-10", revenue: 41200, cogs: 29800, operatingExpenses: 12400, netIncome: -1000, cashPosition: 18500, arTotal: 19200, apTotal: 8400 },
      { period: "2025-11", revenue: 38700, cogs: 28100, operatingExpenses: 11800, netIncome: -1200, cashPosition: 16800, arTotal: 17800, apTotal: 7600 },
      { period: "2025-12", revenue: 44100, cogs: 31200, operatingExpenses: 12100, netIncome: 800, cashPosition: 17200, arTotal: 20100, apTotal: 8100 },
      { period: "2026-01", revenue: 32659, cogs: 31652, operatingExpenses: 8430, netIncome: -7422, cashPosition: 15400, arTotal: 22068, apTotal: 9200 },
      { period: "2026-02", revenue: 28400, cogs: 24800, operatingExpenses: 8200, netIncome: -4600, cashPosition: 13100, arTotal: 21500, apTotal: 8800 },
      { period: "2026-03", revenue: 10528, cogs: 8200, operatingExpenses: 8100, netIncome: -5772, cashPosition: 14280, arTotal: 22068, apTotal: 9500 },
    ];
    for (const f of financialsData) {
      const id = this.getNextId();
      this.financials.set(id, { ...f, id } as Financial);
    }

    // === SEED PRODUCTION RUNS ===
    const runsData: InsertProductionRun[] = [
      {
        jobId: "ONX-2026-003", operatorName: "Billy", startTime: "2026-03-15T08:00:00",
        endTime: null, cycleCount: 847, rejectCount: 12, downtimeMinutes: 15,
        downtimeCauseCode: "DT-09", vinylUsageLbs: 320,
        ambientTemp: 72.4, humidity: 44, chillerTempIn: 54, chillerTempOut: 62, hydraulicOilTemp: 118,
        pressParameters: {
          heating1Time: 3.0, heating2Time: 6.5, coolingTime: 9.0, openingDelay: 1.0,
          extruderBottom: 135, extruderMiddle: 135, extruderTop: 135, extruderNozzle: 125,
          ramPressure: 175, ramPosHeatingStop: 99,
          extruderExtendedTime: 4.2, cakeWeight: 182,
          steamPressure: 65, hydraulicPressure: 2200
        },
        qualityPass: true, notes: "Color splatter run — pattern consistency good. AD12 defaults + extended heat for clear/splatter."
      },
      {
        jobId: "ONX-2026-004", operatorName: "Billy", startTime: "2026-03-10T07:30:00",
        endTime: "2026-03-10T15:00:00", cycleCount: 208, rejectCount: 5, downtimeMinutes: 22,
        downtimeCauseCode: "DT-07", vinylUsageLbs: 68,
        ambientTemp: 71.8, humidity: 42, chillerTempIn: 53, chillerTempOut: 61, hydraulicOilTemp: 115,
        pressParameters: {
          heating1Time: 3.0, heating2Time: 6.5, coolingTime: 9.0, openingDelay: 1.0,
          extruderBottom: 135, extruderMiddle: 135, extruderTop: 135, extruderNozzle: 125,
          ramPressure: 175, ramPosHeatingStop: 99,
          extruderExtendedTime: 3.5, cakeWeight: 148,
          steamPressure: 65, hydraulicPressure: 2200
        },
        qualityPass: true, notes: "50% regrind blend — good results. AD12 standard cycle."
      },
      {
        jobId: "ONX-2026-008", operatorName: "Billy", startTime: "2026-03-08T08:00:00",
        endTime: "2026-03-08T14:30:00", cycleCount: 205, rejectCount: 3, downtimeMinutes: 10,
        downtimeCauseCode: null, vinylUsageLbs: 65,
        ambientTemp: 73.1, humidity: 45, chillerTempIn: 55, chillerTempOut: 63, hydraulicOilTemp: 116,
        pressParameters: {
          heating1Time: 3.0, heating2Time: 6.5, coolingTime: 9.0, openingDelay: 1.0,
          extruderBottom: 135, extruderMiddle: 135, extruderTop: 135, extruderNozzle: 125,
          ramPressure: 175, ramPosHeatingStop: 99,
          extruderExtendedTime: 3.5, cakeWeight: 148,
          steamPressure: 65, hydraulicPressure: 2200
        },
        qualityPass: true, notes: "Standard black 140g — clean run. AD12 defaults."
      },
    ];
    for (const r of runsData) {
      const id = this.getNextId();
      this.productionRuns.set(id, { ...r, id } as ProductionRun);
    }

    // === SEED MAINTENANCE TASKS ===
    const maintenanceData: InsertMaintenanceTask[] = [
      { title: "Daily Safety Inspection", frequency: "daily", lastCompleted: "2026-03-15", nextDue: "2026-03-16", assignedTo: "Billy", status: "on-track", notes: "Per Pheenix Section 3: safety switches, hatches, EMS test" },
      { title: "Hydraulic Oil Level Check", frequency: "weekly", lastCompleted: "2026-03-10", nextDue: "2026-03-17", assignedTo: "Billy", status: "on-track", notes: null },
      { title: "Compressed Air System Check", frequency: "weekly", lastCompleted: "2026-03-10", nextDue: "2026-03-17", assignedTo: "Billy", status: "on-track", notes: null },
      { title: "Trimmer Knife Inspection", frequency: "weekly", lastCompleted: "2026-03-10", nextDue: "2026-03-17", assignedTo: "Billy", status: "on-track", notes: null },
      { title: "Label Magazine Alignment", frequency: "weekly", lastCompleted: "2026-03-03", nextDue: "2026-03-17", assignedTo: "Billy", status: "due-soon", notes: "Check alignment and spring tension" },
      { title: "Hydraulic Oil Analysis", frequency: "monthly", lastCompleted: "2026-02-15", nextDue: "2026-03-15", assignedTo: "Moe", status: "due-soon", notes: "Visual inspection and sample" },
      { title: "Cake Form Sensor Calibration", frequency: "monthly", lastCompleted: "2026-02-15", nextDue: "2026-03-15", assignedTo: "Moe", status: "due-soon", notes: null },
      { title: "Steam Hose Inspection", frequency: "monthly", lastCompleted: "2026-02-15", nextDue: "2026-03-15", assignedTo: "Moe", status: "due-soon", notes: null },
      { title: "Water Loop Inspection", frequency: "monthly", lastCompleted: "2026-01-20", nextDue: "2026-02-20", assignedTo: "Moe", status: "overdue", notes: "All Temps assessment scheduled 3/16" },
      { title: "Mould Surface Inspection", frequency: "monthly", lastCompleted: "2026-02-15", nextDue: "2026-03-15", assignedTo: "Billy", status: "due-soon", notes: null },
      { title: "Full Safety System Audit", frequency: "quarterly", lastCompleted: "2025-12-15", nextDue: "2026-03-15", assignedTo: "External", status: "due-soon", notes: "Pheenix training week covers this" },
      { title: "Hydraulic Filter Change", frequency: "quarterly", lastCompleted: "2025-12-15", nextDue: "2026-03-15", assignedTo: "External", status: "due-soon", notes: null },
      { title: "Extruder Heater Element Check", frequency: "quarterly", lastCompleted: "2025-12-15", nextDue: "2026-03-15", assignedTo: "External", status: "due-soon", notes: null },
      { title: "Full Press Calibration", frequency: "quarterly", lastCompleted: "2025-12-15", nextDue: "2026-03-15", assignedTo: "External", status: "due-soon", notes: "Scheduled for Pheenix training week" },
      { title: "Complete Annual Overhaul", frequency: "annual", lastCompleted: "2025-06-01", nextDue: "2026-06-01", assignedTo: "Pheenix Alpha AB", status: "on-track", notes: "Factory service — coordinate with Scotty" },
    ];
    for (const m of maintenanceData) {
      const id = this.getNextId();
      this.maintenanceTasks.set(id, { ...m, id } as MaintenanceTask);
    }

    // === SEED SENSOR READINGS (24hr of data) ===
    const now = new Date("2026-03-15T16:49:00");
    const sensorTypes = [
      { type: "ambient-temp", unit: "°F", location: "Press Area", baseValue: 72.4, variance: 2 },
      { type: "humidity", unit: "%", location: "Press Area", baseValue: 44, variance: 4 },
      { type: "chiller-in", unit: "°F", location: "Chiller Loop", baseValue: 54, variance: 2 },
      { type: "chiller-out", unit: "°F", location: "Chiller Loop", baseValue: 62, variance: 2 },
      { type: "hydraulic-oil", unit: "°F", location: "AD12", baseValue: 118, variance: 5 },
      { type: "steam-pressure", unit: "PSI", location: "Boiler", baseValue: 65, variance: 3 },
    ];
    // Generate 24 hours of readings every 30 min
    for (let h = 0; h < 48; h++) {
      const ts = new Date(now.getTime() - (48 - h) * 30 * 60 * 1000);
      for (const sensor of sensorTypes) {
        const id = this.getNextId();
        const variation = (Math.sin(h / 6) * sensor.variance / 2) + (Math.random() - 0.5) * sensor.variance;
        this.sensorReadings.set(id, {
          id,
          timestamp: ts.toISOString(),
          sensorType: sensor.type,
          value: parseFloat((sensor.baseValue + variation).toFixed(1)),
          unit: sensor.unit,
          location: sensor.location,
        });
      }
    }

    // === SEED INVENTORY ===
    const inventoryData: InsertInventoryItem[] = [
      { itemName: "Black Virgin PVC", category: "vinyl", currentStock: 1200, unit: "lbs", reorderThreshold: 500, preferredVendor: "TBD", lastOrderDate: "2026-02-28", status: "ok" },
      { itemName: "Black Regrind PVC", category: "vinyl", currentStock: 340, unit: "lbs", reorderThreshold: 200, preferredVendor: "In-House", lastOrderDate: null, status: "ok" },
      { itemName: "Color PVC (Various)", category: "vinyl", currentStock: 180, unit: "lbs", reorderThreshold: 100, preferredVendor: "TBD", lastOrderDate: "2026-03-01", status: "low" },
      { itemName: "Labels (Blank Stock)", category: "labels", currentStock: 4200, unit: "units", reorderThreshold: 5000, preferredVendor: "TBD", lastOrderDate: "2026-02-15", status: "low" },
      { itemName: "Jackets (Standard)", category: "jackets", currentStock: 850, unit: "units", reorderThreshold: 500, preferredVendor: "TBD", lastOrderDate: "2026-02-20", status: "ok" },
      { itemName: "Inner Sleeves", category: "inserts", currentStock: 2100, unit: "units", reorderThreshold: 2000, preferredVendor: "TBD", lastOrderDate: "2026-02-10", status: "ok" },
      { itemName: "Shrinkwrap", category: "packaging", currentStock: 12, unit: "rolls", reorderThreshold: 2, preferredVendor: "TBD", lastOrderDate: "2026-01-15", status: "ok" },
      // Spare parts
      { itemName: "Hydraulic Seals", category: "spare-parts", currentStock: 0, unit: "sets", reorderThreshold: 1, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "critical" },
      { itemName: "Mould Heaters", category: "spare-parts", currentStock: 0, unit: "units", reorderThreshold: 2, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "critical" },
      { itemName: "Temperature Sensors", category: "spare-parts", currentStock: 0, unit: "units", reorderThreshold: 2, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "critical" },
      { itemName: "Extruder Screw Tip", category: "spare-parts", currentStock: 0, unit: "units", reorderThreshold: 1, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "critical" },
      { itemName: "Trimmer Knife Blades", category: "spare-parts", currentStock: 1, unit: "sets", reorderThreshold: 2, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "low" },
      { itemName: "Label Magazine Springs", category: "spare-parts", currentStock: 2, unit: "units", reorderThreshold: 2, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "low" },
      { itemName: "Hydraulic Pump Seal Kit", category: "spare-parts", currentStock: 0, unit: "kits", reorderThreshold: 1, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "critical" },
      { itemName: "Steam Valve Assembly", category: "spare-parts", currentStock: 0, unit: "units", reorderThreshold: 1, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "critical" },
      { itemName: "Dampers (Press)", category: "spare-parts", currentStock: 0, unit: "units", reorderThreshold: 2, preferredVendor: "Pheenix Alpha AB", lastOrderDate: null, status: "critical" },
    ];
    for (const inv of inventoryData) {
      const id = this.getNextId();
      this.inventoryItems.set(id, { ...inv, id } as InventoryItem);
    }

    // === SEED AR AGING ===
    const arData: InsertArAgingItem[] = [
      { customerName: "Adam Bartlett", amount: 5284.14, agingBucket: "current", invoiceDate: "2026-02-20", invoiceNumber: "INV-3801", notes: "Largest current receivable" },
      { customerName: "Carrington Bornstien", amount: 5265.74, agingBucket: "current", invoiceDate: "2026-02-25", invoiceNumber: "INV-3805", notes: null },
      { customerName: "Puscifer Entertainment", amount: 1502.00, agingBucket: "current", invoiceDate: "2026-03-01", invoiceNumber: "INV-3810", notes: "Remaining balance from $28K job" },
      { customerName: "Insomniac Music Group", amount: 1695.41, agingBucket: "current", invoiceDate: "2026-03-05", invoiceNumber: "INV-3812", notes: null },
      { customerName: "Eben Eldridge", amount: 1298.84, agingBucket: "current", invoiceDate: "2026-03-01", invoiceNumber: "INV-3808", notes: null },
      { customerName: "Scott Van Orden", amount: 1030.80, agingBucket: "current", invoiceDate: "2026-02-15", invoiceNumber: "INV-3798", notes: "Maria flagged — slow payer" },
      { customerName: "Robbie Waldman", amount: 854.99, agingBucket: "current", invoiceDate: "2026-03-10", invoiceNumber: "INV-3815", notes: null },
      { customerName: "Moon Stomper Records", amount: 824.50, agingBucket: "current", invoiceDate: "2026-03-08", invoiceNumber: "INV-3814", notes: null },
      { customerName: "Dave Cooley", amount: 804.84, agingBucket: "current", invoiceDate: "2026-03-12", invoiceNumber: "INV-3818", notes: null },
      { customerName: "Kanebell Enterprises", amount: 1594.27, agingBucket: "1-30", invoiceDate: "2026-02-10", invoiceNumber: "INV-3790", notes: "Approaching 30 days" },
      { customerName: "Skanking Forces", amount: -106.22, agingBucket: "1-30", invoiceDate: "2026-02-12", invoiceNumber: "CR-3792", notes: "Credit memo" },
      { customerName: "Ira Altwegg", amount: 2018.54, agingBucket: "91+", invoiceDate: "2025-06-15", invoiceNumber: "INV-3650", notes: "Outstanding since June 2025 — recommend write-off or final demand" },
    ];
    for (const ar of arData) {
      const id = this.getNextId();
      this.arAgingItems.set(id, { ...ar, id } as ArAgingItem);
    }

    // === SEED SHIPMENTS ===
    const shipmentsData: InsertShipment[] = [
      {
        jobId: "ONX-2026-001", carrier: "fedex", trackingNumber: "796102998765", service: "FedEx Ground",
        status: "delivered", yourReference: "ABR-001 Final Run", poNumber: null, invoiceNumber: null, departmentNumber: null,
        shipDate: "2026-01-28", estimatedDelivery: "2026-02-01", actualDelivery: "2026-02-01",
        recipientName: "Adam Bartlett", recipientCity: "Los Angeles", recipientState: "CA",
        weight: 145, packageCount: 4, shippingCost: 187.50,
        events: [
          { timestamp: "2026-01-28T09:00:00", location: "Arcadia, CA", description: "Shipping label created", status: "label-created" },
          { timestamp: "2026-01-28T16:30:00", location: "Arcadia, CA", description: "Picked up", status: "picked-up" },
          { timestamp: "2026-01-29T06:15:00", location: "Los Angeles, CA", description: "Arrived at FedEx LA Hub", status: "in-transit" },
          { timestamp: "2026-01-30T03:40:00", location: "Compton, CA", description: "At FedEx Compton Sort Facility", status: "in-transit" },
          { timestamp: "2026-02-01T07:20:00", location: "Los Angeles, CA", description: "Out for delivery", status: "out-for-delivery" },
          { timestamp: "2026-02-01T14:45:00", location: "Los Angeles, CA", description: "Delivered — signed by A. BARTLETT", status: "delivered" },
        ],
      },
      {
        jobId: "ONX-2026-001", carrier: "fedex", trackingNumber: "796102994421", service: "FedEx Ground",
        status: "delivered", yourReference: "ABR-001 TPs", poNumber: null, invoiceNumber: null, departmentNumber: null,
        shipDate: "2026-01-10", estimatedDelivery: "2026-01-13", actualDelivery: "2026-01-12",
        recipientName: "Adam Bartlett", recipientCity: "Los Angeles", recipientState: "CA",
        weight: 8, packageCount: 1, shippingCost: 12.50,
        events: [
          { timestamp: "2026-01-10T10:00:00", location: "Arcadia, CA", description: "Shipping label created", status: "label-created" },
          { timestamp: "2026-01-10T17:00:00", location: "Arcadia, CA", description: "Picked up", status: "picked-up" },
          { timestamp: "2026-01-12T13:30:00", location: "Los Angeles, CA", description: "Delivered", status: "delivered" },
        ],
      },
      {
        jobId: "ONX-2026-002", carrier: "fedex", trackingNumber: "796102999012", service: "FedEx 2Day",
        status: "in-transit", yourReference: "CB-LP1 Final Run", poNumber: null, invoiceNumber: null, departmentNumber: null,
        shipDate: "2026-03-15", estimatedDelivery: "2026-03-19", actualDelivery: null,
        recipientName: "Carrington Bornstien", recipientCity: "Brooklyn", recipientState: "NY",
        weight: 110, packageCount: 3, shippingCost: 245.00,
        events: [
          { timestamp: "2026-03-15T11:00:00", location: "Arcadia, CA", description: "Shipping label created", status: "label-created" },
          { timestamp: "2026-03-15T17:45:00", location: "Arcadia, CA", description: "Picked up", status: "picked-up" },
          { timestamp: "2026-03-16T04:20:00", location: "Irwindale, CA", description: "Departed FedEx location", status: "in-transit" },
          { timestamp: "2026-03-17T09:10:00", location: "Memphis, TN", description: "Arrived at FedEx Memphis Hub", status: "in-transit" },
          { timestamp: "2026-03-18T06:30:00", location: "Newark, NJ", description: "In transit", status: "in-transit" },
        ],
      },
      {
        jobId: "ONX-2026-002", carrier: "fedex", trackingNumber: "796102995533", service: "FedEx Ground",
        status: "delivered", yourReference: "CB-LP1 TPs", poNumber: null, invoiceNumber: null, departmentNumber: null,
        shipDate: "2026-02-05", estimatedDelivery: "2026-02-09", actualDelivery: "2026-02-08",
        recipientName: "Carrington Bornstien", recipientCity: "Brooklyn", recipientState: "NY",
        weight: 6, packageCount: 1, shippingCost: 18.75,
        events: [
          { timestamp: "2026-02-05T10:00:00", location: "Arcadia, CA", description: "Shipping label created", status: "label-created" },
          { timestamp: "2026-02-05T17:00:00", location: "Arcadia, CA", description: "Picked up", status: "picked-up" },
          { timestamp: "2026-02-08T14:00:00", location: "Brooklyn, NY", description: "Delivered", status: "delivered" },
        ],
      },
      {
        jobId: "ONX-2026-008", carrier: "ups", trackingNumber: "1Z999AA10123456784", service: "UPS Ground",
        status: "label-created", yourReference: "SVO-004 Final Run", poNumber: null, invoiceNumber: null, departmentNumber: null,
        shipDate: "2026-03-19", estimatedDelivery: "2026-03-24", actualDelivery: null,
        recipientName: "Scott Van Orden", recipientCity: "Portland", recipientState: "OR",
        weight: 68, packageCount: 2, shippingCost: 95.00,
        events: [
          { timestamp: "2026-03-18T15:00:00", location: "Arcadia, CA", description: "Shipping label created", status: "label-created" },
        ],
      },
      {
        jobId: "ONX-2026-004", carrier: "ups", trackingNumber: "1Z999AA10123456785", service: "UPS Ground",
        status: "delivered", yourReference: "KNB-007 TPs", poNumber: null, invoiceNumber: null, departmentNumber: null,
        shipDate: "2026-03-02", estimatedDelivery: "2026-03-05", actualDelivery: "2026-03-04",
        recipientName: "Kanebell Enterprises", recipientCity: "Nashville", recipientState: "TN",
        weight: 5, packageCount: 1, shippingCost: 14.25,
        events: [
          { timestamp: "2026-03-02T10:00:00", location: "Arcadia, CA", description: "Shipping label created", status: "label-created" },
          { timestamp: "2026-03-02T17:30:00", location: "Arcadia, CA", description: "Picked up", status: "picked-up" },
          { timestamp: "2026-03-04T11:15:00", location: "Nashville, TN", description: "Delivered", status: "delivered" },
        ],
      },
    ];
    for (const s of shipmentsData) {
      const id = this.getNextId();
      this.shipmentsMap.set(id, { ...s, id } as Shipment);
    }

    // === SEED LEADS (from Moe's actual Apple Notes "STAY ON TOP OF THESE LEADS") ===
    const leadsData: InsertLead[] = [
      // --- EXISTING CLIENTS (linked to jobs) ---
      {
        contactName: "Adam Bartlett", companyName: null, email: "adamleebartlett@gmail.com", phone: null,
        city: "Los Angeles", state: "CA", status: "repeat-client", source: "referral", referredBy: "Surachai",
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "500", interestedColor: "Black", interestedServices: "full-package",
        estimatedValue: 6200, createdDate: "2025-06-15", lastContactDate: "2026-02-01", nextFollowUp: null, closedDate: "2025-10-03",
        notes: "Lead from Surachai, stopped responding to emails sent last follow up 06/27. New message about discounts 10/03. Booked ONX-2026-001.",
        lastCommunication: "Job delivered 02/01 — signed by A. Bartlett",
        communicationLog: [
          { date: "2025-06-15", type: "email", summary: "Initial outreach via Surachai intro" },
          { date: "2025-06-27", type: "email", summary: "Follow up — no response" },
          { date: "2025-10-03", type: "email", summary: "Sent message about discounts" },
          { date: "2025-10-15", type: "call", summary: "Confirmed job, 500 black 12\" 180g" },
          { date: "2026-02-01", type: "email", summary: "Job delivered, sent thank you" },
        ],
        linkedJobIds: "ONX-2026-001", websiteUrl: null, instagramHandle: null, tags: "band-direct,indie"
      },
      {
        contactName: "Carrington Bornstien", companyName: null, email: null, phone: null,
        city: "Brooklyn", state: "NY", status: "repeat-client", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "300", interestedColor: "Black", interestedServices: "full-package",
        estimatedValue: 5800, createdDate: "2025-11-01", lastContactDate: "2026-03-05", nextFollowUp: "2026-03-20", closedDate: "2025-12-01",
        notes: "Handle with care — special gatefold. Shipped 03/15, in transit to Brooklyn.",
        lastCommunication: "Shipment tracking shared — FedEx 2Day to Brooklyn",
        communicationLog: [
          { date: "2025-11-01", type: "email", summary: "Website inquiry for gatefold LP" },
          { date: "2025-12-01", type: "email", summary: "Confirmed order, deposit received" },
          { date: "2026-03-05", type: "email", summary: "Shipped final run, tracking sent" },
        ],
        linkedJobIds: "ONX-2026-002", websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Puscifer Entertainment", companyName: "Puscifer Entertainment", email: null, phone: null,
        city: null, state: null, status: "won", source: "referral", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "1000", interestedColor: "Clear w/ Red Splatter", interestedServices: "pressing-only",
        estimatedValue: 12500, createdDate: "2025-12-01", lastContactDate: "2026-03-15", nextFollowUp: "2026-03-25", closedDate: "2026-01-10",
        notes: "Splatter pattern per client mockup. No regrind. Color match critical. Currently in production.",
        lastCommunication: "Production update — 847 cycles complete, looking good",
        communicationLog: [
          { date: "2025-12-01", type: "email", summary: "Initial inquiry for clear/red splatter" },
          { date: "2026-01-10", type: "email", summary: "Job confirmed, 75% deposit received" },
          { date: "2026-03-15", type: "email", summary: "Production started — sent progress update" },
        ],
        linkedJobIds: "ONX-2026-003", websiteUrl: null, instagramHandle: null, tags: "major,label"
      },
      {
        contactName: "Skanking Forces", companyName: "Skanking Forces", email: null, phone: null,
        city: null, state: null, status: "won", source: "word-of-mouth", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '7"', interestedQuantity: "500", interestedColor: "Black", interestedServices: "full-package",
        estimatedValue: 3500, createdDate: "2025-09-01", lastContactDate: "2026-02-20", nextFollowUp: null, closedDate: "2025-11-01",
        notes: "Confirmed. Job in prepress.",
        lastCommunication: "Prepress files received, in review",
        communicationLog: [
          { date: "2025-09-01", type: "email", summary: "Initial contact" },
          { date: "2025-11-01", type: "email", summary: "Confirmed order" },
          { date: "2026-02-20", type: "email", summary: "Prepress files submitted" },
        ],
        linkedJobIds: "ONX-2026-006", websiteUrl: null, instagramHandle: null, tags: "band-direct"
      },
      // --- ACTIVE LEADS FROM MOE'S NOTES ---
      {
        contactName: "David Celia", companyName: "F-Spot Records", email: "fspotrecords@gmail.com", phone: null,
        city: null, state: null, status: "negotiating", source: "returning", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "300-500", interestedColor: null, interestedServices: "pressing-only",
        estimatedValue: 4500, createdDate: "2025-11-15", lastContactDate: "2026-02-28", nextFollowUp: "2026-03-20", closedDate: null,
        notes: "Requested new stampers, pushing him to repress. Has pressed with us before.",
        lastCommunication: "Sent repress pricing and new stamper options",
        communicationLog: [
          { date: "2025-11-15", type: "email", summary: "Reached out about repressing" },
          { date: "2026-02-28", type: "email", summary: "Sent repress pricing, pushing for commitment" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "label,returning"
      },
      {
        contactName: "Kimmi Bitter", companyName: null, email: "kimmibitter@gmail.com", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "500-1000", interestedColor: null, interestedServices: null,
        estimatedValue: 6000, createdDate: "2026-01-10", lastContactDate: "2026-01-15", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Wants 500 and 1000 quantity quotes.",
        lastCommunication: "Sent pricing for both quantities",
        communicationLog: [
          { date: "2026-01-10", type: "email", summary: "Website inquiry — wants 500 and 1000 qty quotes" },
          { date: "2026-01-15", type: "email", summary: "Sent pricing breakdown" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Signal", companyName: "New Palm Club", email: "signal@newpalm.club", phone: null,
        city: null, state: null, status: "contacted", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: null, interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: null, createdDate: "2025-12-01", lastContactDate: "2026-01-20", nextFollowUp: "2026-03-25", closedDate: null,
        notes: "Wants a new job. Said will get back to me. Follow up again.",
        lastCommunication: "Said will get back to me — no response yet",
        communicationLog: [
          { date: "2025-12-01", type: "email", summary: "Initial inquiry — wants new job" },
          { date: "2026-01-20", type: "email", summary: "Follow up — says will get back" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Brett", companyName: null, email: "bamcstarr@gmail.com", phone: null,
        city: null, state: null, status: "new-lead", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "low",
        interestedFormat: '12"', interestedQuantity: "100", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 1800, createdDate: "2026-01-20", lastContactDate: "2026-01-20", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Wants to crowd fund 100 records. Small run — may not be viable.",
        lastCommunication: "Initial inquiry — crowdfunding approach",
        communicationLog: [
          { date: "2026-01-20", type: "email", summary: "Wants to crowdfund 100 records" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "band-direct"
      },
      {
        contactName: "Matt Miller", companyName: "TXDXE", email: "mattmiller@txdxe.com", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "100-500", interestedColor: null, interestedServices: null,
        estimatedValue: 3500, createdDate: "2025-11-01", lastContactDate: "2026-01-29", nextFollowUp: "2026-03-20", closedDate: null,
        notes: "Waiting for funds. Asked for 100, 200, 500 unit pricing on 01/29.",
        lastCommunication: "Sent 100/200/500 unit pricing breakdown",
        communicationLog: [
          { date: "2025-11-01", type: "email", summary: "Initial contact — waiting for funds" },
          { date: "2026-01-29", type: "email", summary: "Asked for 100/200/500 unit pricing" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Naika", companyName: "Trio ADV", email: "naika@trioadv.com", phone: null,
        city: null, state: null, status: "new-lead", source: "instagram", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: null, interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: null, createdDate: "2026-02-01", lastContactDate: "2026-02-01", nextFollowUp: "2026-03-19", closedDate: null,
        notes: "Client that came in from Instagram. Need to follow up for details.",
        lastCommunication: "Instagram DM inquiry",
        communicationLog: [
          { date: "2026-02-01", type: "social", summary: "Came in from Instagram" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Johnathan Snipes", companyName: null, email: "dbombarc@gmail.com", phone: null,
        city: null, state: null, status: "contacted", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: null, interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: null, createdDate: "2025-12-15", lastContactDate: "2025-12-15", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Reached out — awaiting details on what he needs.",
        lastCommunication: "Initial outreach sent",
        communicationLog: [
          { date: "2025-12-15", type: "email", summary: "Initial outreach" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Tommy Simpson", companyName: "Macro Micro", email: "tommy.simpson@macromicro.us", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "500", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 8500, createdDate: "2026-01-05", lastContactDate: "2026-01-10", nextFollowUp: "2026-03-19", closedDate: null,
        notes: "500 double pack — came in from website. Works with New Vinyl Press. Big potential.",
        lastCommunication: "Sent estimate for 500-unit double pack",
        communicationLog: [
          { date: "2026-01-05", type: "email", summary: "Website inquiry — 500 double pack" },
          { date: "2026-01-10", type: "email", summary: "Sent detailed estimate" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "label"
      },
      {
        contactName: "Jim Owen", companyName: null, email: "JimOwen@protonmail.com", phone: null,
        city: null, state: null, status: "won", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "300", interestedColor: null, interestedServices: null,
        estimatedValue: 4200, createdDate: "2025-10-15", lastContactDate: "2026-01-05", nextFollowUp: null, closedDate: "2026-01-05",
        notes: "CONFIRMED. Website request for 300 records.",
        lastCommunication: "Order confirmed and deposit received",
        communicationLog: [
          { date: "2025-10-15", type: "email", summary: "Website request for 300 records" },
          { date: "2026-01-05", type: "email", summary: "Confirmed sale" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Stereo Kitchen", companyName: null, email: "Stereokitchen1@gmail.com", phone: null,
        city: null, state: null, status: "lost", source: "referral", referredBy: "Gil",
        assignedTo: "Moe", priority: "low",
        interestedFormat: null, interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: null, createdDate: "2025-09-01", lastContactDate: "2025-10-01", nextFollowUp: null, closedDate: "2025-11-01",
        notes: "Lead from Gil. Requested details. NO RESPONSE — went cold.",
        lastCommunication: "Sent details — no response",
        communicationLog: [
          { date: "2025-09-01", type: "email", summary: "Lead from Gil, requested details" },
          { date: "2025-10-01", type: "email", summary: "Follow up — no response" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Jesse Draxler", companyName: null, email: "jessedraxler@gmail.com", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "500", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 8500, createdDate: "2026-01-15", lastContactDate: "2026-01-20", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Wants double pack — sent him numbers. Waiting for decision.",
        lastCommunication: "Sent double pack estimate",
        communicationLog: [
          { date: "2026-01-15", type: "email", summary: "Inquiry for double pack" },
          { date: "2026-01-20", type: "email", summary: "Sent pricing for double pack" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "DJ John Brooklyn", companyName: null, email: "djjohnbrooklyn@gmail.com", phone: null,
        city: "Brooklyn", state: "NY", status: "won", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 3800, createdDate: "2025-11-01", lastContactDate: "2026-01-10", nextFollowUp: null, closedDate: "2026-01-10",
        notes: "Confirmed sale.",
        lastCommunication: "Sale confirmed, deposit collected",
        communicationLog: [
          { date: "2025-11-01", type: "email", summary: "Initial inquiry" },
          { date: "2026-01-10", type: "email", summary: "Confirmed sale" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "band-direct"
      },
      {
        contactName: "Marc", companyName: "Ipecac Recordings", email: "marc@ipecac.com", phone: null,
        city: null, state: null, status: "contacted", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "2000+", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 24000, createdDate: "2025-10-01", lastContactDate: "2026-01-15", nextFollowUp: "2026-06-01", closedDate: null,
        notes: "Was looking for large numbers but won't be ready until 6 months. Major label — huge potential. Follow up in June.",
        lastCommunication: "Touched base — still 6 months out",
        communicationLog: [
          { date: "2025-10-01", type: "email", summary: "Initial contact — large qty interest" },
          { date: "2026-01-15", type: "email", summary: "Follow up — not ready for 6 months" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "major,label"
      },
      {
        contactName: "Alanna Kagawa", companyName: null, email: "alannakagawa@pm.me", phone: null,
        city: null, state: null, status: "won", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 3200, createdDate: "2025-09-15", lastContactDate: "2025-12-01", nextFollowUp: null, closedDate: "2025-12-01",
        notes: "DEAL CLOSED.",
        lastCommunication: "Deal closed",
        communicationLog: [
          { date: "2025-09-15", type: "email", summary: "Initial inquiry" },
          { date: "2025-12-01", type: "email", summary: "Deal closed" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Auragraph", companyName: null, email: "auragraphh@gmail.com", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "300-1000", interestedColor: null, interestedServices: null,
        estimatedValue: 5500, createdDate: "2026-01-05", lastContactDate: "2026-01-10", nextFollowUp: "2026-03-20", closedDate: null,
        notes: "Asked for quotes on 300, 500, 1000. Need to follow up.",
        lastCommunication: "Sent tiered pricing for 300/500/1000",
        communicationLog: [
          { date: "2026-01-05", type: "email", summary: "Asked for quotes on 300, 500, 1000" },
          { date: "2026-01-10", type: "email", summary: "Sent pricing for all three tiers" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Shannon Lay", companyName: null, email: "Shannonlaymusic@gmail.com", phone: null,
        city: null, state: "CA", status: "contacted", source: "word-of-mouth", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 4000, createdDate: "2025-11-01", lastContactDate: "2025-11-15", nextFollowUp: "2026-03-19", closedDate: null,
        notes: "Came in for a tour, wants to use us but will not be ready until March. It's March now — TIME TO FOLLOW UP.",
        lastCommunication: "Toured facility — said March timeframe",
        communicationLog: [
          { date: "2025-11-01", type: "in-person", summary: "Came in for a tour" },
          { date: "2025-11-15", type: "email", summary: "Follow up after tour — not ready until March" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "band-direct,indie"
      },
      {
        contactName: "Sasha Berliner", companyName: null, email: "sasha.v.berliner@gmail.com", phone: null,
        city: null, state: null, status: "lost", source: "returning", referredBy: null,
        assignedTo: "Moe", priority: "low",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: "pressing-only",
        estimatedValue: 3500, createdDate: "2025-10-01", lastContactDate: "2025-11-01", nextFollowUp: null, closedDate: "2025-11-01",
        notes: "Sasha Berliner repress — sent her estimate. Declined.",
        lastCommunication: "Declined estimate — lost",
        communicationLog: [
          { date: "2025-10-01", type: "email", summary: "Repress inquiry" },
          { date: "2025-10-15", type: "email", summary: "Sent estimate" },
          { date: "2025-11-01", type: "email", summary: "Declined" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "band-direct"
      },
      {
        contactName: "Gavin Gamboa", companyName: null, email: "gavin.gamboa@gmail.com", phone: null,
        city: null, state: null, status: "quoting", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "500-1000", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 9000, createdDate: "2025-11-07", lastContactDate: "2025-11-07", nextFollowUp: "2026-03-19", closedDate: null,
        notes: "Is doing an Erykah Badu record. Big name — high priority follow up.",
        lastCommunication: "Initial discussion about Badu project",
        communicationLog: [
          { date: "2025-11-07", type: "email", summary: "Discussed Erykah Badu record project" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "major,label"
      },
      {
        contactName: "Tash", companyName: "I Like Alice", email: "tash@ilikealice.com", phone: null,
        city: null, state: null, status: "quoting", source: "referral", referredBy: "John Giovanazzi",
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "2 LPs", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 7000, createdDate: "2025-09-15", lastContactDate: "2025-10-01", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Reference from John Giovanazzi. Wants to press 2 LPs for upcoming tour.",
        lastCommunication: "Sent estimate for 2 LP run",
        communicationLog: [
          { date: "2025-09-15", type: "email", summary: "Referred by John Giovanazzi — 2 LP tour press" },
          { date: "2025-10-01", type: "email", summary: "Sent estimate" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "band-direct,indie"
      },
      {
        contactName: "Jayson", companyName: "Scarlet Moon", email: "jayson@scarletmoon.com", phone: null,
        city: null, state: null, status: "negotiating", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "TBD", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 15000, createdDate: "2025-09-01", lastContactDate: "2025-09-15", nextFollowUp: "2026-03-19", closedDate: null,
        notes: "Gaming company soundtracks — trying to schedule a meeting. Could be recurring business.",
        lastCommunication: "Trying to schedule meeting — no confirm yet",
        communicationLog: [
          { date: "2025-09-01", type: "email", summary: "Initial outreach — gaming soundtracks" },
          { date: "2025-09-15", type: "email", summary: "Trying to schedule meeting" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "label,gaming"
      },
      {
        contactName: "Sam Hirschfelder", companyName: "Mataderos Projects", email: "sam.hirschfelder@mataderosprojects.com", phone: null,
        city: null, state: null, status: "contacted", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "1000+", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 12000, createdDate: "2025-06-01", lastContactDate: "2025-06-27", nextFollowUp: "2026-03-25", closedDate: null,
        notes: "Purity Ring record — big job. They dragging their feet. Sent follow up about price changes 06/27. Band got signed to a label and the label will reach out when they can.",
        lastCommunication: "Band signed to label — waiting for label to reach out",
        communicationLog: [
          { date: "2025-06-01", type: "email", summary: "Purity Ring pressing inquiry" },
          { date: "2025-06-27", type: "email", summary: "Follow up about price changes" },
          { date: "2025-06-27", type: "email", summary: "Band signed to label — label will reach out" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "major,label"
      },
      {
        contactName: "Roc Nation", companyName: "Roc Nation", email: "mchen@rocnation.com", phone: null,
        city: null, state: null, status: "negotiating", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 25000, createdDate: "2025-06-01", lastContactDate: "2025-06-27", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Sent an email to keep in touch 06/27. Have generated multiple invoices and they are discussing. MAJOR LABEL — stay on this.",
        lastCommunication: "Generated invoices — they are discussing internally",
        communicationLog: [
          { date: "2025-06-01", type: "email", summary: "Initial outreach to Roc Nation" },
          { date: "2025-06-27", type: "email", summary: "Keep in touch email" },
          { date: "2025-06-27", type: "email", summary: "Multiple invoices generated, discussing" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "major,label"
      },
      {
        contactName: "Lowleaf", companyName: null, email: "lowleaf@gmail.com", phone: "323-505-5931",
        city: "Los Angeles", state: "CA", status: "negotiating", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 4000, createdDate: "2025-10-01", lastContactDate: "2025-10-15", nextFollowUp: "2026-03-20", closedDate: null,
        notes: "I spoke to her and she's excited to move forward. Phone: 323-505-5931.",
        lastCommunication: "Phone call — excited to move forward",
        communicationLog: [
          { date: "2025-10-01", type: "email", summary: "Initial inquiry" },
          { date: "2025-10-15", type: "call", summary: "Spoke on phone — excited to move forward" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "band-direct,indie"
      },
      {
        contactName: "Eric Joseph Carlson", companyName: null, email: "ericjosephcarlson@gmail.com", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "1000", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 9500, createdDate: "2025-10-01", lastContactDate: "2025-10-15", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Wants a quote for 1000 records but I asked for details on jackets. Need jacket specs to finalize quote.",
        lastCommunication: "Asked for jacket details — awaiting response",
        communicationLog: [
          { date: "2025-10-01", type: "email", summary: "Wants quote for 1000 records" },
          { date: "2025-10-15", type: "email", summary: "Asked for jacket details" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Bryan Scary", companyName: null, email: "bryanscary@gmail.com", phone: null,
        city: null, state: null, status: "negotiating", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "hot",
        interestedFormat: '12"', interestedQuantity: "multiple", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 10000, createdDate: "2025-10-15", lastContactDate: "2025-10-20", nextFollowUp: "2026-03-19", closedDate: null,
        notes: "Setting up a Zoom call — has lots of vinyl needs. Could be a big recurring client.",
        lastCommunication: "Setting up Zoom call",
        communicationLog: [
          { date: "2025-10-15", type: "email", summary: "Initial contact — lots of vinyl needs" },
          { date: "2025-10-20", type: "email", summary: "Setting up Zoom call" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Samantha", companyName: "Prajin Parlay", email: "Samantha@prajinparlay.com", phone: null,
        city: null, state: null, status: "contacted", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: null, interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: null, createdDate: "2026-01-10", lastContactDate: "2026-01-10", nextFollowUp: "2026-03-20", closedDate: null,
        notes: "Said she would call me. No call yet — follow up.",
        lastCommunication: "Said she would call — no call yet",
        communicationLog: [
          { date: "2026-01-10", type: "email", summary: "Said she would call" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "label"
      },
      {
        contactName: "Fredwreck", companyName: null, email: "fredwreckla@hotmail.com", phone: null,
        city: "Los Angeles", state: "CA", status: "contacted", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: null, interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 5000, createdDate: "2025-11-07", lastContactDate: "2025-11-07", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Follow up. 11/7.",
        lastCommunication: "Initial outreach",
        communicationLog: [
          { date: "2025-11-07", type: "email", summary: "Follow up email sent" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Joshua Zucker-Pluda", companyName: null, email: "joshua.zucker.pluda@gmail.com", phone: null,
        city: null, state: null, status: "contacted", source: "referral", referredBy: "Surachai",
        assignedTo: "Moe", priority: "normal",
        interestedFormat: null, interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: null, createdDate: "2025-10-01", lastContactDate: "2025-10-01", nextFollowUp: "2026-03-25", closedDate: null,
        notes: "Friend of Surachai. Need to follow up for project details.",
        lastCommunication: "Initial intro via Surachai",
        communicationLog: [
          { date: "2025-10-01", type: "email", summary: "Intro from Surachai" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Andrew Ortmann", companyName: null, email: "andrew.lord.ortmann@gmail.com", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: "300", interestedColor: null, interestedServices: "full-package",
        estimatedValue: 5500, createdDate: "2025-09-01", lastContactDate: "2025-10-03", nextFollowUp: "2026-03-25", closedDate: null,
        notes: "Wants 300 gatefolds. Sent an email requesting an estimate.",
        lastCommunication: "Sent gatefold estimate",
        communicationLog: [
          { date: "2025-09-01", type: "email", summary: "Wants 300 gatefolds" },
          { date: "2025-10-03", type: "email", summary: "Sent estimate" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "DJ Holland Aze", companyName: null, email: "djhollandaze@gmail.com", phone: null,
        city: null, state: null, status: "quoting", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: "pressing-only",
        estimatedValue: 3000, createdDate: "2025-12-01", lastContactDate: "2025-12-10", nextFollowUp: "2026-03-22", closedDate: null,
        notes: "Wants to do a scratch record. Sent numbers.",
        lastCommunication: "Sent scratch record pricing",
        communicationLog: [
          { date: "2025-12-01", type: "email", summary: "Wants scratch record" },
          { date: "2025-12-10", type: "email", summary: "Sent numbers" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "band-direct"
      },
      {
        contactName: "Kontravoid", companyName: null, email: "kontravoid@gmail.com", phone: null,
        city: null, state: null, status: "contacted", source: "website", referredBy: null,
        assignedTo: "Moe", priority: "low",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 4000, createdDate: "2025-10-01", lastContactDate: "2025-10-06", nextFollowUp: "2026-04-01", closedDate: null,
        notes: "Wants to hold on an order for a few months.",
        lastCommunication: "Wants to hold — follow up later",
        communicationLog: [
          { date: "2025-10-01", type: "email", summary: "Initial inquiry" },
          { date: "2025-10-06", type: "email", summary: "Wants to hold for a few months" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "indie"
      },
      {
        contactName: "Lemak", companyName: "Austin Label", email: "lemak91@mac.com", phone: null,
        city: "Austin", state: "TX", status: "contacted", source: "cold-call", referredBy: null,
        assignedTo: "Moe", priority: "normal",
        interestedFormat: '12"', interestedQuantity: null, interestedColor: null, interestedServices: null,
        estimatedValue: 6000, createdDate: "2025-10-01", lastContactDate: "2025-10-06", nextFollowUp: "2026-03-25", closedDate: null,
        notes: "Owns a label in Austin. He's stuck in a distro contract but really wants to work with us. Follow up when contract may be ending.",
        lastCommunication: "Stuck in distro contract — wants to work with us",
        communicationLog: [
          { date: "2025-10-01", type: "email", summary: "Owns Austin label, stuck in distro contract" },
          { date: "2025-10-06", type: "email", summary: "Really wants to work with us when free" },
        ],
        linkedJobIds: null, websiteUrl: null, instagramHandle: null, tags: "label,distro"
      },
    ];
    for (const l of leadsData) {
      const id = this.getNextId();
      this.leadsMap.set(id, { ...l, id } as Lead);
    }

    // === SEED VENDORS ===
    const vendorsData: InsertVendor[] = [
      { name: "RTI (Record Technology Inc.)", category: "plating", contactName: "Don MacInnis", contactEmail: "don@recordtech.com", contactPhone: "(805) 484-2747", website: "recordtech.com", address: "486 Dawson Dr, Camarillo, CA 93012", status: "active", paymentTerms: "net-30", accountNumber: "RTI-ORP-2024", notes: "Primary plating house. 3-day turnaround on stampers. Handles lacquer & DMM. Don is direct contact for rush orders.", productsServices: "Lacquer plating, stamper production, DMM cutting, quality inspection", lastOrderDate: "2026-03-10", totalSpendYTD: 14400, rating: 5, tags: "plating,critical,primary" },
      { name: "Pheenix Alpha AB", category: "equipment", contactName: "Sales Dept", contactEmail: "info@pheenixalpha.com", contactPhone: "+46 8 555 123 45", website: "pheenixalpha.com", address: "Stockholm, Sweden", status: "active", paymentTerms: "net-60", accountNumber: "PA-ONYX-001", notes: "OEM for our AD12 press. Source for all spare parts — hydraulic seals, mould heaters, extruder tips, trimmer blades. Lead times 4-8 weeks for parts from Sweden.", productsServices: "AD12 press parts, hydraulic seals, mould heaters, temperature sensors, extruder screw tips, trimmer knife blades, dampers", lastOrderDate: "2025-09-15", totalSpendYTD: 0, rating: 4, tags: "equipment,spare-parts,OEM" },
      { name: "Archer Plastics", category: "materials", contactName: "Jeff Kim", contactEmail: "jeff@archerplastics.com", contactPhone: "(323) 555-0147", website: null, address: "Los Angeles, CA", status: "active", paymentTerms: "net-15", accountNumber: null, notes: "Virgin PVC supplier. Competitive pricing on black compound. Can do custom color compounds with 2-week lead time.", productsServices: "Virgin PVC compound (black & color), custom color matching, regrind-compatible blends", lastOrderDate: "2026-02-28", totalSpendYTD: 9800, rating: 4, tags: "vinyl,materials,primary" },
      { name: "Pacific Label Co.", category: "materials", contactName: "Michelle Tran", contactEmail: "michelle@pacificlabel.com", contactPhone: "(626) 555-0389", website: "pacificlabel.com", address: "Pasadena, CA", status: "active", paymentTerms: "net-30", accountNumber: "PLC-4421", notes: "Label printer for all jobs. 5-day turnaround standard, 2-day rush available at +40%. Handles center labels and stickers.", productsServices: "Vinyl record center labels, stickers, printed inserts, color-matching", lastOrderDate: "2026-03-05", totalSpendYTD: 7100, rating: 5, tags: "labels,printing,primary" },
      { name: "Stoughton Printing", category: "packaging", contactName: "Mark Stoughton", contactEmail: "mark@stoughtonprinting.com", contactPhone: "(608) 555-0221", website: "stoughtonprinting.com", address: "Stoughton, WI", status: "active", paymentTerms: "net-30", accountNumber: "SP-1892", notes: "Jacket & insert printer. Excellent quality on gatefolds. Standard 10-day turnaround. They ship direct to us.", productsServices: "Jackets, gatefolds, inner sleeves, inserts, shrinkwrap, die-cut shapes", lastOrderDate: "2026-02-20", totalSpendYTD: 12500, rating: 5, tags: "jackets,packaging,primary" },
      { name: "SoCal Gas Company", category: "utilities", contactName: "Commercial Acct", contactEmail: null, contactPhone: "(800) 427-2200", website: "socalgas.com", address: null, status: "active", paymentTerms: "net-15", accountNumber: "SCG-7721", notes: "Natural gas for boiler. Bills typically $2,800-$3,800/mo depending on production volume.", productsServices: "Natural gas utility", lastOrderDate: "2026-03-01", totalSpendYTD: 8500, rating: 3, tags: "utilities,gas" },
      { name: "SCE (So. Cal Edison)", category: "utilities", contactName: "Commercial Acct", contactEmail: null, contactPhone: "(800) 655-4555", website: "sce.com", address: null, status: "active", paymentTerms: "net-15", accountNumber: "SCE-9034", notes: "Electricity for press, chillers, compressors, HVAC. TOU plan — run heavy loads off-peak when possible.", productsServices: "Electricity utility", lastOrderDate: "2026-03-01", totalSpendYTD: 6200, rating: 3, tags: "utilities,electric" },
      { name: "FedEx", category: "logistics", contactName: "Acct Manager", contactEmail: null, contactPhone: "(800) 463-3339", website: "fedex.com", address: null, status: "active", paymentTerms: "net-15", accountNumber: "RecordMadness", notes: "Primary shipping carrier. Maria manages all shipments. YOUR REFERENCE field used for catalog/matrix numbers.", productsServices: "Ground, Express, Freight shipping", lastOrderDate: "2026-03-15", totalSpendYTD: 4800, rating: 4, tags: "shipping,logistics,primary" },
      { name: "UPS", category: "logistics", contactName: "Acct Manager", contactEmail: null, contactPhone: "(800) 742-5877", website: "ups.com", address: null, status: "active", paymentTerms: "net-15", accountNumber: "ORP-UPS-2024", notes: "Secondary carrier. Used for oversize/pallet shipments and some client preferences.", productsServices: "Ground, 2nd Day Air, Freight", lastOrderDate: "2026-02-10", totalSpendYTD: 1200, rating: 4, tags: "shipping,logistics" },
      { name: "Dave's Mastering", category: "mastering", contactName: "Dave McNair", contactEmail: "dave@davesmastering.com", contactPhone: "(434) 555-0312", website: "davesmastering.com", address: "Charlottesville, VA", status: "active", paymentTerms: "cod", accountNumber: null, notes: "Lacquer cutting. Great ears, fast turnaround. Handles most of our indie clients. Charges per-side.", productsServices: "Lacquer cutting, mastering for vinyl, audio QC", lastOrderDate: "2026-03-08", totalSpendYTD: 9700, rating: 5, tags: "mastering,cutting,primary" },
      { name: "Infrasonic Mastering", category: "mastering", contactName: "Pete Lyman", contactEmail: "pete@infrasonicmastering.com", contactPhone: "(615) 555-0198", website: "infrasonicmastering.com", address: "Nashville, TN", status: "active", paymentTerms: "cod", accountNumber: null, notes: "Backup cutting house. Premium quality. Handles major label overflow and critical releases.", productsServices: "Lacquer cutting, half-speed mastering, DMM", lastOrderDate: "2026-01-20", totalSpendYTD: 3200, rating: 5, tags: "mastering,cutting" },
      { name: "Belu Media Group", category: "materials", contactName: "Belu Team", contactEmail: "info@belumedia.com", contactPhone: "(323) 555-0277", website: "belumedia.com", address: "Los Angeles, CA", status: "active", paymentTerms: "net-30", accountNumber: "BMG-ORP", notes: "Partner press facility. Some jobs outsourced to Belu. Also a source for specialty vinyl compounds.", productsServices: "Vinyl pressing (outsource), specialty compounds, picture disc materials", lastOrderDate: "2026-02-15", totalSpendYTD: 5400, rating: 3, tags: "pressing,outsource,partner" },
      { name: "PLC Controls & Consulting", category: "consulting", contactName: "Gary Chen", contactEmail: "gary@plccontrols.com", contactPhone: "(626) 555-0445", website: null, address: "Arcadia, CA", status: "active", paymentTerms: "net-30", accountNumber: null, notes: "PLC programmer for press automation. Did initial integration. Available for troubleshooting at $150/hr.", productsServices: "PLC programming, press automation, sensor integration, troubleshooting", lastOrderDate: "2026-01-15", totalSpendYTD: 1247, rating: 4, tags: "consulting,automation" },
      { name: "American Chiller Services", category: "equipment", contactName: "Tony Martinez", contactEmail: "tony@amchillersvcs.com", contactPhone: "(818) 555-0633", website: null, address: "Burbank, CA", status: "active", paymentTerms: "net-30", accountNumber: null, notes: "Chiller maintenance and repair. Semi-annual service contract. Emergency response within 4 hours.", productsServices: "Chiller maintenance, repair, coolant, emergency service", lastOrderDate: "2026-02-01", totalSpendYTD: 3200, rating: 4, tags: "equipment,maintenance,chiller" },
    ];
    for (const v of vendorsData) {
      const id = this.getNextId();
      this.vendorsMap.set(id, { ...v, id } as Vendor);
    }

    // === SEED PRESS LOGS ===
    const pressLogsData: InsertPressLog[] = [
      {
        shiftDate: "2026-03-15", operatorName: "Press Op 1", shiftNumber: 1,
        pressStartTime: "08:00", pressStopTime: null, totalRuntimeMinutes: null,
        jobId: "ONX-2026-003", clientName: "Puscifer Entertainment", format: '12"', weight: "180g",
        vinylColor: "Clear w/ Red Splatter", colorBlend: "80% clear / 20% red pellet mix, random splatter", regrindPercent: "0%",
        goodCount: 847, rejectCount: 12, testPressCount: 5, totalCycles: 864,
        extruderTemp: 335, mouldTempTop: 310, mouldTempBottom: 305, clampPressurePSI: 2200,
        clampTimeSec: 6.5, coolingTimeSec: 9.0, cycleTimeSec: 22.5, trimmerSetting: "Position 3 — standard 12\"",
        extruderRPM: 28, biscuitWeightGrams: 182,
        ambientTempF: 72.4, humidityPercent: 44, chillerTempIn: 54, chillerTempOut: 62,
        hydraulicOilTempF: 118, waterPressurePSI: 42, steamPressurePSI: 65,
        vinylUsedLbs: 320, regrindUsedLbs: 0, labelsUsed: 1720,
        stoppages: [
          { time: "10:22", durationMin: 8, reason: "Label magazine jam — cleared and re-loaded", code: "DT-09" },
          { time: "14:15", durationMin: 5, reason: "Trimmer alignment check", code: "DT-07" }
        ],
        totalDowntimeMinutes: 13,
        rejectReasons: [
          { reason: "Non-fill", count: 5 },
          { reason: "Off-center label", count: 4 },
          { reason: "Flash", count: 3 }
        ],
        qualityNotes: "Splatter pattern looking consistent after first 50 cycles. Slight non-fill at startup — resolved after temp stabilized.",
        maintenanceFlags: [
          { component: "Label Magazine", severity: "low", description: "Spring tension loosening — schedule check" }
        ],
        shiftNotes: "Running Puscifer clear/red splatter. Extended heat cycle for clear compound. Color pattern approved by Moe at 09:15. Steady run after initial startup adjustments.",
        nextShiftHandoff: "Press is warm and running. ~153 units remaining on this order. Labels pre-loaded for Side A/B.",
        stamperIdA: "PUS-2026-A-001", stamperIdB: "PUS-2026-B-001", stamperCondition: "good"
      },
      {
        shiftDate: "2026-03-14", operatorName: "Press Op 1", shiftNumber: 1,
        pressStartTime: "07:30", pressStopTime: "16:00", totalRuntimeMinutes: 480,
        jobId: "ONX-2026-003", clientName: "Puscifer Entertainment", format: '12"', weight: "180g",
        vinylColor: "Clear w/ Red Splatter", colorBlend: "80% clear / 20% red pellet mix, random splatter", regrindPercent: "0%",
        goodCount: 520, rejectCount: 8, testPressCount: 0, totalCycles: 528,
        extruderTemp: 335, mouldTempTop: 310, mouldTempBottom: 305, clampPressurePSI: 2200,
        clampTimeSec: 6.5, coolingTimeSec: 9.0, cycleTimeSec: 22.5, trimmerSetting: "Position 3 — standard 12\"",
        extruderRPM: 28, biscuitWeightGrams: 182,
        ambientTempF: 71.8, humidityPercent: 42, chillerTempIn: 53, chillerTempOut: 61,
        hydraulicOilTempF: 116, waterPressurePSI: 43, steamPressurePSI: 65,
        vinylUsedLbs: 196, regrindUsedLbs: 0, labelsUsed: 1056,
        stoppages: [
          { time: "11:40", durationMin: 12, reason: "Color blend pellet hopper low — refilled", code: "DT-03" }
        ],
        totalDowntimeMinutes: 12,
        rejectReasons: [
          { reason: "Non-fill", count: 3 },
          { reason: "Warp", count: 3 },
          { reason: "Flash", count: 2 }
        ],
        qualityNotes: "Good run. Warp rate slightly high early — adjusted cooling time from 8.5 to 9.0 sec, resolved.",
        maintenanceFlags: [],
        shiftNotes: "Continued Puscifer run from yesterday. Adjusted cooling time mid-shift. Splatter pattern consistent.",
        nextShiftHandoff: "~153 remaining. Press shut down clean. Moulds at temp, ready for morning restart.",
        stamperIdA: "PUS-2026-A-001", stamperIdB: "PUS-2026-B-001", stamperCondition: "good"
      },
      {
        shiftDate: "2026-03-10", operatorName: "Press Op 1", shiftNumber: 1,
        pressStartTime: "07:30", pressStopTime: "15:00", totalRuntimeMinutes: 428,
        jobId: "ONX-2026-004", clientName: "Kanebell Enterprises", format: '12"', weight: "140g",
        vinylColor: "Black", colorBlend: null, regrindPercent: "50%",
        goodCount: 208, rejectCount: 5, testPressCount: 3, totalCycles: 216,
        extruderTemp: 330, mouldTempTop: 305, mouldTempBottom: 300, clampPressurePSI: 2200,
        clampTimeSec: 6.5, coolingTimeSec: 9.0, cycleTimeSec: 21.0, trimmerSetting: "Position 3 — standard 12\"",
        extruderRPM: 26, biscuitWeightGrams: 148,
        ambientTempF: 71.8, humidityPercent: 42, chillerTempIn: 53, chillerTempOut: 61,
        hydraulicOilTempF: 115, waterPressurePSI: 41, steamPressurePSI: 65,
        vinylUsedLbs: 34, regrindUsedLbs: 34, labelsUsed: 432,
        stoppages: [
          { time: "09:45", durationMin: 15, reason: "Trimmer knife dull — swapped blade", code: "DT-07" },
          { time: "13:10", durationMin: 7, reason: "Hydraulic pressure fluctuation — stabilized", code: "DT-02" }
        ],
        totalDowntimeMinutes: 22,
        rejectReasons: [
          { reason: "Flash", count: 3 },
          { reason: "Off-center label", count: 2 }
        ],
        qualityNotes: "50% regrind blend successful. No audible quality issues on test press. Flash mostly at startup.",
        maintenanceFlags: [
          { component: "Trimmer Knife", severity: "medium", description: "Blade dulling faster than expected — check alignment" }
        ],
        shiftNotes: "Kanebell 140g black with 50% regrind. Regrind blend mixed well. Had to swap trimmer blade mid-shift. Hydraulic hiccup around 1pm but stabilized.",
        nextShiftHandoff: "Job complete. Press shut down. Moulds need cleaning before next color change.",
        stamperIdA: "KNB-007-A-001", stamperIdB: "KNB-007-B-001", stamperCondition: "good"
      },
      {
        shiftDate: "2026-03-08", operatorName: "Press Op 1", shiftNumber: 1,
        pressStartTime: "08:00", pressStopTime: "14:30", totalRuntimeMinutes: 380,
        jobId: "ONX-2026-008", clientName: "Scott Van Orden", format: '12"', weight: "140g",
        vinylColor: "Black", colorBlend: null, regrindPercent: "50%",
        goodCount: 205, rejectCount: 3, testPressCount: 2, totalCycles: 210,
        extruderTemp: 330, mouldTempTop: 305, mouldTempBottom: 300, clampPressurePSI: 2200,
        clampTimeSec: 6.5, coolingTimeSec: 9.0, cycleTimeSec: 21.0, trimmerSetting: "Position 3 — standard 12\"",
        extruderRPM: 26, biscuitWeightGrams: 148,
        ambientTempF: 73.1, humidityPercent: 45, chillerTempIn: 55, chillerTempOut: 63,
        hydraulicOilTempF: 116, waterPressurePSI: 42, steamPressurePSI: 64,
        vinylUsedLbs: 33, regrindUsedLbs: 32, labelsUsed: 420,
        stoppages: [
          { time: "10:50", durationMin: 10, reason: "Biscuit weight check — recalibrated", code: "DT-04" }
        ],
        totalDowntimeMinutes: 10,
        rejectReasons: [
          { reason: "Non-fill", count: 2 },
          { reason: "Surface blemish", count: 1 }
        ],
        qualityNotes: "Clean run. Test presses sounded great. Minor surface blemish on one disc — likely contamination in regrind batch.",
        maintenanceFlags: [],
        shiftNotes: "Standard black 140g for Scott Van Orden. 50% regrind mix. Smooth run, only stopped once for biscuit weight recalibration.",
        nextShiftHandoff: "Job complete. 200 units to QC + packaging. Press clean, ready for next job.",
        stamperIdA: "SVO-004-A-001", stamperIdB: "SVO-004-B-001", stamperCondition: "good"
      },
      {
        shiftDate: "2026-03-13", operatorName: "Press Op 1", shiftNumber: 1,
        pressStartTime: "07:30", pressStopTime: "17:00", totalRuntimeMinutes: 540,
        jobId: "ONX-2026-003", clientName: "Puscifer Entertainment", format: '12"', weight: "180g",
        vinylColor: "Clear w/ Red Splatter", colorBlend: "80% clear / 20% red pellet mix, random splatter", regrindPercent: "0%",
        goodCount: 480, rejectCount: 15, testPressCount: 5, totalCycles: 500,
        extruderTemp: 335, mouldTempTop: 310, mouldTempBottom: 305, clampPressurePSI: 2200,
        clampTimeSec: 6.5, coolingTimeSec: 8.5, cycleTimeSec: 22.0, trimmerSetting: "Position 3 — standard 12\"",
        extruderRPM: 28, biscuitWeightGrams: 182,
        ambientTempF: 74.2, humidityPercent: 48, chillerTempIn: 55, chillerTempOut: 64,
        hydraulicOilTempF: 120, waterPressurePSI: 41, steamPressurePSI: 64,
        vinylUsedLbs: 185, regrindUsedLbs: 0, labelsUsed: 1010,
        stoppages: [
          { time: "09:00", durationMin: 20, reason: "Test press review with Moe — pattern approval", code: "DT-10" },
          { time: "12:30", durationMin: 5, reason: "Label stack reload", code: "DT-09" },
          { time: "15:45", durationMin: 10, reason: "Cooling time adjustment — warps at edge", code: "DT-06" }
        ],
        totalDowntimeMinutes: 35,
        rejectReasons: [
          { reason: "Warp", count: 7 },
          { reason: "Non-fill", count: 4 },
          { reason: "Splatter pattern uneven", count: 4 }
        ],
        qualityNotes: "First day on Puscifer job. Higher reject rate while dialing in splatter pattern. Cooling time was too short initially — increased from 8.5 to 9.0 to fix warps. Pattern approved by Moe after 5 test presses.",
        maintenanceFlags: [
          { component: "Hydraulic Oil", severity: "low", description: "Oil temp running high at 120F — monitor" }
        ],
        shiftNotes: "First shift on Puscifer clear/red splatter run. Spent extra time on test presses to get pattern right. Moe approved at 9:20am. Higher reject rate while tuning — settled down after cooling adjustment. Long shift to make up for downtime.",
        nextShiftHandoff: "Press running well after adjustments. Cooling now at 9.0s. ~520 units done, ~480 remaining.",
        stamperIdA: "PUS-2026-A-001", stamperIdB: "PUS-2026-B-001", stamperCondition: "good"
      },
      {
        shiftDate: "2026-03-06", operatorName: "Press Op 1", shiftNumber: 1,
        pressStartTime: "08:00", pressStopTime: "12:30", totalRuntimeMinutes: 260,
        jobId: "ONX-2026-001", clientName: "Adam Bartlett", format: '12"', weight: "180g",
        vinylColor: "Black", colorBlend: null, regrindPercent: "25%",
        goodCount: 165, rejectCount: 2, testPressCount: 0, totalCycles: 167,
        extruderTemp: 330, mouldTempTop: 305, mouldTempBottom: 300, clampPressurePSI: 2200,
        clampTimeSec: 6.5, coolingTimeSec: 9.0, cycleTimeSec: 22.0, trimmerSetting: "Position 3 — standard 12\"",
        extruderRPM: 27, biscuitWeightGrams: 180,
        ambientTempF: 70.5, humidityPercent: 40, chillerTempIn: 52, chillerTempOut: 60,
        hydraulicOilTempF: 112, waterPressurePSI: 43, steamPressurePSI: 66,
        vinylUsedLbs: 45, regrindUsedLbs: 15, labelsUsed: 334,
        stoppages: [],
        totalDowntimeMinutes: 0,
        rejectReasons: [
          { reason: "Non-fill", count: 2 }
        ],
        qualityNotes: "Final run for Bartlett order. Clean pressing, no issues.",
        maintenanceFlags: [],
        shiftNotes: "Final 165 units for Adam Bartlett order. Quick clean run — no stoppages. Job complete, ready for QC and packaging.",
        nextShiftHandoff: "Job done. Press available for next job setup.",
        stamperIdA: "ABR-001-A-001", stamperIdB: "ABR-001-B-001", stamperCondition: "wear-showing"
      },
    ];
    for (const pl of pressLogsData) {
      const id = this.getNextId();
      this.pressLogsMap.set(id, { ...pl, id } as PressLog);
    }
  }

  // Jobs
  async getJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }
  async getJob(id: number): Promise<Job | undefined> {
    return this.jobs.get(id);
  }
  async getJobsByStatus(status: string): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter(j => j.status === status);
  }
  async createJob(job: InsertJob): Promise<Job> {
    const id = this.getNextId();
    const newJob = { ...job, id } as Job;
    this.jobs.set(id, newJob);
    return newJob;
  }
  async updateJob(id: number, updates: Partial<InsertJob>): Promise<Job | undefined> {
    const existing = this.jobs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.jobs.set(id, updated);
    return updated;
  }

  // Production Runs
  async getProductionRuns(): Promise<ProductionRun[]> {
    return Array.from(this.productionRuns.values());
  }
  async getProductionRunsByJob(jobId: string): Promise<ProductionRun[]> {
    return Array.from(this.productionRuns.values()).filter(r => r.jobId === jobId);
  }
  async createProductionRun(run: InsertProductionRun): Promise<ProductionRun> {
    const id = this.getNextId();
    const newRun = { ...run, id } as ProductionRun;
    this.productionRuns.set(id, newRun);
    return newRun;
  }

  // Financials
  async getFinancials(): Promise<Financial[]> {
    return Array.from(this.financials.values()).sort((a, b) => a.period.localeCompare(b.period));
  }
  async getFinancialByPeriod(period: string): Promise<Financial | undefined> {
    return Array.from(this.financials.values()).find(f => f.period === period);
  }

  // Maintenance
  async getMaintenanceTasks(): Promise<MaintenanceTask[]> {
    return Array.from(this.maintenanceTasks.values());
  }
  async updateMaintenanceTask(id: number, updates: Partial<InsertMaintenanceTask>): Promise<MaintenanceTask | undefined> {
    const existing = this.maintenanceTasks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.maintenanceTasks.set(id, updated);
    return updated;
  }

  // Sensors
  async getSensorReadings(sensorType?: string, limit?: number): Promise<SensorReading[]> {
    let readings = Array.from(this.sensorReadings.values());
    if (sensorType) readings = readings.filter(r => r.sensorType === sensorType);
    readings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (limit) readings = readings.slice(-limit);
    return readings;
  }
  async createSensorReading(reading: InsertSensorReading): Promise<SensorReading> {
    const id = this.getNextId();
    const newReading = { ...reading, id } as SensorReading;
    this.sensorReadings.set(id, newReading);
    return newReading;
  }

  // Inventory
  async getInventory(): Promise<InventoryItem[]> {
    return Array.from(this.inventoryItems.values());
  }
  async updateInventoryItem(id: number, updates: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const existing = this.inventoryItems.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.inventoryItems.set(id, updated);
    return updated;
  }

  // AR Aging
  async getArAging(): Promise<ArAgingItem[]> {
    return Array.from(this.arAgingItems.values());
  }

  // Shipments
  async getShipments(): Promise<Shipment[]> {
    return Array.from(this.shipmentsMap.values());
  }
  async getShipmentsByJob(jobId: string): Promise<Shipment[]> {
    return Array.from(this.shipmentsMap.values()).filter(s => s.jobId === jobId);
  }

  // Leads
  async getLeads(): Promise<Lead[]> {
    return Array.from(this.leadsMap.values());
  }
  async getLead(id: number): Promise<Lead | undefined> {
    return this.leadsMap.get(id);
  }
  async createLead(lead: InsertLead): Promise<Lead> {
    const id = this.getNextId();
    const newLead = { ...lead, id } as Lead;
    this.leadsMap.set(id, newLead);
    return newLead;
  }
  async updateLead(id: number, updates: Partial<InsertLead>): Promise<Lead | undefined> {
    const existing = this.leadsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.leadsMap.set(id, updated);
    return updated;
  }

  // Vendors
  async getVendors(): Promise<Vendor[]> {
    return Array.from(this.vendorsMap.values());
  }
  async getVendor(id: number): Promise<Vendor | undefined> {
    return this.vendorsMap.get(id);
  }

  // Press Logs
  async getPressLogs(): Promise<PressLog[]> {
    return Array.from(this.pressLogsMap.values()).sort((a, b) => {
      const dateCompare = b.shiftDate.localeCompare(a.shiftDate);
      if (dateCompare !== 0) return dateCompare;
      return (b.shiftNumber ?? 1) - (a.shiftNumber ?? 1);
    });
  }
  async getPressLog(id: number): Promise<PressLog | undefined> {
    return this.pressLogsMap.get(id);
  }
  async createPressLog(log: InsertPressLog): Promise<PressLog> {
    const id = this.getNextId();
    const newLog = { ...log, id } as PressLog;
    this.pressLogsMap.set(id, newLog);
    return newLog;
  }
  async updatePressLog(id: number, updates: Partial<InsertPressLog>): Promise<PressLog | undefined> {
    const existing = this.pressLogsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.pressLogsMap.set(id, updated);
    return updated;
  }

  // Users
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.usersMap.values()).find(u => u.username === username);
  }
  async createUser(user: InsertUser): Promise<User> {
    const id = this.getNextId();
    const created = { ...user, id, createdAt: new Date() } as User;
    this.usersMap.set(id, created);
    return created;
  }
}

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

export const storage = new DrizzleStorage();
