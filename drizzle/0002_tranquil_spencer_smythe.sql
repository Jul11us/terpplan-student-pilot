CREATE TABLE `alert_subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`unsubscribe_token_hash` text NOT NULL,
	`daily_date` text,
	`daily_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `watches` ADD `alert_pending_at` text;--> statement-breakpoint
ALTER TABLE `watches` ADD `alert_sent_at` text;