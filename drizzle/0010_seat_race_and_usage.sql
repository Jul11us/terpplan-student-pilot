CREATE TABLE `course_fill` (
	`term` text NOT NULL,
	`course_id` text NOT NULL,
	`base_taken` integer NOT NULL,
	`total_seats` integer NOT NULL,
	`started_at` text,
	`filled_at` text,
	`last_at` text NOT NULL,
	PRIMARY KEY(`term`, `course_id`)
);
--> statement-breakpoint
CREATE TABLE `feature_usage` (
	`day` text NOT NULL,
	`feature` text NOT NULL,
	`people` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `feature`)
);
--> statement-breakpoint
CREATE INDEX `course_seat_history_term_checked` ON `course_seat_history` (`term`,`checked_at`);