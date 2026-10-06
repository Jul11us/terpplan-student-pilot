CREATE TABLE `site_visits` (
	`day` text PRIMARY KEY NOT NULL,
	`visitors` integer DEFAULT 0 NOT NULL,
	`new_visitors` integer DEFAULT 0 NOT NULL
);
