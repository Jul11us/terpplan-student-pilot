import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const watches = sqliteTable(
  "watches",
  {
    userId: text("user_id").notNull(),
    courseId: text("course_id").notNull(),
    courseTitle: text("course_title").notNull(),
    term: text("term").notNull(),
    sectionId: text("section_id").notNull(),
    meetings: text("meetings").notNull().default("[]"),
    instructors: text("instructors").notNull().default("[]"),
    seats: integer("seats"),
    openSeats: integer("open_seats"),
    waitlist: integer("waitlist"),
    status: text("status").notNull().default("unknown"),
    lastCheckedAt: text("last_checked_at"),
    lastSuccessAt: text("last_success_at"),
    lastNotifiedOpen: integer("last_notified_open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.term, table.sectionId] })],
);

export const emailLoginCodes = sqliteTable("email_login_codes", {
  emailHash: text("email_hash").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  sentAt: integer("sent_at").notNull(),
});

export const emailLoginRateLimits = sqliteTable("email_login_rate_limits", {
  rateKey: text("rate_key").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  requestCount: integer("request_count").notNull().default(0),
});
