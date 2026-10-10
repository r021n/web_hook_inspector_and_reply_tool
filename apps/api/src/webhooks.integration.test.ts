import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "./app.ts";
import { closeDb } from "./db/index.ts";
import { API_ROOT } from "./db/path.ts";

const testDb = join(tmpdir(), `whi-test-${randomUUID()}.db`);
process.env.DB_FILE_NAME = testDb;

const kitBin = join(
  dirname(createRequire(import.meta.url).resolve("drizzle-kit")),
  "bin.cjs",
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let server: ServerType | undefined;
let base = "";

beforeAll(async () => {
  const pushed = spawnSync(process.execPath, [kitBin, "push"], {
    cwd: API_ROOT,
    env: { ...process.env, DB_FILE_NAME: testDb },
    encoding: "utf8",
  });
  expect(pushed.status, pushed.stderr).toBe(0);

  base = await new Promise<string>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      resolve(`http://127.0.0.1:${info.port}`);
    });
  });
});

afterAll(async () => {
  const current = server;
  if (current) {
    server = undefined;
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
  }
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${testDb}${suffix}`, { force: true });
  }
});

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`);
  expect(res.status).toBe(200);
  return res.json();
}

async function ingest(
  token: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${base}/in/${token}`, init);
  expect(res.status).toBe(200);
  return res.json() as Promise<{ ok: boolean; id: string }>;
}

describe("webhook ingest → list → detail (HTTP asli)", () => {
  test("POST JSON tersimpan, muncul di list, dan detail lengkap", async () => {
    const created = await ingest("alpha", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    expect(created.ok).toBe(true);
    expect(created.id).toMatch(UUID_RE);

    const list = (await getJson("/hooks/alpha")) as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      method: "POST",
      path: "/in/alpha",
      query: "",
      contentType: "application/json",
      bodySize: 13,
    });
    expect(list[0]).not.toHaveProperty("headers");
    expect(list[0]).not.toHaveProperty("body");

    const detail = (await getJson(`/hooks/alpha/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(detail.token).toBe("alpha");
    expect(detail.method).toBe("POST");
    expect(detail.body).toBe('{"foo":"bar"}');
    expect(detail.bodyEncoding).toBe("text");
    expect(detail.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(typeof detail.receivedAt).toBe("number");
  });

  test("query string tersimpan tanpa tanda ?", async () => {
    const res = await fetch(`${base}/in/query?foo=1&bar=2`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "halo dunia",
    });
    expect(res.status).toBe(200);
    const list = (await getJson("/hooks/query")) as { query: string }[];
    expect(list[0].query).toBe("foo=1&bar=2");
  });

  test("body binary disimpan sebagai base64 dengan ukuran asli", async () => {
    const bytes = Uint8Array.from([0, 1, 2, 255, 254, 0, 10]);
    const created = await ingest("binary", {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: bytes,
    });
    const detail = (await getJson(`/hooks/binary/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(detail.method).toBe("PUT");
    expect(detail.bodyEncoding).toBe("base64");
    expect(detail.body).toBe(Buffer.from(bytes).toString("base64"));
    expect(detail.bodySize).toBe(bytes.length);
  });

  test("request tanpa body (GET) menyimpan body null", async () => {
    const created = await ingest("nobody", { method: "GET" });
    const detail = (await getJson(`/hooks/nobody/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(detail.method).toBe("GET");
    expect(detail.body).toBeNull();
    expect(detail.bodySize).toBe(0);
    expect(detail.bodyEncoding).toBe("text");
  });

  test("token yang belum pernah dipakai → list kosong", async () => {
    expect(await getJson("/hooks/never-used")).toEqual([]);
  });

  test("token tidak valid → 400 + issues Zod", async () => {
    const res = await fetch(`${base}/in/bad%20token`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      issues: { path: string[] }[];
    };
    expect(body.error).toBe("invalid path parameter");
    expect(body.issues[0]?.path).toEqual(["token"]);
  });

  test("id tidak ditemukan → 404", async () => {
    const res = await fetch(
      `${base}/hooks/alpha/00000000-0000-4000-8000-000000000000`,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "request not found" });
  });

  test("list di-limit 50 walaupun request lebih banyak", async () => {
    for (let i = 0; i < 52; i++) {
      await ingest("limit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ i }),
      });
    }
    const list = (await getJson("/hooks/limit")) as unknown[];
    expect(list).toHaveLength(50);
  });
});
