# Panduan Fase 3: Real-Time SSE Streaming (`/api/stream/[sessionId]`)

**Target:** endpoint streaming Server-Sent Events (SSE) yang langsung mendorong setiap webhook baru dari Redis ke terminal/browser, dengan heartbeat 15 detik dan cleanup saat koneksi ditutup.

## 0. Catatan Versi 2026 (Wajib)

Project memakai **Next.js 16.4.2** dengan `cacheComponents: true`.

- **Jangan** tulis `export const dynamic = "force-dynamic"` di Route Handler. Build akan gagal:
  `Route segment config "dynamic" is not compatible with nextConfig.cacheComponents`.
- Route Handler `GET` yang mengakses data runtime (mis. `request.signal`) otomatis berjalan saat request. Tidak perlu config tambahan.
- **Jangan** gunakan `export const runtime = 'edge'`. Edge Runtime sudah deprecated di Next.js 16.3+.
- Upstash Redis REST mendukung `SUBSCRIBE` lewat SSE. SDK `@upstash/redis` menyediakannya via `redis.subscribe(channel)` yang mengembalikan `Subscriber`. Pakai ini, **bukan** polling manual, agar event benar-benar instan.

---

## 1. Buat Helper SSE

**File baru:** `src/lib/sse.ts`

Tulis kode berikut:

```ts
const encoder = new TextEncoder();

/** Encode payload menjadi frame Server-Sent Event. */
export function sseEvent(data: unknown, event?: string): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const lines = event ? [`event: ${event}`, `data: ${payload}`] : [`data: ${payload}`];
  return encoder.encode(`${lines.join("\n")}\n\n`);
}

/** Komentar keep-alive agar proxy/browser tidak memutus koneksi. */
export function sseHeartbeat(): Uint8Array {
  return encoder.encode(`: heartbeat ${Date.now()}\n\n`);
}
```

**Peran (SRP):** semua format SSE dikumpulkan di satu file. Route Handler tidak perlu tahu detail encoding.

---

## 2. Buat Route Handler SSE

**File baru:** `src/app/api/stream/[sessionId]/route.ts`

Tulis kode berikut:

```ts
import { getRedisClient } from "@/lib/redis";
import { eventChannel } from "@/lib/webhook";
import { isValidSessionId } from "@/lib/session";
import { sseEvent, sseHeartbeat } from "@/lib/sse";

const HEARTBEAT_INTERVAL_MS = 15_000;

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { sessionId } = await params;

  if (!isValidSessionId(sessionId)) {
    return Response.json(
      { success: false, error: "Invalid sessionId" },
      { status: 400 },
    );
  }

  let subscriber: ReturnType<ReturnType<typeof getRedisClient>["subscribe"]>;
  try {
    subscriber = getRedisClient().subscribe(eventChannel(sessionId));
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Redis unavailable",
      },
      { status: 503 },
    );
  }

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    subscriber.removeAllListeners();
    void subscriber.unsubscribe();
  };

  const stream = new ReadableStream({
    start(controller) {
      const closeStream = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Stream sudah ditutup client.
        }
      };

      controller.enqueue(sseEvent({ type: "connected", sessionId }, "ready"));

      subscriber.on("message", ({ message }) => {
        if (closed) return;
        try {
          controller.enqueue(sseEvent(message, "webhook"));
        } catch {
          closeStream();
        }
      });

      subscriber.on("error", closeStream);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(sseHeartbeat());
        } catch {
          closeStream();
        }
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", closeStream, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

**Kenapa begini?**
- `eventChannel(sessionId)` adalah channel yang sama yang di-`PUBLISH` Fase 2. Jadi tidak ada mapping tambahan.
- Event `ready` dikirim lebih dulu supaya `curl -N` langsung menampilkan output.
- Heartbeat 15 detik mencegah koneksi diputus proxy/browser.
- `cleanup()` dipanggil saat client abort (`request.signal`) atau stream di-cancel, lalu `unsubscribe()` mencegah memory leak.

---

## 3. Verifikasi CLI

### 3.1 Lint

```bash
npm run lint
```

**Yang muncul:** command selesai tanpa error.

```text
> temp-app@0.1.0 lint
> eslint
```

### 3.2 Build

```bash
npm run build
```

**Yang muncul:** build sukses dan route stream terdaftar sebagai dinamis (`ƒ`):

```text
Route (app)
┌ ○ /
├ ○ /_not-found
├   /[sessionId]
│ └ ◐ /[sessionId]
├ ƒ /api/catch/[sessionId]
├ ƒ /api/health
└ ƒ /api/stream/[sessionId]
```

Jika muncul error `dynamic is not compatible with cacheComponents`, hapus `export const dynamic` dari file route.

### 3.3 Jalankan dev server

Terminal 1:

```bash
npm run dev
```

**Yang muncul:** server siap di port 3000 (atau port lain jika 3000 terpakai):

```text
▲ Next.js 16.4.2 (Turbopack)
- Local: http://localhost:3000
```

### 3.4 Buka stream

Terminal 2:

```bash
curl -N http://localhost:3000/api/stream/test-session
```

**Yang muncul:** koneksi tetap terbuka dan langsung menerima event `ready`:

```text
event: ready
data: {"type":"connected","sessionId":"test-session"}

