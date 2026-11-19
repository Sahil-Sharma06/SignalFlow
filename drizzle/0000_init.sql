CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_created_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `ai_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`task` text NOT NULL,
	`cached` integer NOT NULL,
	`prompt_chars` integer NOT NULL,
	`output_chars` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`industry` text NOT NULL,
	`size` integer NOT NULL,
	`location` text NOT NULL,
	`website_summary` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_domain_unique` ON `companies` (`domain`);--> statement-breakpoint
CREATE TABLE `emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`step` integer NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_for` text,
	`sent_at` text,
	`opened` integer DEFAULT false NOT NULL,
	`clicked` integer DEFAULT false NOT NULL,
	`block_reason` text,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `emails_lead_idx` ON `emails` (`lead_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`signal_id` integer,
	`contact_name` text NOT NULL,
	`contact_title` text NOT NULL,
	`contact_email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`score` integer,
	`score_reasons` text,
	`disqualified` integer DEFAULT false NOT NULL,
	`research_brief` text,
	`handoff_summary` text,
	`handoff_next_step` text,
	`bounced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE TABLE `replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`body` text NOT NULL,
	`received_at` text NOT NULL,
	`classification` text NOT NULL,
	`snooze_until` text,
	`classifier_reason` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`detected_at` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `signals_company_idx` ON `signals` (`company_id`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`offer_description` text NOT NULL,
	`icp` text NOT NULL,
	`daily_send_cap` integer DEFAULT 40 NOT NULL,
	`warmup_enabled` integer DEFAULT true NOT NULL,
	`sending_domain` text NOT NULL,
	`auto_approve_enabled` integer DEFAULT false NOT NULL,
	`auto_approve_threshold` integer DEFAULT 80 NOT NULL,
	`webhook_url` text,
	`sim_offset_days` real DEFAULT 0 NOT NULL,
	`warmup_started_at` text NOT NULL
);
