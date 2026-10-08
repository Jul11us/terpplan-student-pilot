CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`contact` text,
	`page` text NOT NULL,
	`context` text,
	`language` text NOT NULL
);
