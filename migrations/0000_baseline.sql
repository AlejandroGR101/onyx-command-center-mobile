CREATE TABLE IF NOT EXISTS "ar_aging" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_name" text NOT NULL,
	"amount" real NOT NULL,
	"aging_bucket" text NOT NULL,
	"invoice_date" text,
	"invoice_number" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "balance_sheet_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"section" text NOT NULL,
	"label" text NOT NULL,
	"amount" real NOT NULL,
	"indent" integer DEFAULT 0,
	"is_bold" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"amount" real NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financials" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"revenue" real NOT NULL,
	"cogs" real NOT NULL,
	"operating_expenses" real NOT NULL,
	"net_income" real NOT NULL,
	"cash_position" real,
	"ar_total" real,
	"ap_total" real,
	CONSTRAINT "financials_period_unique" UNIQUE("period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_name" text NOT NULL,
	"category" text NOT NULL,
	"current_stock" real NOT NULL,
	"unit" text NOT NULL,
	"reorder_threshold" real NOT NULL,
	"preferred_vendor" text,
	"last_order_date" text,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"client_name" text NOT NULL,
	"catalog_number" text,
	"format" text NOT NULL,
	"weight" text NOT NULL,
	"vinyl_color" text NOT NULL,
	"quantity" integer NOT NULL,
	"status" text NOT NULL,
	"deposit_status" text,
	"estimated_revenue" real,
	"actual_revenue" real,
	"estimated_cogs" real,
	"actual_cogs" real,
	"press_date" text,
	"ship_date" text,
	"production_location" text,
	"regrind_eligible" boolean DEFAULT false,
	"regrind_ratio" text,
	"operator_notes" text,
	"special_instructions" text,
	"qb_customer_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_name" text NOT NULL,
	"company_name" text,
	"email" text,
	"phone" text,
	"city" text,
	"state" text,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"referred_by" text,
	"assigned_to" text DEFAULT 'Moe',
	"priority" text DEFAULT 'normal',
	"interested_format" text,
	"interested_quantity" text,
	"interested_color" text,
	"interested_services" text,
	"estimated_value" real,
	"created_date" text NOT NULL,
	"last_contact_date" text,
	"next_follow_up" text,
	"closed_date" text,
	"notes" text,
	"last_communication" text,
	"communication_log" json,
	"linked_job_ids" text,
	"website_url" text,
	"instagram_handle" text,
	"tags" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"frequency" text NOT NULL,
	"last_completed" text,
	"next_due" text NOT NULL,
	"assigned_to" text,
	"status" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "press_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_date" text NOT NULL,
	"operator_name" text NOT NULL,
	"shift_number" integer DEFAULT 1,
	"press_start_time" text NOT NULL,
	"press_stop_time" text,
	"total_runtime_minutes" integer,
	"job_id" text NOT NULL,
	"client_name" text NOT NULL,
	"format" text NOT NULL,
	"weight" text NOT NULL,
	"vinyl_color" text NOT NULL,
	"color_blend" text,
	"regrind_percent" text,
	"good_count" integer DEFAULT 0,
	"reject_count" integer DEFAULT 0,
	"test_press_count" integer DEFAULT 0,
	"total_cycles" integer DEFAULT 0,
	"extruder_temp" real,
	"mould_temp_top" real,
	"mould_temp_bottom" real,
	"clamp_pressure_psi" real,
	"clamp_time_sec" real,
	"cooling_time_sec" real,
	"cycle_time_sec" real,
	"trimmer_setting" text,
	"extruder_rpm" real,
	"biscuit_weight_grams" real,
	"ambient_temp_f" real,
	"humidity_percent" real,
	"chiller_temp_in" real,
	"chiller_temp_out" real,
	"hydraulic_oil_temp_f" real,
	"water_pressure_psi" real,
	"steam_pressure_psi" real,
	"vinyl_used_lbs" real,
	"regrind_used_lbs" real,
	"labels_used" integer,
	"stoppages" json,
	"total_downtime_minutes" integer DEFAULT 0,
	"reject_reasons" json,
	"quality_notes" text,
	"maintenance_flags" json,
	"shift_notes" text,
	"next_shift_handoff" text,
	"stamper_id_a" text,
	"stamper_id_b" text,
	"stamper_condition" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"operator_name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text,
	"cycle_count" integer DEFAULT 0,
	"reject_count" integer DEFAULT 0,
	"downtime_minutes" integer DEFAULT 0,
	"downtime_cause_code" text,
	"vinyl_usage_lbs" real,
	"ambient_temp" real,
	"humidity" real,
	"chiller_temp_in" real,
	"chiller_temp_out" real,
	"hydraulic_oil_temp" real,
	"press_parameters" json,
	"quality_pass" boolean,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qb_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quickbooks_tokens" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"realm_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"environment" text NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sensor_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" text NOT NULL,
	"sensor_type" text NOT NULL,
	"value" real NOT NULL,
	"unit" text NOT NULL,
	"location" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text,
	"carrier" text NOT NULL,
	"tracking_number" text NOT NULL,
	"service" text NOT NULL,
	"status" text NOT NULL,
	"your_reference" text,
	"po_number" text,
	"invoice_number" text,
	"department_number" text,
	"ship_date" text,
	"estimated_delivery" text,
	"actual_delivery" text,
	"recipient_name" text NOT NULL,
	"recipient_city" text,
	"recipient_state" text,
	"weight" real,
	"package_count" integer DEFAULT 1,
	"shipping_cost" real,
	"events" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"website" text,
	"address" text,
	"status" text NOT NULL,
	"payment_terms" text,
	"account_number" text,
	"notes" text,
	"products_services" text,
	"last_order_date" text,
	"total_spend_ytd" real,
	"rating" integer,
	"tags" text
);
