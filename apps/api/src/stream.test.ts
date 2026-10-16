import { testClient } from "hono/testing";
import { describe, expect, test, vi } from "vitest";
import { app } from "./app.ts";
import { newWebhookSubscriberCount } from "./bus.ts";

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

/**
 * Pembaca frame SSE untuk test: menangani chunk yang terbelah di tengah frame,
 * antrian frame yang belum cocok, dan timeout tunggu.
 *
 * Satu reader per Response (body Stream hanya bisa di-lock satu reader).
 */
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

  /**
   * Frame berikutnya yang cocok dengan predicate.
   * Melempar Error ber-`timeout` bila dalam `timeoutMs` tidak ada yang cocok.
   */
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
    // Satu promise read dipakai bersama — boleh ada satu read yang menggantung
    // selama timeout, read berikutnya tidak boleh membuka read kedua (error lock).
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

  /** Batalkan stream → di server memicu onAbort + cleanup subscriber. */
  async close(): Promise<void> {
    try {
      await this.reader.cancel();
    } catch {
      // sudah tertutup — tidak masalah
    }
  }
}

const client = testClient(app);

describe("GET /stream/:token via testClient (in-process)", () => {
  test("membalas 200 dengan header SSE yang benar", async () => {
    const res = await client.stream[":token"].$get({
      param: { token: "test" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    // Wajib untuk @hono/node-server v2 — matikan buffering proxy.
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("transfer-encoding")).toBe("chunked");
    await new SSEFrameReader(res).close();
  });

  test("token tidak valid → 400 + issues Zod", async () => {
    const res = await client.stream[":token"].$get({
      param: { token: "bad token" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      issues: { path: string[] }[];
    };
    expect(body.error).toBe("invalid path parameter");
    expect(body.issues[0]?.path).toEqual(["token"]);
  });

  test("heartbeat ping datang sesuai STREAM_HEARTBEAT_MS", async () => {
    // Route membaca env per request, jadi override ini selalu tepat waktu.
    process.env.STREAM_HEARTBEAT_MS = "120";
    const res = await client.stream[":token"].$get({
      param: { token: "hb" },
    });
    const frames = new SSEFrameReader(res);
    try {
      const frame = await frames.next((f) => f.event === "ping");
      expect(frame.data).toBe("");
    } finally {
      await frames.close();
    }
  });

  test("menutup stream melepas subscriber kembali ke count awal (no leak)", async () => {
    const before = newWebhookSubscriberCount();
    const res = await client.stream[":token"].$get({
      param: { token: "leak" },
    });
    expect(newWebhookSubscriberCount()).toBe(before + 1);

    await new SSEFrameReader(res).close();

    await vi.waitFor(() => {
      expect(newWebhookSubscriberCount()).toBe(before);
    });
  });
});
