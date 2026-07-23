import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { Rating } from "../lib/types";

// Datetimes are stored as epoch milliseconds (integer, mode "timestamp_ms"):
// SLA math elsewhere in the app runs entirely on epoch-ms duration
// arithmetic, and integer storage gives correct DB-level sorting/range
// filters with zero parsing. Drizzle maps them to Date.
//
// Enums (followUpStatus, rating, touchpoint method) are validated at the API
// boundary — Drizzle performs no runtime validation, and this schema
// deliberately has no CHECK constraints. rating carries a compile-time-only
// $type.

// reps: sales reps as a real table — leads reference them by id
// instead of a free-text name, so renames/typos don't fragment the roster.
export const reps = sqliteTable(
  "reps",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(), // trimmed, stored casing as first entered
    nameKey: text("name_key").notNull(), // name.trim().toLowerCase() — JS Unicode fold
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("reps_name_key_unique").on(t.nameKey)],
);

export const leads = sqliteTable(
  "leads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => new Date()),
    country: text("country").notNull().default(""),
    contactInfo: text("contact_info").notNull(),
    contactKey: text("contact_key").notNull(),
    repId: text("rep_id").notNull().references(() => reps.id), // no cascade
    interest: text("interest").notNull(), // required; empty string allowed
    note: text("note").notNull().default(""),
    screenshotUrls: text("screenshot_urls", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    followUpStatus: text("follow_up_status").notNull().default("Pending"),
    rating: text("rating").$type<Rating>(), // nullable; null = Unknown
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("leads_contact_key_unique").on(table.contactKey),
    index("leads_follow_up_status_idx").on(table.followUpStatus),
    index("leads_created_at_idx").on(table.createdAt),
    index("leads_rep_id_idx").on(table.repId),
  ],
);

export const touchpoints = sqliteTable(
  "touchpoints",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => new Date()),
    method: text("method").notNull(),
    notes: text("notes").notNull().default(""),
  },
  (table) => [
    index("touchpoints_lead_id_timestamp_idx").on(table.leadId, table.timestamp),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Rep = typeof reps.$inferSelect;
export type NewRep = typeof reps.$inferInsert;
export type Touchpoint = typeof touchpoints.$inferSelect;
export type NewTouchpoint = typeof touchpoints.$inferInsert;