: heartbeat 1792997872342
```

Biarkan terminal ini berjalan. Setiap 15 detik akan muncul baris `: heartbeat ...`.

### 3.5 Kirim webhook baru

Terminal 3:

```bash
curl -i -X POST "http://localhost:3000/api/catch/test-session?source=sse" \
  -H "Content-Type: application/json" \
  -d '{"hello":"stream"}'
```

**Yang muncul di Terminal 3:** `200 OK` dengan `{"success":true,"id":"<uuid>"}`.

**Yang muncul seketika di Terminal 2:** event `webhook` berisi payload lengkap:

```text
event: webhook
data: {"id":"<uuid>","sessionId":"test-session","method":"POST","url":"http://localhost:3000/api/catch/test-session?source=sse","path":"/api/catch/test-session","headers":{...},"queryParams":{"source":"sse"},"body":"{\"hello\":\"stream\"}","contentType":"application/json","clientIp":"::1","timestamp":1792997872342}
```

### 3.6 Uji session tidak valid

Terminal 2 (setelah menutup stream sebelumnya dengan `Ctrl+C`):

```bash
curl -i http://localhost:3000/api/stream/bad
```

**Yang muncul:** `400 Bad Request`:

```text
{"success":false,"error":"Invalid sessionId"}
```

### 3.7 Uji graceful disconnect

Tekan `Ctrl+C` di Terminal 2. Stream ditutup. Di log dev server (Terminal 1) akan terlihat request stream selesai. Tidak ada error atau listener yang tertinggal.

---

## 4. Ringkasan Implementasi

| Prinsip | Penerapan |
|---|---|
| **SRP** | `src/lib/sse.ts` khusus format SSE. Route Handler khusus validasi + lifecycle stream. |
| **DRY** | Memakai ulang `eventChannel()` dan `getRedisClient()` dari Fase 2. |
| **KISS** | Tanpa dependency baru; `redis.subscribe()` sudah bawaan `@upstash/redis`. |
| **Realtime** | `SUBSCRIBE` Upstash REST memakai SSE, jadi event terkirim seketika saat `PUBLISH` Fase 2. |
| **Heartbeat** | Komentar `: heartbeat` setiap 15 detik. |
| **Cleanup** | `unsubscribe()` + `removeAllListeners()` + `clearInterval()` saat abort/cancel. |
| **Error** | Session invalid → `400`; Redis belum dikonfigurasi → `503`. |

---

## 5. Selesai

Fase 3 selesai jika:

- `npm run lint` bersih.
- `npm run build` sukses dan `/api/stream/[sessionId]` muncul sebagai `ƒ`.
- `curl -N` membuka koneksi dan menampilkan event `ready`.
- Webhook baru dari Fase 2 langsung muncul sebagai event `webhook` di terminal stream.
- Heartbeat muncul tiap 15 detik.
- `Ctrl+C` menutup stream tanpa error.

Lanjut ke **Fase 4: Inspector Web Dashboard & UI Components**.
