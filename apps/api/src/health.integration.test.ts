import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { afterEach, describe, expect, test } from "vitest";
import { app } from "./app.ts";

let server: ServerType | undefined;

afterEach(async () => {
  const current = server;
  if (!current) return;
  server = undefined;
  await new Promise<void>((resolve) => {
    current.close(() => resolve());
  });
});

describe("health integration over real HTTP", () => {
  test("GET /health returns 200 with { ok: true }", async () => {
    const { port } = await new Promise<{ port: number }>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => {
        resolve({ port: info.port });
      });
    });

    const res = await fetch(`http://127.0.0.1:${port}/health`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});
