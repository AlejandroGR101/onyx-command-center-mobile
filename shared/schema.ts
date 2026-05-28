import { pgTable, text, serial, integer, boolean, real, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Jobs / Pipeline
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(), // e.g. ONX-2026-018
  clientName: text("client_name").notNull(),
  catalogNumber: text("catalog_number"),
  format: text("format").notNull(), // 7", 10", 12"
  weight: text("weight").notNull(), // 140g, 180g, 200g
  vinylColor: text("vinyl_color").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull(), // intake, prepress, ready-to-press, in-production, qc, packaging, shipped, delivered, closed
  depositStatus: text("deposit_status"), // none, 75%, 100%
  estimatedRevenue: real("estimated_revenue"),
  actualRevenue: real("actual_revenue"),
  estimatedCogs: real("estimated_cogs"),
  actualCogs: real("actual_cogs"),
  pressDate: text("press_date"),
  shipDate: text("ship_date"),
  productionLocation: text("production_location"), // onyx, belu-outsourced, belu-at-onyx
  regrindEligible: boolean("regrind_eligible").default(false),
  regrindRatio: text("regrind_ratio"), // 0%, 25%, 50%, 75%
  operatorNotes: text("operator_notes"),
  specialInstructions: text("special_instructions"),
});

// Production Runs
export const productionRuns = pgTable("production_runs", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  operatorName: text("operator_name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  cycleCount: integer("cycle_count").default(0),
  rejectCount: integer("reject_count").default(0),
  downtimeMinutes: integer("downtime_minutes").default(0),
  downtimeCauseCode: text("downtime_cause_code"),
  vinylUsageLbs: real("vinyl_usage_lbs"),
  ambientTemp: real("ambient_temp"),
  humidity: real("humidity"),
  chillerTempIn: real("chiller_temp_in"),
  chillerTempOut: real("chiller_temp_out"),
  hydraulicOilTemp: real("hydraulic_oil_temp"),
  pressParameters: json("press_parameters"),
  qualityPass: boolean("quality_pass"),
  notes: text("notes"),
});

// Financial Summaries
export const financials = pgTable("financials", {
  id: serial("id").primaryKey(),
  period: text("period").notNull().unique(), // e.g. "2026-01", "2026-02"
  revenue: real("revenue").notNull(),
  cogs: real("cogs").notNull(),
  operatingExpenses: real("operating_expenses").notNull(),
  netIncome: real("net_income").notNull(),
  cashPosition: real("cash_position"),
  arTotal: real("ar_total"),
  apTotal: real("ap_total"),
});

// Maintenance Tasks
export const maintenanceTasks = pgTable("maintenance_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  frequency: text("frequency").notNull(), // daily, weekly, monthly, quarterly, annual
  lastCompleted: text("last_completed"),
  nextDue: text("next_due").notNull(),
  assignedTo: text("assigned_to"),
  status: text("status").notNull(), // on-track, due-soon, overdue
  notes: text("notes"),
});

// Environmental Sensor Readings
export const sensorReadings = pgTable("sensor_readings", {
  id: serial("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  sensorType: text("sensor_type").notNull(), // ambient-temp, humidity, chiller-in, chiller-out, hydraulic-oil
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  location: text("location"),
});

// Inventory Items
export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  itemName: text("item_name").notNull(),
  category: text("category").notNull(), // vinyl, labels, jackets, inserts, spare-parts
  currentStock: real("current_stock").notNull(),
  unit: text("unit").notNull(),
  reorderThreshold: real("reorder_threshold").notNull(),
  preferredVendor: text("preferred_vendor"),
  lastOrderDate: text("last_order_date"),
  status: text("status").notNull(), // ok, low, critical
});

// AR Aging
export const arAging = pgTable("ar_aging", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  amount: real("amount").notNull(),
  agingBucket: text("aging_bucket").notNull(), // current, 1-30, 31-60, 61-90, 91+
  invoiceDate: text("invoice_date"),
  invoiceNumber: text("invoice_number"),
  notes: text("notes"),
});

