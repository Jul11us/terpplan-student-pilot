CREATE TABLE `watches` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`course_title` text NOT NULL,
	`term` text NOT NULL,
	`section_id` text NOT NULL,
	`meetings` text DEFAULT '[]' NOT NULL,
	`instructors` text DEFAULT '[]' NOT NULL,
	`seats` integer,
	`open_seats` integer,
	`waitlist` integer,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` text,
	`last_success_at` text,
	`last_notified_open` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `term`, `section_id`)
);
