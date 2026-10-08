CREATE TABLE `background_runs` (
	`started_at` text PRIMARY KEY NOT NULL,
	`duration_ms` integer NOT NULL,
	`ok` integer NOT NULL,
	`checked_courses` integer DEFAULT 0 NOT NULL,
	`tracked_courses` integer DEFAULT 0 NOT NULL,
	`emails_sent` integer DEFAULT 0 NOT NULL
);
