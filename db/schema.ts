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
