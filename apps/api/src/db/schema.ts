import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const webhookRequests = sqliteTable(
  "webhook_requests",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    query: text("query").notNull().default(""),
    headers: text("headers").notNull(),
    contentType: text("content_type"),
    body: text("body"),
    bodyEncoding: text("body_encoding").notNull().default("text"),
    bodySize: integer("body_size").notNull().default(0),
    receivedAt: integer("received_at").notNull(),
  },
  (table) => [
    index("webhook_requests_token_received_at_idx").on(
      table.token,
      table.receivedAt,
    ),
  ],
);

export type WebhookRequestRow = typeof webhookRequests.$inferSelect;
