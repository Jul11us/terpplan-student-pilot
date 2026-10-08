CREATE TABLE `error_counts` (
	`hour` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`hour`, `kind`)
);
