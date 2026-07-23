CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`contact_info` text NOT NULL,
	`contact_key` text NOT NULL,
	`rep_id` text NOT NULL,
	`interest` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`screenshot_urls` text DEFAULT '[]' NOT NULL,
	`follow_up_status` text DEFAULT 'Pending' NOT NULL,
	`rating` text,
	`archived_at` integer,
	FOREIGN KEY (`rep_id`) REFERENCES `reps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_contact_key_unique` ON `leads` (`contact_key`);--> statement-breakpoint
CREATE INDEX `leads_follow_up_status_idx` ON `leads` (`follow_up_status`);--> statement-breakpoint
CREATE INDEX `leads_created_at_idx` ON `leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `leads_rep_id_idx` ON `leads` (`rep_id`);--> statement-breakpoint
CREATE TABLE `reps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reps_name_key_unique` ON `reps` (`name_key`);--> statement-breakpoint
CREATE TABLE `touchpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`method` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `touchpoints_lead_id_timestamp_idx` ON `touchpoints` (`lead_id`,`timestamp`);