import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const repositories = sqliteTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull().unique(),
    ownership: text("ownership").notNull().$type<"owned" | "watched">(),
    rhythm: text("rhythm")
      .notNull()
      .$type<"immediate" | "weekly" | "biweekly" | "monthly">(),
    lastPromotedAt: integer("last_promoted_at"),
    nextDueAt: integer("next_due_at"),
    snoozedUntil: integer("snoozed_until"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ rhythmIdx: index("repositories_rhythm_idx").on(t.rhythm) })
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id),
    subject: text("subject").notNull(),
    reason: text("reason")
      .notNull()
      .$type<
        | "mention"
        | "review_requested"
        | "action_failed"
        | "ci_failed"
        | "release"
        | "merged"
        | "assigned"
        | "subscribed"
      >(),
    createdAt: integer("created_at").notNull(),
    isRead: integer("is_read").notNull().default(0),
    isDone: integer("is_done").notNull().default(0),
    sourceUrl: text("source_url").notNull(),
  },
  (t) => ({
    repoIdx: index("notifications_repo_idx").on(t.repositoryId),
    doneIdx: index("notifications_done_idx").on(t.isDone),
  })
);

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export const mutedSubjects = sqliteTable("muted_subjects", {
  repositoryId: text("repository_id").notNull(),
  subject: text("subject").notNull(),
});

export const contributionDays = sqliteTable("contribution_days", {
  date: text("date").primaryKey(),
  count: integer("count").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});
