import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

// Historical seat snapshots for trend analysis
export const seatHistory = sqliteTable(
  "seat_history",
  {
    courseId: text("course_id").notNull(),
    sectionId: text("section_id").notNull(),
    term: text("term").notNull(),
    seats: integer("seats"),
    openSeats: integer("open_seats").notNull(),
    waitlist: integer("waitlist").notNull().default(0),
    checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.term, table.sectionId, table.checkedAt] })],
);

// Track which courses are added to plans (for popularity ranking)
export const planActivity = sqliteTable(
  "plan_activity",
  {
    courseId: text("course_id").notNull(),
    term: text("term").notNull(),
    // Anonymous fingerprint to count unique users without storing identity
    userHash: text("user_hash").notNull(),
    addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    removedAt: text("removed_at"),
  },
  (table) => [primaryKey({ columns: [table.term, table.courseId, table.userHash] })],
);

// Historical offerings: which terms a course was offered
export const courseOfferings = sqliteTable(
  "course_offerings",
  {
    courseId: text("course_id").notNull(),
    term: text("term").notNull(),
    sectionCount: integer("section_count").notNull(),
    totalSeats: integer("total_seats").notNull(),
    // Seats still open and sections with none open when last read. For a finished term Testudo keeps the
    // final numbers, so this is how full the course ended up; null for rows stored before these were kept.
    openSeats: integer("open_seats"),
    fullSections: integer("full_sections"),
    firstSeenAt: text("first_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.courseId, table.term] })],
);

// A course's seats over time in the term being registered for, one row per reading (at most every two
// hours per course), so a later year can say how fast a course filled after registration opened.
export const courseSeatHistory = sqliteTable(
  "course_seat_history",
  {
    term: text("term").notNull(),
    courseId: text("course_id").notNull(),
    checkedAt: text("checked_at").notNull(),
    sectionCount: integer("section_count").notNull(),
    totalSeats: integer("total_seats").notNull(),
    openSeats: integer("open_seats").notNull(),
    fullSections: integer("full_sections").notNull(),
  },
  (table) => [primaryKey({ columns: [table.term, table.courseId, table.checkedAt] }), index("course_seat_history_term_checked").on(table.term, table.checkedAt)],
);

// One row per course per term while registration runs (see lib/seat-race.ts): seats taken at TerpPlan's
// first reading, when more were first taken (its registration started) and when it first became full.
export const courseFill = sqliteTable(
  "course_fill",
  {
    term: text("term").notNull(),
    courseId: text("course_id").notNull(),
    baseTaken: integer("base_taken").notNull(),
    totalSeats: integer("total_seats").notNull(),
    startedAt: text("started_at"),
    filledAt: text("filled_at"),
    lastAt: text("last_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.term, table.courseId] })],
);

// Visits that arrived with a ?ref= tag (a QR code or a shared link), counted per tag per day (Eastern
// time). Only the count is kept: no address, browser or anything that identifies a visitor.
export const referralVisits = sqliteTable(
  "referral_visits",
  {
    day: text("day").notNull(),
    ref: text("ref").notNull(),
    visits: integer("visits").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.ref] })],
);

// Everyone who opens the site, counted once per browser per day (Eastern time); new_visitors are browsers
// that had never opened TerpPlan before. Only the two counts are kept, nothing about any visitor.
export const siteVisits = sqliteTable("site_visits", {
  day: text("day").primaryKey(),
  visitors: integer("visitors").notNull().default(0),
  newVisitors: integer("new_visitors").notNull().default(0),
});

// A signed-in student's planner data, so the same plan opens on every device they sign in on: the saved
// plans and preferences, the courses they have taken and their registration times, as one JSON document.
// updated_at is when the student last changed it (the newer copy wins).
export const planSync = sqliteTable("plan_sync", {
  userId: text("user_id").primaryKey(),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// How many people used each part of TerpPlan per day (Eastern time): each browser counts once per feature
// per day ("opened the planner", "added a course", "turned on a seat alert"...). Only the counts are kept.
export const featureUsage = sqliteTable(
  "feature_usage",
  {
    day: text("day").notNull(),
    feature: text("feature").notNull(),
    people: integer("people").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.feature] })],
);
