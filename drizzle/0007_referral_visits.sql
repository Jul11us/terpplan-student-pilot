CREATE TABLE `referral_visits` (
	`day` text NOT NULL,
	`ref` text NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `ref`)
);