// Shipments
export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  jobId: text("job_id"), // linked job (e.g. ONX-2026-001)
  carrier: text("carrier").notNull(), // fedex, ups
  trackingNumber: text("tracking_number").notNull(),
  service: text("service").notNull(), // e.g. FedEx Ground, UPS 2nd Day Air
  status: text("status").notNull(), // label-created, picked-up, in-transit, out-for-delivery, delivered, exception
  yourReference: text("your_reference"), // FedEx "YOUR REFERENCE" field — catalog/matrix number
  poNumber: text("po_number"), // FedEx PO NO.
  invoiceNumber: text("invoice_number"), // FedEx INVOICE NO.
  departmentNumber: text("department_number"), // FedEx DEPARTMENT NO.
  shipDate: text("ship_date"),
  estimatedDelivery: text("estimated_delivery"),
  actualDelivery: text("actual_delivery"),
  recipientName: text("recipient_name").notNull(),
  recipientCity: text("recipient_city"),
  recipientState: text("recipient_state"),
  weight: real("weight"), // lbs
  packageCount: integer("package_count").default(1),
  shippingCost: real("shipping_cost"),
  events: json("events"), // array of {timestamp, location, description, status}
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true });
export const insertProductionRunSchema = createInsertSchema(productionRuns).omit({ id: true });
export const insertFinancialSchema = createInsertSchema(financials).omit({ id: true });
export const insertMaintenanceTaskSchema = createInsertSchema(maintenanceTasks).omit({ id: true });
export const insertSensorReadingSchema = createInsertSchema(sensorReadings).omit({ id: true });
export const insertInventorySchema = createInsertSchema(inventory).omit({ id: true });
export const insertArAgingSchema = createInsertSchema(arAging).omit({ id: true });
export const insertShipmentSchema = createInsertSchema(shipments).omit({ id: true });

// Leads / CRM
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  // Contact info
  contactName: text("contact_name").notNull(),
  companyName: text("company_name"), // label, band, manager, distro, etc.
  email: text("email"),
  phone: text("phone"),
  city: text("city"),
  state: text("state"),
  // Lead tracking
  status: text("status").notNull(), // new-lead, contacted, quoting, negotiating, won, lost, repeat-client
  source: text("source").notNull(), // cold-call, referral, website, instagram, trade-show, word-of-mouth, returning
  referredBy: text("referred_by"), // who referred them
  assignedTo: text("assigned_to").default("Moe"), // always Moe for now
  priority: text("priority").default("normal"), // hot, normal, low
  // Vinyl interest details
  interestedFormat: text("interested_format"), // 7", 10", 12"
  interestedQuantity: text("interested_quantity"), // e.g. "500", "1000-2000"
  interestedColor: text("interested_color"), // e.g. "Black", "Custom splatter"
  interestedServices: text("interested_services"), // pressing-only, full-package, mastering+pressing, etc.
  estimatedValue: real("estimated_value"), // dollar value of potential job
  // Dates
  createdDate: text("created_date").notNull(),
  lastContactDate: text("last_contact_date"),
  nextFollowUp: text("next_follow_up"),
  closedDate: text("closed_date"),
  // Notes & comms
  notes: text("notes"), // Moe's running notes
  lastCommunication: text("last_communication"), // summary of last interaction
  communicationLog: json("communication_log"), // array of {date, type, summary}
  // Links
  linkedJobIds: text("linked_job_ids"), // comma-separated job IDs like "ONX-2026-001,ONX-2026-005"
  websiteUrl: text("website_url"),
  instagramHandle: text("instagram_handle"),
  tags: text("tags"), // comma-separated: "label", "indie", "major", "distro", "band-direct"
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true });

// Vendors
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // plating, materials, mastering, packaging, equipment, utilities, logistics, consulting
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  address: text("address"),
  status: text("status").notNull(), // active, inactive, on-hold
  paymentTerms: text("payment_terms"), // net-15, net-30, net-60, cod
  accountNumber: text("account_number"),
  notes: text("notes"),
  productsServices: text("products_services"), // what they supply
  lastOrderDate: text("last_order_date"),
  totalSpendYTD: real("total_spend_ytd"),
  rating: integer("rating"), // 1-5 stars
  tags: text("tags"), // comma-separated
});

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });

