import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { app } from "./app.ts";
import { newWebhookSubscriberCount } from "./bus.ts";
import { closeDb } from "./db/index.ts";
import { API_ROOT } from "./db/path.ts";

const testDb = join(tmpdir(), `whi-test-${randomUUID()}.db`);
process.env.DB_FILE_NAME = testDb;

const kitBin = join(
  dirname(createRequire(import.meta.url).resolve("drizzle-kit")),
  "bin.cjs",
);

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
    // Kalau ada stream yang belum sempat ter-deteksi close, paksa tutup socket
    // supaya server.close() tidak menggantung (hook timeout).
    if ("closeAllConnections" in current) {
      current.closeAllConnections();
    }
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
  }
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${testDb}${suffix}`, { force: true });
  }
});

type SSEFrame = { event?: string; id?: string; data: string };

function parseFrame(raw: string): SSEFrame {
  const frame: SSEFrame = { data: "" };
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      frame.event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      frame.data = line.slice("data:".length).trimStart();
    } else if (line.startsWith("id:")) {
      frame.id = line.slice("id:".length).trim();
    }
  }
  return frame;
}

/** Lihat penjelasan lengkap di src/stream.test.ts — sengaja diduplikasi (tanpa modul bersama). */
class SSEFrameReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = "";
  private queue: SSEFrame[] = [];
  private pending: Promise<"chunk" | "done"> | null = null;

  constructor(res: Response) {
    const body = res.body;
    if (body === null) {
      throw new Error("response SSE tanpa body");
    }
    this.reader = body.getReader();
  }

  async next(
    predicate: (frame: SSEFrame) => boolean,
    timeoutMs = 2000,
  ): Promise<SSEFrame> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const index = this.queue.findIndex(predicate);
      if (index !== -1) {
        return this.queue.splice(index, 1)[0];
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`timeout ${timeoutMs}ms menunggu frame SSE`);
      }
      const status = await this.readChunk(remaining);
      if (status === "done") {
        throw new Error("stream SSE tertutup sebelum frame yang dicari");
      }
    }
  }

  private async readChunk(
    timeoutMs: number,
  ): Promise<"chunk" | "done" | "timeout"> {
    this.pending ??= this.reader.read().then((result) => {
      this.pending = null;
      if (result.done) {
        return "done" as const;
      }
      this.feed(result.value);
      return "chunk" as const;
    });
    const timeout = new Promise<"timeout">((resolve) => {
      setTimeout(() => {
        resolve("timeout");
      }, timeoutMs);
    });
    return Promise.race([this.pending, timeout]);
  }

  private feed(value: Uint8Array): void {
    this.buffer += this.decoder.decode(value, { stream: true });
    let end = this.buffer.indexOf("\n\n");
    while (end !== -1) {
      this.queue.push(parseFrame(this.buffer.slice(0, end)));
      this.buffer = this.buffer.slice(end + 2);
      end = this.buffer.indexOf("\n\n");
    }
  }

  async close(): Promise<void> {
    try {
      await this.reader.cancel();
    } catch {
      // sudah tertutup — tidak masalah
    }
  }
}

/** Buka stream ke /stream/token lewat HTTP asli. */
async function openStream(token: string): Promise<{
  res: Response;
  frames: SSEFrameReader;
  abort: AbortController;
}> {
  const abort = new AbortController();
  const res = await fetch(`${base}/stream/${token}`, {
    signal: abort.signal,
  });
  expect(res.status).toBe(200);
  return { res, frames: new SSEFrameReader(res), abort };
}

async function ingest(
  token: string,
  body: string,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${base}/in/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  expect(res.status).toBe(200);
  return res.json() as Promise<{ ok: boolean; id: string }>;
}

describe("GET /stream/:token (HTTP asli + SQLite)", () => {
  test("header SSE benar di atas wire dan ingest → frame new-webhook", async () => {
    const { res, frames } = await openStream("wire");
    try {
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("x-accel-buffering")).toBe("no");

      const created = await ingest("wire", JSON.stringify({ hello: "world" }));

      const frame = await frames.next((f) => f.event === "new-webhook");
      expect(frame.id).toBe(created.id);
      const payload = JSON.parse(frame.data) as Record<string, unknown>;
      expect(payload).toMatchObject({
        id: created.id,
        token: "wire",
        method: "POST",
        path: "/in/wire",
        query: "",
        contentType: "application/json",
        bodySize: 17,
      });
      // Ringkasan saja — body & headers tidak ikut lewat SSE.
      expect(payload).not.toHaveProperty("body");
      expect(payload).not.toHaveProperty("headers");
    } finally {
      await frames.close();
    }
  });

  test("event token lain tidak bocor ke stream (filter per token)", async () => {
    const { frames } = await openStream("alpha");

    try {
      await ingest("beta", JSON.stringify({ secret: 1 }));
      // 400ms cukup dengan heartbeat baseline; frame "ping" diabaikan predicate.
      await expect(
        frames.next((f) => f.event === "new-webhook", 400),
      ).rejects.toThrow(/timeout/);

      const created = await ingest("alpha", JSON.stringify({ secret: 2 }));
      const frame = await frames.next((f) => f.event === "new-webhook");
      expect(frame.id).toBe(created.id);
      expect((JSON.parse(frame.data) as { token: string }).token).toBe("alpha");
    } finally {
      await frames.close();
    }
  });

  test("heartbeat ping tiba lewat koneksi HTTP (stream tidak digantung adapter)", async () => {
    process.env.STREAM_HEARTBEAT_MS = "150";
    const { frames } = await openStream("hb");
    try {
      const frame = await frames.next((f) => f.event === "ping", 3000);
      expect(frame.data).toBe("");
    } finally {
      await frames.close();
    }
  });

  test("dua klien paralel sama-sama menerima event yang sama", async () => {
    const first = await openStream("fan");
    const second = await openStream("fan");
    const before = newWebhookSubscriberCount();
    expect(before).toBeGreaterThanOrEqual(2);
    try {
      const created = await ingest("fan", JSON.stringify({ n: 1 }));
      const frameA = await first.frames.next((f) => f.event === "new-webhook");
      const frameB = await second.frames.next((f) => f.event === "new-webhook");
      expect(frameA.id).toBe(created.id);
      expect(frameB.id).toBe(created.id);
    } finally {
      await first.frames.close();
      await second.frames.close();
    }
  });

  test("client disconnect membersihkan subscriber dan server tetap sehat", async () => {
    // Cleanup di server terjadi async (beberapa ms setelah socket close) —
    // tunggu semua stream dari test sebelumnya benar-benar lepas dulu.
    await vi.waitFor(
      () => {
        expect(newWebhookSubscriberCount()).toBe(0);
      },
      { timeout: 3000 },
    );

    const { frames, abort } = await openStream("gone");
    expect(newWebhookSubscriberCount()).toBe(1);

    try {
      abort.abort();
      await frames.close();

      await vi.waitFor(
        () => {
          expect(newWebhookSubscriberCount()).toBe(0);
        },
        { timeout: 3000 },
      );

      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true });
    } finally {
      await frames.close();
    }
  });
});
