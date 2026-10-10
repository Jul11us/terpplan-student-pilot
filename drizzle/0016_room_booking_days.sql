CREATE TABLE `room_booking_days` (
	`space_id` integer NOT NULL,
	`day` text NOT NULL,
	`slots` text NOT NULL,
	`synced_at` text NOT NULL,
	PRIMARY KEY(`space_id`, `day`)
);
