import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/index.ts";
import { type WebhookRequestRow, webhookRequests } from "../db/schema.ts";
import {
  capturedRequestSchema,
  paramValidator,
  type RequestDetail,
  type RequestSummary,
  requestParamSchema,
  tokenParamSchema,
} from "../validation.ts";

export const webhooksRouter = new Hono();

const TEXTUAL_CONTENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/graphql",
  "application/x-www-form-urlencoded",
]);

function isTextual(contentType: string | null): boolean {
  if (contentType === null) {
    return true;
  }
  const essence = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return (
    essence.startsWith("text/") ||
    essence.endsWith("+json") ||
    essence.endsWith("+xml") ||
    TEXTUAL_CONTENT_TYPES.has(essence)
  );
}

function toSummary(row: WebhookRequestRow): RequestSummary {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    query: row.query,
    contentType: row.contentType,
    bodySize: row.bodySize,
    receivedAt: row.receivedAt,
  };
}

function parseHeaders(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, string>;
    }
  } catch {}
  return {};
}

function toDetail(row: WebhookRequestRow): RequestDetail {
  return {
    ...toSummary(row),
    token: row.token,
    headers: parseHeaders(row.headers),
    body: row.body,
    bodyEncoding: row.bodyEncoding === "base64" ? "base64" : "text",
  };
}

webhooksRouter.all(
  "/in/:token",
  paramValidator(tokenParamSchema),
  async (c) => {
    const url = new URL(c.req.url);
    const rawHeaders = Object.fromEntries(c.req.raw.headers);
    const contentType = rawHeaders["content-type"] ?? null;
    const bytes = Buffer.from(await c.req.arrayBuffer());
    const textual = isTextual(contentType);

    const captured = capturedRequestSchema.parse({
      id: randomUUID(),
      token: c.req.param("token"),
      method: c.req.method,
      path: url.pathname,
      query: url.search.slice(1),
      headers: rawHeaders,
      contentType,
      body:
        bytes.length === 0
          ? null
          : textual
            ? bytes.toString("utf8")
            : bytes.toString("base64"),
      bodyEncoding: textual ? "text" : "base64",
      bodySize: bytes.length,
      receivedAt: Date.now(),
    });

    await getDb()
      .insert(webhookRequests)
      .values({ ...captured, headers: JSON.stringify(captured.headers) });

    return c.json({ ok: true, id: captured.id });
  },
);

webhooksRouter.get(
  "/hooks/:token",
  paramValidator(tokenParamSchema),
  async (c) => {
    const rows = await getDb()
      .select()
      .from(webhookRequests)
      .where(eq(webhookRequests.token, c.req.param("token")))
      .orderBy(desc(webhookRequests.receivedAt))
      .limit(50);

    return c.json(rows.map(toSummary));
  },
);

webhooksRouter.get(
  "/hooks/:token/:id",
  paramValidator(requestParamSchema),
  async (c) => {
    const row = await getDb()
      .select()
      .from(webhookRequests)
      .where(
        and(
          eq(webhookRequests.token, c.req.param("token")),
          eq(webhookRequests.id, c.req.param("id")),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (row === undefined) {
      return c.json({ error: "request not found" }, 404);
    }
    return c.json(toDetail(row));
  },
);
