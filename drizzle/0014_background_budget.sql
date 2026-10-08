CREATE TABLE `background_budget` (
  `id` integer PRIMARY KEY CHECK (`id` = 1),
  `enabled` integer DEFAULT 1 NOT NULL CHECK (`enabled` IN (0, 1)),
  `day` text DEFAULT '' NOT NULL,
  `runs` integer DEFAULT 0 NOT NULL,
  `last_started_at` integer,
  `lease_until` integer DEFAULT 0 NOT NULL,
  `lease_token` text
);
INSERT INTO `background_budget` (`id`) VALUES (1);
--> statement-breakpoint
-- Bound the scanned rows as well as the returned rows in recurring queries.
CREATE INDEX `watches_last_checked` ON `watches` (`last_checked_at`);
CREATE INDEX `watches_pending_alert` ON `watches` (`alert_pending_at`) WHERE `alert_pending_at` IS NOT NULL;
CREATE INDEX `watches_created` ON `watches` (`created_at`);
CREATE INDEX `login_limits_started` ON `email_login_rate_limits` (`window_started_at`);
CREATE INDEX `login_codes_expires` ON `email_login_codes` (`expires_at`);