// Press Shift Logs — Daily Field Logs for the AD12
export const pressLogs = pgTable("press_logs", {
  id: serial("id").primaryKey(),
  // Shift identification
  shiftDate: text("shift_date").notNull(),           // YYYY-MM-DD
  operatorName: text("operator_name").notNull(),
  shiftNumber: integer("shift_number").default(1),    // 1, 2, 3 for day
  // Timing
  pressStartTime: text("press_start_time").notNull(), // HH:MM (24h)
  pressStopTime: text("press_stop_time"),              // HH:MM — null if still running
  totalRuntimeMinutes: integer("total_runtime_minutes"),
  // Job info
  jobId: text("job_id").notNull(),                    // linked job e.g. ONX-2026-003
  clientName: text("client_name").notNull(),
  format: text("format").notNull(),                   // 7", 10", 12"
  weight: text("weight").notNull(),                   // 140g, 180g, 200g
  vinylColor: text("vinyl_color").notNull(),           // e.g. "Black", "Clear w/ Red Splatter"
  colorBlend: text("color_blend"),                    // blend description if custom
  regrindPercent: text("regrind_percent"),             // 0%, 25%, 50%
  // Production counts
  goodCount: integer("good_count").default(0),        // records passed QC
  rejectCount: integer("reject_count").default(0),
  testPressCount: integer("test_press_count").default(0),
  totalCycles: integer("total_cycles").default(0),    // total press cycles
  // Press settings — AD12 specific
  extruderTemp: real("extruder_temp"),                 // °F
  mouldTempTop: real("mould_temp_top"),               // °F
  mouldTempBottom: real("mould_temp_bottom"),         // °F
  clampPressurePSI: real("clamp_pressure_psi"),       // PSI
  clampTimeSec: real("clamp_time_sec"),               // seconds
  coolingTimeSec: real("cooling_time_sec"),           // seconds
  cycleTimeSec: real("cycle_time_sec"),               // total cycle seconds
  trimmerSetting: text("trimmer_setting"),            // trimmer position/notes
  extruderRPM: real("extruder_rpm"),                  // screw RPM
  biscuitWeightGrams: real("biscuit_weight_grams"),   // target biscuit weight
  // Environmental readings at shift
  ambientTempF: real("ambient_temp_f"),
  humidityPercent: real("humidity_percent"),
  chillerTempIn: real("chiller_temp_in"),             // °F
  chillerTempOut: real("chiller_temp_out"),           // °F
  hydraulicOilTempF: real("hydraulic_oil_temp_f"),
  waterPressurePSI: real("water_pressure_psi"),
  steamPressurePSI: real("steam_pressure_psi"),
  // Vinyl usage
  vinylUsedLbs: real("vinyl_used_lbs"),
  regrindUsedLbs: real("regrind_used_lbs"),
  labelsUsed: integer("labels_used"),
  // Stoppages & issues
  stoppages: json("stoppages"),                       // [{time, durationMin, reason, code}]
  totalDowntimeMinutes: integer("total_downtime_minutes").default(0),
  // Quality & reject tracking
  rejectReasons: json("reject_reasons"),              // [{reason, count}] e.g. non-fill, warp, flash, off-center label
  qualityNotes: text("quality_notes"),                // free-form QC observations
  // Maintenance flags
  maintenanceFlags: json("maintenance_flags"),        // [{component, severity, description}]
  // Operator notes
  shiftNotes: text("shift_notes"),                    // general shift narrative
  nextShiftHandoff: text("next_shift_handoff"),       // what next operator needs to know
  // Stamper tracking
  stamperIdA: text("stamper_id_a"),                   // Side A stamper ID
  stamperIdB: text("stamper_id_b"),                   // Side B stamper ID
  stamperCondition: text("stamper_condition"),        // good, wear-showing, replace-soon
});

export const insertPressLogSchema = createInsertSchema(pressLogs).omit({ id: true });

// Users — server-side auth (single admin for now; roles = P2)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"), // admin (Operator/Sales = P2)
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });

// QuickBooks Online tokens — single-row (id=1).
export const quickbooksTokens = pgTable("quickbooks_tokens", {
  id: integer("id").primaryKey().default(1),
  realmId: text("realm_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  environment: text("environment").notNull(), // 'sandbox' | 'production'
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksTokenSchema = createInsertSchema(quickbooksTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type ProductionRun = typeof productionRuns.$inferSelect;
export type InsertProductionRun = z.infer<typeof insertProductionRunSchema>;
export type Financial = typeof financials.$inferSelect;
export type InsertFinancial = z.infer<typeof insertFinancialSchema>;
export type MaintenanceTask = typeof maintenanceTasks.$inferSelect;
export type InsertMaintenanceTask = z.infer<typeof insertMaintenanceTaskSchema>;
export type SensorReading = typeof sensorReadings.$inferSelect;
export type InsertSensorReading = z.infer<typeof insertSensorReadingSchema>;
export type InventoryItem = typeof inventory.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventorySchema>;
export type ArAgingItem = typeof arAging.$inferSelect;
export type InsertArAgingItem = z.infer<typeof insertArAgingSchema>;
export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type PressLog = typeof pressLogs.$inferSelect;
export type InsertPressLog = z.infer<typeof insertPressLogSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type QuickbooksToken = typeof quickbooksTokens.$inferSelect;
export type InsertQuickbooksToken = z.infer<typeof insertQuickbooksTokenSchema>;
