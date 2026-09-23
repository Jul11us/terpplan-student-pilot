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
    // Set when open seats go from 0 to more than 0; cleared once the email is sent or the seats are gone.
    alertPendingAt: text("alert_pending_at"),
    alertSentAt: text("alert_sent_at"),
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

// Students who opted in to seat emails. The raw address is stored only here, and only after opting in.
export const alertSubscriptions = sqliteTable("alert_subscriptions", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  unsubscribeTokenHash: text("unsubscribe_token_hash").notNull(),
  dailyDate: text("daily_date"),
  dailyCount: integer("daily_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
