import type { HealthResponse } from "@whi/shared";
import { Hono } from "hono";
import { webhooksRouter } from "./routes/webhooks.ts";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true } satisfies HealthResponse));
app.route("/", webhooksRouter);
