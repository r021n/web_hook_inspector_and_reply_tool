import { describe, expect, test } from "vitest";
import { app } from "./app.ts";

describe("GET /health", () => {
  test("responds with { ok: true }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("unknown route responds 404", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
