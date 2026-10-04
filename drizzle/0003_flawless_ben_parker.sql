CREATE TABLE `course_offerings` (
	`course_id` text NOT NULL,
	`term` text NOT NULL,
	`section_count` integer NOT NULL,
	`total_seats` integer NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`course_id`, `term`)
);
--> statement-breakpoint
CREATE TABLE `plan_activity` (
	`course_id` text NOT NULL,
	`term` text NOT NULL,
	`user_hash` text NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`removed_at` text,
	PRIMARY KEY(`term`, `course_id`, `user_hash`)
);
--> statement-breakpoint
CREATE TABLE `seat_history` (
	`course_id` text NOT NULL,
	`section_id` text NOT NULL,
	`term` text NOT NULL,
	`seats` integer,
	`open_seats` integer NOT NULL,
	`waitlist` integer DEFAULT 0 NOT NULL,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`term`, `section_id`, `checked_at`)
);
