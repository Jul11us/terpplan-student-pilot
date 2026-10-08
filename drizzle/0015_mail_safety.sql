CREATE TABLE `mail_budget` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `enabled` integer DEFAULT 1 NOT NULL CHECK (`enabled` IN (0, 1)),
  `day` text DEFAULT '' NOT NULL,
  `month` text DEFAULT '' NOT NULL,
  `day_requests` integer DEFAULT 0 NOT NULL,
  `month_requests` integer DEFAULT 0 NOT NULL,
  `accepted` integer DEFAULT 0 NOT NULL,
  `failed` integer DEFAULT 0 NOT NULL,
  `last_failure_at` integer
);
INSERT INTO `mail_budget` (`id`) VALUES (1);
--> statement-breakpoint
CREATE TABLE `mail_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `payload` text NOT NULL,
  `created_at` integer NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_attempt_at` integer,
  `accepted` integer DEFAULT 0 NOT NULL
);
CREATE INDEX `mail_outbox_created` ON `mail_outbox` (`created_at`);
--> statement-breakpoint
ALTER TABLE `background_runs` ADD `failed_courses` integer DEFAULT 0 NOT NULL;
ALTER TABLE `background_runs` ADD `emails_failed` integer DEFAULT 0 NOT NULL;
ALTER TABLE `background_runs` ADD `deferred` integer DEFAULT 0 NOT NULL;
ALTER TABLE `background_runs` ADD `emails_deferred` integer DEFAULT 0 NOT NULL;
