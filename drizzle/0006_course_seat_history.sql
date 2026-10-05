CREATE TABLE `course_seat_history` (
	`term` text NOT NULL,
	`course_id` text NOT NULL,
	`checked_at` text NOT NULL,
	`section_count` integer NOT NULL,
	`total_seats` integer NOT NULL,
	`open_seats` integer NOT NULL,
	`full_sections` integer NOT NULL,
	PRIMARY KEY(`term`, `course_id`, `checked_at`)
);
