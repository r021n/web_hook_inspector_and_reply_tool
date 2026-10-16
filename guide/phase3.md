# Panduan Fase 3 — SSE Streaming Endpoint + Vitest Setup

> Panduan ini dibuat berdasarkan pengerjaan nyata fase ini. Seluruh langkah sudah
> dijalankan dan diverifikasi pada mesin ini: lint ✅, typecheck ✅, 41 test ✅
> (unit + testClient + integration), serta verifikasi `curl` SSE end-to-end ✅
> (event masuk, heartbeat ping di detik ke-15 & ke-30, stream hidup 40 detik).
>
> Setiap langkah menjelaskan: **(1)** file apa yang harus ditulis/diedit, **(2)**
> di mana letaknya, **(3)** perintah CLI yang dijalankan, dan **(4)** output yang
> harus muncul.

---

## 0. Cakupan & Hasil Akhir Fase

| Item | Status |
| --- | --- |
| Bus internal `EventEmitter` — `apps/api/src/bus.ts` (satu instance, export fungsi) | ✅ |
| Emit `new-webhook` setelah insert sukses di `ALL /in/:token` | ✅ |
| `GET /stream/:token` — `streamSSE` + `X-Accel-Buffering: no` + heartbeat `ping` + cleanup `onAbort`/`finally` | ✅ |
| Konfigurasi heartbeat via env `STREAM_HEARTBEAT_MS` (default 15.000 ms) | ✅ |
| `apps/api/vitest.config.ts` + `vitest.config.ts` masuk `tsconfig` | ✅ |
| Route di-chaining (`new Hono().get()…`) supaya `testClient` typed | ✅ |
| Unit test bus — `bus.test.ts` (5 test) | ✅ |
| Test pertama dengan `testClient` dari `hono/testing` — `stream.test.ts` (4 test) | ✅ |
| Integration test HTTP asli — `stream.integration.test.ts` (5 test) | ✅ |

**Kriteria sukses dari `project.md` dan buktinya:**

1. `curl -N localhost:3000/stream/test` → tampil SSE event saat webhook ditembak →
   frame `event: new-webhook` muncul seketika (Langkah 10).
2. Stream tetap hidup setelah 30+ detik (heartbeat bekerja) → ping muncul di
   detik **±15** dan **±30**, koneksi baru ditutup oleh `--max-time` di detik 40,
   bukan oleh server (Langkah 10).
3. `npm test` menjalankan test SSE pertama dengan sukses →
   `Test Files 9 passed (9)` / `Tests 41 passed (41)` (Langkah 9).

---

## 1. Prasyarat & State Repo

```powershell
node -v   # v24.20.0   (diketahui saat panduan dibuat)
npm -v    # 11.19.0
```

Panduan Fase 1 & 2 sudah beres: monorepo, Hono + `@hono/node-server` v2, endpoint
`/health`, ingest `ALL /in/:token`, list/detail `GET /hooks/...`, Drizzle +
SQLite, Biome, dan test Fase 1–2 (27 test).

### 1a. State awal repo (baca dulu — penting!)

Repo ini sudah menyediakan **file test Fase 3** (`bus.test.ts`,
`stream.test.ts`, `stream.integration.test.ts`) dan **`vitest.config.ts`** —
dibuat saat panduan ini disusun dan **tidak di-revert**. Kodenya (bus, route
`/stream`, emit) sendiri BELUM ada. Karena itu sebelum mengerjakan langkah
berikut, keadaan ini adalah **NORMAL**:

```powershell
npm run typecheck
```

```text
src/bus.test.ts(7,8): error TS2307: Cannot find module './bus.ts' or its corresponding type declarations.
src/bus.test.ts(26,39): error TS7006: Parameter 'event' implicitly has an 'any' type.
src/stream.integration.test.ts(11,43): error TS2307: Cannot find module './bus.ts' or its corresponding type declarations.
src/stream.test.ts(4,43): error TS2307: Cannot find module './bus.ts' or its corresponding type declarations.
src/stream.test.ts(113,23): error TS18046: 'client' is of type 'unknown'.
```

(potongan — total ada 11 baris error: 4× `TS7006` untuk callback `event` di
`bus.test.ts`, dan 4× `TS18046` untuk tiap akses `client.` di `stream.test.ts`)

```powershell
npm test
```

```text
Test Files  3 failed | 6 passed (9)
     Tests  27 passed (27)
```

Semua error di atas hilang setelah **Langkah 2–6** selesai (bus.ts + route +
mount). Karena file test sudah tersedia, Langkah 8 cukup **memverifikasi isinya**
(bila file hilang/berubah, tulis ulang persis kode di Langkah 8).

> `npm run lint` tetap hijau sejak awal (Biome tidak melakukan resolusi modul).

### 1b. Dependency — TIDAK ada paket baru

Fase 3 **tidak menambah dependency apa pun**. Verifikasi:

```powershell
npm ls vitest --all
```

```text
webhook-inspector@0.1.0 D:\coding\web\web_hook_inspector_and_reply_tool
└─┬ @whi/api@0.0.0 -> .\apps\api
  └── vitest@5.0.3
```

> Vitest sudah terpasang sejak Fase 1/2 (project.md menempatkan "Install
> Vitest" di Fase 3, tetapi kenyataannya sudah ada). Bila suatu saat belum ada:
> `npm install -D vitest -w apps/api` (dari root) → output hampir selalu
> `up to date, audited 69 packages in 6s` + `found 0 vulnerabilities`
> (peringatan `npm warn install-scripts … esbuild` muncul dari `drizzle-kit`,
> bukan error).

Versi kunci yang terpasang (semua sudah memenuhi syarat `project.md`):

| Paket | Versi terpasang | Syarat |
| --- | --- | --- |
| `hono` | `4.13.13` | ≥ 4.12.4 (patch CVE-2026-29085) ✅ |
| `@hono/node-server` | `2.1.3` | v2 ✅ |
| `vitest` | `5.0.3` | butuh Node ≥22.12 ✅ |
| `@biomejs/biome` | `2.5.15` | — |

### 1c. Catatan riset dokumentasi (2026) — baca sebelum mengubah kode

- **CVE-2026-29085 (GHSA-p6xx-57qc-3wxr)** — "SSE Control Field Injection via
  CR/LF in `writeSSE()`". Hono **< 4.12.4** rentan: field `event`/`id`/`retry`
  tidak divalidasi terhadap `\r`/`\n`, sehingga bisa menyuntik field SSE
  tambahan. Patch di 4.12.4 (source `sse.js` kini melempar error bila `event`/`id`
  mengandung CR/LF). **Kita terpasang 4.13.13 — aman, jangan turunkan hono.**
- **`streamSSE(c, cb, onError?)` dari `hono/streaming`** otomatis set header:
  `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
  `Connection: keep-alive`, `Transfer-Encoding: chunked`. Setelah callback `cb`
  selesai, stream **ditutup otomatis** oleh internal `run()` (baca juga `onError`
  opsional — tanpa `onError`, error callback hanya `console.error`).
- **Fakta source `hono@4.13.13`** (dicek langsung di
  `node_modules/hono/dist/utils/stream.js`):
  `stream.sleep(ms)` = `setTimeout` polos — **TIDAK** otomatis batal saat abort;
  `stream.write()` **menelan** error write; `stream.onAbort(listener)` dipanggil
  saat response body di-cancel / klien putus. Karena itu pola yang dipakai di
  Langkah 5 adalah **Promise + `onAbort` + `setInterval` + `finally`** (bukan
  `while (!aborted) await sleep(...)` yang memboroskan timer dan tidak responsif).
- **`@hono/node-server` v2 & SSE** — adapter ini bisa **membungkus response kecil
  lalu menambah `Content-Length`**, yang membuat `PROTOCOL_ERROR` HTTP/2
  (honojs/node-server#266, honojs/node-server#1619). Solusinya: response SSE
  membawa `Transfer-Encoding: chunked` (sudah otomatis dari `streamSSE`; changelog
  node-server: *"Skip content-length assignment when transfer-encoding is chunked"*)
  **plus** `X-Accel-Buffering: no` yang kita set sendiri (mematikan buffering
  nginx/proxy). Verifikasi dengan `curl -i` ada di Langkah 10 — response memang
  `chunked` dan **tanpa** `Content-Length`.
- **Heartbeat 15 detik** — riset `server-sent-events.com`: interval harus
  **≤ ½ dari idle timeout terkecil** di jalur koneksi. nginx
  (`proxy_read_timeout` 60 s), AWS ALB (idle timeout default 60 s), NAT korporat
  (30–90 s) → **15 s** adalah nilai paling umum dan aman (membersihkan timeout
  30 s dengan margin). Heartbeat dikirim sebagai **named event** (`event: ping`,
  bukan komentar `: ping`) supaya klien `EventSource` bisa
  `addEventListener("ping", …)` — komentar SSE tidak pernah sampai ke JS.
- **`testClient` dari `hono/testing` hanya typed bila route di-CHAINING.**
  Kutipan dokumentasi Hono (Testing Helper): *"you must define your routes using
  chained methods directly on the `Hono` instance… If you define routes
  separately after creating the Hono instance… the `testClient` will not have
  the necessary type information."* → karena itu `app.ts` dan kedua router
  ditulis gaya `new Hono().get(…).get(…)`.
- **Vitest 5**: config file `vitest.config.ts` memakai `defineConfig` dari
  `vitest/config` (bukan `vite`). Opsi `test.env` **sudah aktif sebelum file test
  di-import** (diverifikasi dengan probe saat panduan dibuat) — jadi baseline
  `STREAM_HEARTBEAT_MS` di `vitest.config.ts` berlaku untuk semua test.
- **`EventEmitter.setMaxListeners(0)`** — default Node memperingatkan di 10
  listener; setiap koneksi SSE menambah 1 listener, jadi wajib dibuat tanpa batas.

---

## 2. Struktur Folder Hasil Akhir

```
web_hook_inspector_and_reply_tool/
├── package.json                ← TIDAK berubah di Fase 3
├── package-lock.json           ← TIDAK berubah
├── guide/
│   ├── phase1.md
│   ├── phase2.md
│   └── phase3.md               ← file panduan ini
└── apps/
    └── api/                    ← SEMUA kerjaan Fase 3 ada di sini
        ├── package.json        ← TIDAK berubah (vitest sudah ada)
        ├── tsconfig.json       ← edit di Langkah 7 (include vitest.config.ts)
        ├── vitest.config.ts    ← buat di Langkah 7 (SUDAH ADA di repo)
        ├── drizzle.config.ts   ← tidak berubah
        └── src/
            ├── app.ts                      ← tulis ulang di Langkah 6
            ├── config.ts                   ← edit di Langkah 3 (tambah heartbeat)
            ├── bus.ts                      ← buat di Langkah 2
            ├── bus.test.ts                 ← buat di Langkah 8 (SUDAH ADA)
            ├── stream.test.ts              ← buat di Langkah 8 (SUDAH ADA)
            ├── stream.integration.test.ts  ← buat di Langkah 8 (SUDAH ADA)
            ├── db/ (Fase 2, tidak berubah)
            └── routes/
                ├── webhooks.ts             ← edit di Langkah 4
                └── stream.ts               ← buat di Langkah 5
```

> Jalankan semua perintah npm **dari root folder project**
> (`D:\coding\web\web_hook_inspector_and_reply_tool`), kecuali disebutkan lain.

---

## 3. Langkah 1 — Verifikasi Vitest (tanpa instalasi baru)

**Jalankan perintah** (dari root):

```powershell
npm ls vitest --all
```

**Output yang muncul:**

```text
webhook-inspector@0.1.0 D:\coding\web\web_hook_inspector_and_reply_tool
└─┬ @whi/api@0.0.0 -> .\apps\api
  └── vitest@5.0.3
```

Sudah ada → lanjut. Belum ada → `npm install -D vitest -w apps/api`.

---

## 4. Langkah 2 — Bus internal (EventEmitter)

**Tulis file:** `apps/api/src/bus.ts`

```ts
import { EventEmitter } from "node:events";
import type { RequestSummary } from "./validation.ts";

/**
 * Payload event "new-webhook": ringkasan request (tanpa headers/body, supaya
 * ringan untuk SSE) plus token channel supaya listener bisa mem-filter.
 */
export type NewWebhookEvent = RequestSummary & { token: string };

const NEW_WEBHOOK = "new-webhook";

/**
 * Satu instance EventEmitter untuk seluruh proses (satu instance saja —
 * di-export sebagai fungsi, bukan class, supaya tidak ada dua bus).
 *
 * setMaxListeners(0) = tanpa batas: setiap koneksi SSE menambah satu listener,
 * tanpa ini Node membuang warning "MaxListenersExceededWarning" di 10 klien.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Dipanggil endpoint ingest SETELAH insert sukses. */
export function emitNewWebhook(event: NewWebhookEvent): void {
  bus.emit(NEW_WEBHOOK, event);
}

/**
 * Subscribe ke event new-webhook. Mengembalikan fungsi unsubscribe yang idempoten
 * (aman dipanggil dua kali) — dipakai di cleanup `stream.onAbort()` + `finally`.
 */
export function onNewWebhook(
  listener: (event: NewWebhookEvent) => void,
): () => void {
  bus.on(NEW_WEBHOOK, listener);
  return () => {
    bus.off(NEW_WEBHOOK, listener);
  };
}

/** Jumlah subscriber aktif — dipakai test untuk membuktikan cleanup benar-benar jalan. */
export function newWebhookSubscriberCount(): number {
  return bus.listenerCount(NEW_WEBHOOK);
}
```

Keputusan desain:

| Hal | Alasan |
| --- | --- |
| Satu `EventEmitter` module-level + fungsi, bukan class | `project.md`: "satu instance, export dari module terpisah" — mustahil ada dua bus |
| Payload = **ringkasan** (`RequestSummary` + `token`), bukan `RequestDetail` | body base64 bisa ratusan KB — jangan diborong ke SSE; detail tetap di `GET /hooks/:token/:id` |
| `onNewWebhook` mengembalikan fungsi unsubscribe | cleanup di route tinggal `unsubscribe()`; `bus.off` idempoten (aman dipanggil 2×: `onAbort` + `finally`) |
| `newWebhookSubscriberCount()` | test membuktikan tidak ada listener yang bocor setelah klien disconnect (anti memory leak) |

---

## 5. Langkah 3 — Konfigurasi heartbeat (`config.ts`)

**Edit file:** `apps/api/src/config.ts` — tambahkan **di akhir file**
(setelah `export const PORT = resolvePort(process.env);`):

```ts
/** Default heartbeat SSE: 15 detik (≤ ½ dari idle timeout 60 detik di nginx/ALB). */
export const DEFAULT_HEARTBEAT_MS = 15_000;

/**
 * Interval heartbeat `GET /stream/:token` dalam milidetik.
 *
 * Dibaca PER REQUEST (bukan saat module load) supaya test bisa meng-set
 * `STREAM_HEARTBEAT_MS` di top-level file test, sama seperti pola
 * `DB_FILE_NAME` di Fase 2.
 */
export function resolveHeartbeatMs(
  env: Record<string, string | undefined>,
): number {
  const raw = env.STREAM_HEARTBEAT_MS;
  if (raw === undefined || raw === "") {
    return DEFAULT_HEARTBEAT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_HEARTBEAT_MS;
  }
  return parsed;
}
```

Kenapa dibaca **per request** (bukan konstanta saat import): import module terjadi
sebelum top-level file test dieksekusi — kalau dibuat konstanta, test yang meng-set
`process.env.STREAM_HEARTBEAT_MS` akan terlambat. Pola ini sama persis dengan
`resolveDbPath()` Fase 2.

---

## 6. Langkah 4 — Emit setelah insert + chaining router (`webhooks.ts`)

**Edit file:** `apps/api/src/routes/webhooks.ts` — tiga perubahan:

### 4a. Tambah import bus (baris ke-3 import relatif)

```ts
import { emitNewWebhook } from "../bus.ts";
```

### 4b. Sisipkan blok emit **setelah insert, sebelum `return`**

Cari blok ini (di handler `ALL /in/:token`):

```ts
    await getDb()
      .insert(webhookRequests)
      .values({ ...captured, headers: JSON.stringify(captured.headers) });

    return c.json({ ok: true, id: captured.id });
```

ganti menjadi:

```ts
    await getDb()
      .insert(webhookRequests)
      .values({ ...captured, headers: JSON.stringify(captured.headers) });

    // Fase 3: setelah insert sukses, umumkan ke bus internal → SSE stream.
    emitNewWebhook({
      id: captured.id,
      token: captured.token,
      method: captured.method,
      path: captured.path,
      query: captured.query,
      contentType: captured.contentType,
      bodySize: captured.bodySize,
      receivedAt: captured.receivedAt,
    });

    return c.json({ ok: true, id: captured.id });
```

Emit **hanya setelah insert sukses** — kalau insert melempar error, dashboard
tidak boleh menerima event palsu.

### 4c. Ubah deklarasi router menjadi CHAINING

PENTING (syarat `testClient` typed, lihat catatan riset 1c). Ganti:

```ts
export const webhooksRouter = new Hono();
```

```ts
webhooksRouter.all(
  "/in/:token",
  paramValidator(tokenParamSchema),
  async (c) => {
```

```ts
    return c.json({ ok: true, id: captured.id });
  },
);
```

menjadi (perhatikan: `export` pindah ke baris pertama, `new Hono()` langsung
`.all(...)`, tiap route ditutup `)` lalu disambung `.get(` berikutnya, dan hanya
akhiran terakhir yang ditutup `;`):

```ts
export const webhooksRouter = new Hono()
  .all("/in/:token", paramValidator(tokenParamSchema), async (c) => {
    // ... isi handler TIDAK berubah ...
  })
  .get("/hooks/:token", paramValidator(tokenParamSchema), async (c) => {
    // ... isi handler TIDAK berubah ...
  })
  .get("/hooks/:token/:id", paramValidator(requestParamSchema), async (c) => {
    // ... isi handler TIDAK berubah ...
  });
```

> Cara termudah: buka file, ubah tiga baris pernyataan router di atas menjadi
> rantai seperti pola `export const webhooksRouter = new Hono()` lalu setiap
> `webhooksRouter.X(` diganti jadi `  .X(` dengan indentasi 2 spasi, hapus `;`
> di semua akhir kecuali yang terakhir. Lalu jalankan `npm run lint` untuk
> merapikan otomatis. **Isi setiap handler tidak berubah sama sekali.**

Tambahkan juga komentar ini tepat di atas `export const webhooksRouter`:

```ts
// Route didefinisikan CHAINING di atas instance Hono (bukan pernyataan terpisah)
// supaya tipe route mengalir ke testClient() dari hono/testing — lihat dokumentasi
// Hono "Testing Helper": "you must define your routes using chained methods".
```

---

## 7. Langkah 5 — Route SSE (`GET /stream/:token`)

**Tulis file:** `apps/api/src/routes/stream.ts`

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { onNewWebhook } from "../bus.ts";
import { resolveHeartbeatMs } from "../config.ts";
import { paramValidator, tokenParamSchema } from "../validation.ts";

// Chaining (lihat catatan serupa di routes/webhooks.ts) → testClient tetap typed.
export const streamRouter = new Hono().get(
  "/stream/:token",
  paramValidator(tokenParamSchema),
  (c) => {
    const token = c.req.param("token");
    // Wajib untuk @hono/node-server v2 & nginx: matikan buffering proxy,
    // supaya frame SSE diteruskan apa adanya (bukan menumpuk di proxy).
    c.header("X-Accel-Buffering", "no");
    // Dibaca per request → test bisa memperpendek interval via env.
    const heartbeatMs = resolveHeartbeatMs(process.env);

    return streamSSE(c, async (stream) => {
      // 1. Forward event bus → klien SSE (hanya untuk token yang sama).
      const unsubscribe = onNewWebhook((event) => {
        if (event.token !== token) {
          return;
        }
        void stream
          .writeSSE({
            event: "new-webhook",
            id: event.id,
            data: JSON.stringify(event),
          })
          .catch(() => {
            // write gagal (klien sudah pergi) → biarkan; cleanup di bawah.
          });
      });

      // 2. Heartbeat "ping" tiap 15 detik → reset idle timeout proxy/NAT.
      const heartbeat = setInterval(() => {
        if (stream.aborted) {
          return;
        }
        void stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
      }, heartbeatMs);

      // 3. Cleanup ganda: onAbort (klien disconnect) + finally (normal/throw).
      stream.onAbort(unsubscribe);
      try {
        // Tahan callback sampai stream di-abort: streamSSE menutup stream
        // begitu callback selesai, jadi callback tidak boleh return duluan.
        await new Promise<void>((resolve) => {
          stream.onAbort(resolve);
          if (stream.aborted) {
            resolve();
          }
        });
      } finally {
        clearInterval(heartbeat);
        unsubscribe();
      }
    });
  },
);
```

Baris kritis dan alasannya:

| Baris | Alasan |
| --- | --- |
| `c.header("X-Accel-Buffering", "no")` | Ditetapkan `project.md` (wajib `@hono/node-server` v2) + mematikan buffering nginx. Diset **sebelum** `streamSSE` supaya ikut ke response |
| `paramValidator(tokenParamSchema)` | Token invalid → `400` seragam dengan endpoint lain, sebelum subscribe apa pun |
| filter `event.token !== token` | Satu bus untuk semua channel — stream `A` tidak boleh menerima event token `B` |
| `id: event.id` | Id request jadi `id` frame SSE → mendukung `Last-Event-ID` bila klien reconnect |
| `.catch(() => {})` | `write()` menelan error socket, tapi path lain bisa reject — cegah *unhandled rejection* |
| `setInterval` + cek `stream.aborted` | Heartbeat berdiri sendiri; cek `aborted` supaya tidak menulis ke stream mati |
| `await new Promise(resolve => stream.onAbort(resolve))` | **Menahan callback** — `streamSSE` menutup stream begitu callback return (fakta source hono), jadi callback harus menunggu sampai klien putus |
| `stream.onAbort(unsubscribe)` **+** `finally { clearInterval; unsubscribe() }` | Dua jaring pengaman sesuai spek `project.md`: `onAbort` menangani disconnect, `finally` menangani normal-nya/throw — keduanya idempoten |
| `resolveHeartbeatMs(process.env)` per request | Test meng-override `STREAM_HEARTBEAT_MS` per test case |

---

## 8. Langkah 6 — Mount route di `apps/api/src/app.ts`

**Tulis ulang isi** `apps/api/src/app.ts`:

```ts
import type { HealthResponse } from "@whi/shared";
import { Hono } from "hono";
import { streamRouter } from "./routes/stream.ts";
import { webhooksRouter } from "./routes/webhooks.ts";

// Dibuat CHAINING (new Hono().get().route()...) supaya tipe semua route mengalir
// ke testClient() di hono/testing — kalau ditulis pernyataan terpisah, tipe route
// hilang dan testClient tidak bisa di-autocomplete (dokumentasi Hono "Testing Helper").
export const app = new Hono()
  .get("/health", (c) => c.json({ ok: true } satisfies HealthResponse))
  .route("/", webhooksRouter)
  .route("/", streamRouter);
```

> Setelah langkah ini, `npm run typecheck` dan `npm test` kembali hijau
> (lihat Langkah 9). Bila masih merah, cek Troubleshooting.

---

## 9. Langkah 7 — `vitest.config.ts` + `tsconfig.json`

### 9a. **Tulis file:** `apps/api/vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Test SSE menunggu frame masuk dan beforeAll menjalankan drizzle-kit push
    // (spawn proses) — beri napas di atas default 5s/10s.
    testTimeout: 10_000,
    hookTimeout: 30_000,
    // Baseline heartbeat cepat supaya tidak ada test yang harus menunggu 15 detik.
    // Test yang butuh nilai lain meng-override process.env per test; route membaca
    // STREAM_HEARTBEAT_MS per request, jadi override selalu tepat waktu.
    env: {
      STREAM_HEARTBEAT_MS: "200",
    },
  },
});
```

- `test.env` diterapkan **sebelum** file test di-import (diverifikasi dengan probe
  saat panduan dibuat) → heartbeat baseline 200 ms berlaku untuk semua test tanpa
  menunggu 15 detik.
- `testTimeout`/`hookTimeout` dinaikkan: integration test menunggu frame SSE dan
  `beforeAll` menjalankan `drizzle-kit push` (spawn proses).

### 9b. **Edit** `apps/api/tsconfig.json`

```json
"include": ["src/**/*.ts", "drizzle.config.ts", "vitest.config.ts"]
```

Supaya `vitest.config.ts` ikut di-typecheck.

---

## 10. Langkah 8 — Tiga file test

> **Catatan:** ketiga file ini **sudah ada** di repo (dibuat saat panduan
> disusun) bersama `vitest.config.ts`. Buka dan cocokkan isinya; tulis ulang hanya
> bila hilang/berubah. Kode di bawah 100% sama dengan yang dijalankan.

### 10a. **Tulis file:** `apps/api/src/bus.test.ts` (unit test)

```ts
import { describe, expect, test } from "vitest";
import {
  emitNewWebhook,
  type NewWebhookEvent,
  newWebhookSubscriberCount,
  onNewWebhook,
} from "./bus.ts";

function makeEvent(overrides: Partial<NewWebhookEvent> = {}): NewWebhookEvent {
  return {
    id: "e3366c4b-d81d-46eb-8992-97b9809307ac",
    token: "test",
    method: "POST",
    path: "/in/test",
    query: "",
    contentType: "application/json",
    bodySize: 13,
    receivedAt: 1791269374858,
    ...overrides,
  };
}

describe("bus internal new-webhook", () => {
  test("subscriber menerima payload yang di-emit", () => {
    const received: NewWebhookEvent[] = [];
    const unsubscribe = onNewWebhook((event) => {
      received.push(event);
    });
    try {
      emitNewWebhook(makeEvent());
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(makeEvent());
    } finally {
      unsubscribe();
    }
  });

  test("unsubscribe berhenti menerima event berikutnya", () => {
    const received: NewWebhookEvent[] = [];
    const unsubscribe = onNewWebhook((event) => {
      received.push(event);
    });

    emitNewWebhook(makeEvent());
    unsubscribe();
    emitNewWebhook(makeEvent());

    expect(received).toHaveLength(1);
  });

  test("unsubscribe idempoten — dipanggil dua kali tidak melempar error", () => {
    const unsubscribe = onNewWebhook(() => {});
    unsubscribe();
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  test("banyak subscriber (banyak klien SSE) menerima event yang sama", () => {
    const first: NewWebhookEvent[] = [];
    const second: NewWebhookEvent[] = [];
    const unsub1 = onNewWebhook((event) => {
      first.push(event);
    });
    const unsub2 = onNewWebhook((event) => {
      second.push(event);
    });
    try {
      emitNewWebhook(makeEvent({ id: "11111111-1111-4111-8111-111111111111" }));
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]?.id).toBe(second[0]?.id);
    } finally {
      unsub1();
      unsub2();
    }
  });

  test("subscriber count kembali ke nol setelah semua unsubscribe (tidak leak)", () => {
    const before = newWebhookSubscriberCount();
    const unsub1 = onNewWebhook(() => {});
    const unsub2 = onNewWebhook(() => {});
    expect(newWebhookSubscriberCount()).toBe(before + 2);
    unsub1();
    unsub2();
    expect(newWebhookSubscriberCount()).toBe(before);
    expect(before).toBe(0);
  });
});
```

### 10b. **Tulis file:** `apps/api/src/stream.test.ts` (test pertama dengan `testClient`)

```ts
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
```

Penjelasan 4 poin penting:

1. **`client.stream[":token"].$get({ param: { token } })`** — inilah yang
   dimaksud "test pertama dengan `testClient`": path, param, dan status divalidasi
   TypeScript. `client` hanya punya properti `stream` kalau route memang
   di-chaining (Langkah 4c + 6). Kalau kamu melihat `'client' is of type 'unknown'`
   atau `'stream' does not exist` → chaining/belum mount.
2. **Test ini in-process** (tanpa server HTTP, tanpa DB) — cukup untuk membuktikan
   header, validasi, heartbeat, dan cleanup. Alur lengkap ingest→DB→SSE diuji di
   file integration (Langkah 10c).
3. **`process.env.STREAM_HEARTBEAT_MS = "120"` di dalam test** aman karena route
   membaca env **per request** (Langkah 3).
4. **`SSEFrameReader`** menangani dua jebakan SSE: chunk yang terbelah di tengah
   frame (buffer + split `\n\n`) dan satu-satunya reader yang boleh mengunci body
   (`pending` dipakai bersama, tidak boleh dua `read()` bersamaan).

### 10c. **Tulis file:** `apps/api/src/stream.integration.test.ts` (integration test)

Test ini menjalankan **server HTTP sungguhan** (port acak) di atas **file DB
semenara** per-run — sama polanya dengan `webhooks.integration.test.ts`.

```ts
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
```

Keputusan desain test (hasil kegagalan → perbaikan saat pengerjaan nyata):

| Hal | Alasan |
| --- | --- |
| Helper `SSEFrameReader` **diduplikasi** di dua file | Modul bersama akan jadi "file fase 3 non-test" — tidak diikutkan di sini agar tidak ada dependensi aneh |
| `vi.waitFor(... timeout: 3000)` untuk count subscriber | Cleanup di server terjadi **async** beberapa ms setelah socket close; assert langsung = race (saat pengerjaan, assert langsung pernah gagal `expected 1 to be 3` karena listener dari test sebelumnya belum lepas) |
| `closeAllConnections()` di `afterAll` | Pencegah `server.close()` menggantung → `Hook timed out in 30000ms` kalau ada stream yang belum sempat ter-deteksi close |
| Test terakhir menghitung count dari **0** | Sekaligus membuktikan semua stream test sebelumnya ikut bersih (anti leak menyeluruh) |
| `process.env.STREAM_HEARTBEAT_MS` di-set **per test** | Test heartbeat butuh 150 ms; test lain tidak bergantung interval |

---

## 11. Langkah 9 — Typecheck, lint, dan seluruh test

**Jalankan perintah** (dari root):

```powershell
npm run typecheck
```

**Output yang muncul (tanpa baris error — `vitest.config.ts` ikut ter-typecheck):**

```text
> webhook-inspector@0.1.0 typecheck
> npm run typecheck --workspaces --if-present

> @whi/api@0.0.0 typecheck
> tsc --noEmit

> @whi/web@0.0.0 typecheck
> tsc -b

> @whi/shared@0.0.0 typecheck
> tsc --noEmit
```

```powershell
npm run lint
```

**Output (jalankan dua kali bila baru menulis file):**

```text
> webhook-inspector@0.1.0 lint
> biome check --write

Checked 39 files in 194ms. No fixes applied.
```

> Baris pertama biasanya `Fixed 3 files` (auto-format hasil tulis tangan) —
> jalankan lagi sampai `No fixes applied`.

```powershell
npm test
```

**Output yang muncul:**

```text
> webhook-inspector@0.1.0 test
> npm run test --workspaces --if-present

> @whi/api@0.0.0 test
> vitest run


 RUN  v5.0.3 D:/coding/web/web_hook_inspector_and_reply_tool/apps/api

 Test Files  9 passed (9)
      Tests  41 passed (41)
   Start at  16:43:44
   Duration  13.83s (import 55%, tests 34%, transform 10%, worker 1%)
```

Cakupan test (6 lama + 3 baru):

| File | Jenis | Yang diverifikasi |
| --- | --- | --- |
| `app.test.ts` | unit (Fase 1) | route `/health` |
| `config.test.ts` | unit (Fase 1) | `resolvePort()` |
| `health.integration.test.ts` | integration (Fase 1) | HTTP asli `/health` |
| `validation.test.ts` | unit (Fase 2) | token/id/`capturedRequestSchema` |
| `db/path.test.ts` | unit (Fase 2) | resolusi path DB |
| `webhooks.integration.test.ts` | integration (Fase 2) | ingest→list→detail,400,404, limit 50 |
| **`bus.test.ts`** | **unit (Fase 3)** | emit/subscribe/unsubscribe idempoten/multi-subscriber/count nol |
| **`stream.test.ts`** | **testClient in-process (Fase 3)** | header SSE (4 header), `400` token invalid, heartbeat `ping` via env, cleanup subscriber no-leak |
| **`stream.integration.test.ts`** | **integration (Fase 3)** | wire HTTP: header + ingest→frame, filter token, heartbeat,2 klien paralel, disconnect bersih + server sehat |

> Catatan durasi: total ±12–16 detik karena ±55% waktu dipakai startup worker
> Vitest paralel di Windows (9 file) — bukan test-nya lambat (semua test <1 dtk
> kecuali yang menunggu 400 ms). Target `<5 detik` di Fase 8 diserahkan ke
> tuning (`fileParallelism`/pool) Fase 8.

---

## 12. Langkah 10 — Jalankan server & verifikasi SSE dengan curl

**Terminal A** (dari root):

```powershell
npm run dev
```

**Output:**

```text
> webhook-inspector@0.1.0 dev
> npm run dev --workspace apps/api

> @whi/api@0.0.0 dev
> node --watch src/index.ts

[api] listening on http://localhost:3000
```

### 12a. Cek header SSE (Terminal B)

```powershell
curl -si --max-time 3 http://localhost:3000/stream/demo
```

**Output** (curl keluar sendiri dengan kode 28 setelah3 detik — itu normal,
karena stream memang tidak pernah selesai; header keluar seketika):

```text
HTTP/1.1 200 OK
cache-control: no-cache
connection: keep-alive
content-type: text/event-stream
transfer-encoding: chunked
x-accel-buffering: no
Date: Sat, 10 Oct 2026 09:41:16 GMT

curl: (28) Operation timed out after 3001 milliseconds
```

✔ 4 header SSE utama ada, `transfer-encoding: chunked` (bukan `content-length`)
— inilah yang menghindari bug buffering/`PROTOCOL_ERROR` `@hono/node-server` v2.

### 12b. Stream + tembak webhook (Terminal B & C)

**Terminal B** (biarkan jalan, jangan diutak-atik):

```powershell
curl -sN http://localhost:3000/stream/demo
```

(`-s` hanya untuk menyembunyikan progress meter `% Total` — tanpa `-s` isi
framenya sama.)

**Terminal C** — tembak webhook **saat Terminal B masih menggantung**:

```powershell
curl -s -X POST http://localhost:3000/in/demo -H "content-type: application/json" -d "{\"foo\":\"bar\"}"
```

```text
{"ok":true,"id":"52fef367-6cc1-45dd-852c-8f1681e0c31d"}
```

**Di Terminal B langsung muncul:**

```text
event: new-webhook
data: {"id":"52fef367-6cc1-45dd-852c-8f1681e0c31d","token":"demo","method":"POST","path":"/in/demo","query":"","contentType":"application/json","bodySize":13,"receivedAt":1791625276182}
id: 52fef367-6cc1-45dd-852c-8f1681e0c31d
```

Lalu **diamkan** — bukti heartbeat (diuji dengan `curl --max-time 40`, hasil
sebenarnya):

```text
(±detik 15)  event: ping
             data:

(±detik 30)  event: ping
             data:

(detik 40)   curl: (28) Operation timed out after 40009 milliseconds
```

✔ Stream **hidup 40 detik** (ditutup oleh `--max-time`, bukan oleh server) dan
ping muncul tepat ±15 detik sekali — = kriteria *"stream tetap hidup setelah
30+ detik"*.

### 12c. Bukti filter token (Terminal B/C)

**Terminal B2:**

```powershell
curl -sN http://localhost:3000/stream/other
```

**Terminal C:**

```powershell
curl -s -X POST http://localhost:3000/in/demo -d "x"
```

`/stream/other` **tidak** menerima event apa pun (kecuali `ping` berkala),
sedangkan `/stream/demo` menerima event dari `/in/demo`. Stream lain:
`/in/bad%20token` → `400`, `/stream/bad%20token` → `400` + `issues`.

Hentikan semua dengan `Ctrl+C` di Terminal A/B.

---

## 13. Kontrak API hasil Fase 3

| Method + Path | Fungsi | Sukses | Gagal |
| --- | --- | --- | --- |
| `GET /stream/:token` | SSE stream real-time per token | `200` `text/event-stream` (stream tidak pernah selesai) | `400` token tidak sah |

**Header response:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, `Transfer-Encoding: chunked`, `X-Accel-Buffering: no`.

**Jenis event:**

| `event` | `data` | `id` | Kapan |
| --- | --- | --- | --- |
| `new-webhook` | JSON ringkasan `{id, token, method, path, query, contentType, bodySize, receivedAt}` | `<uuid request>` | Setelah insert ingest sukses, **hanya** untuk stream dengan token sama |
| `ping` | string kosong | — | Setiap 15 detik (env `STREAM_HEARTBEAT_MS`) |

**Sisi klien (dipakai Fase 4):** `new-event` → refetch list; perlu
`addEventListener("ping", …)` karena `onmessage` EventSource hanya memicu untuk
event **tanpa** nama. Contoh: `new EventSource("http://localhost:3000/stream/demo")`.

**Endpoint lama tidak berubah** — ingest/list/detail tetap sama seperti Fase 2
(hanya menambah emit internal).

---

## 14. Referensi dokumentasi (dipakai untuk panduan ini)

| Topik | Sumber |
| --- | --- |
| `streamSSE` + `streamText` (Streaming Helper) | https://hono.dev/docs/helpers/streaming |
| `testClient` + syarat chained routes (Testing Helper) | https://hono.dev/docs/helpers/testing |
| Source `writeSSE`/`run`/`streamSSE` (CR/LF guard, auto-close) | https://github.com/honojs/hono/blob/main/src/helper/streaming/sse.ts |
| CVE-2026-29085 — SSE Control Field Injection (fixed 4.12.4) | https://github.com/honojs/hono/security/advisories/GHSA-p6xx-57qc-3wxr |
| `@hono/node-server` v2 — rilis & performa | https://github.com/honojs/node-server/releases/tag/v2.0.0 |
| Regresi buffering SSE + workaround `Transfer-Encoding` (issue #266) | https://github.com/honojs/node-server/issues/266 |
| `PROTOCOL_ERROR` HTTP/2 karena `Content-Length` di SSE (issue #1619) | https://github.com/modelcontextprotocol/typescript-sdk/issues/1619 |
| Heartbeat interval SSE (≤ ½ idle timeout; named event) | https://www.server-sent-events.com/backend-stream-generation-connection-management/http-keep-alive-connection-lifecycle/choosing-heartbeat-intervals-for-sse/ |
| Proxy/nginx & `X-Accel-Buffering` | https://www.server-sent-events.com/sse-protocol-fundamentals-architecture/proxy-and-cdn-configuration-for-sse/ |
| Config Vitest (`test.env`, `testTimeout`, `hookTimeout`) | https://vitest.dev/config/ |
| `EventEmitter` / `setMaxListeners` | https://nodejs.org/api/events.html |
| Routing/grouping Hono (`app.route`) | https://hono.dev/docs/api/routing |

---

## 15. Troubleshooting

| Gejala | Penyebab / Solusi |
| --- | --- |
| **Awal fase (normal):** `TS2307: Cannot find module './bus.ts'`, `TS7006: Parameter 'event' implicitly…`, `TS18046: 'client' is of type 'unknown'`, `npm test` → `3 failed \| 6 passed` | Kode Fase 3 belum ada sementara file test sudah tersedia di repo. Kerjakan **Langkah 2–6** berurutan → semua hilang |
| `npm run lint` baris pertamanya `Fixed 3 files` / `Fixed 4 files` | Auto-format hasil tulis tangan — jalankan `npm run lint` sekali lagi, wajib berakhir `No fixes applied` |
| `error TS2339: Property 'stream' does not exist … Client<…>` | Route belum di-mount di `app.ts` (Langkah 6) atau `streamRouter`/`app` tidak ditulis **chaining** (Langkah 4c/5/6) |
| `Cannot find module './routes/stream.ts'` | `routes/stream.ts` belum dibuat (Langkah 5) atau nama file salah (wajib `.ts`, huruf kecil) |
| Test: `Error: timeout … ms menunggu frame SSE` | (a) `beforeAll` gagal → baca pesan `expect(pushed.status, pushed.stderr)` (drizzle push); (b) event datang tapi token beda (filter per token); (c) heartbeat baseline belum ada → cek `vitest.config.ts` `test.env` |
| `Hook timed out in 30000ms` di `afterAll` | Koneksi SSE menggantung waktu `server.close()` — baris `closeAllConnections()` di `afterAll` wajib dipertahankan |
| `MaxListenersExceededWarning: Possible EventEmitter memory leak` | `bus.setMaxListeners(0)` hilang, atau ada **dua instance bus** (impor `bus.ts` lewat jalur berbeda/misread) |
| `curl -N` tidak menampilkan `ping` selama >20 detik | Heartbeat default **15 detik** — tunggu 2× interval. Ingin cepat saat dev: `STREAM_HEARTBEAT_MS=2000 npm run dev` (PowerShell: `$env:STREAM_HEARTBEAT_MS="2000"; npm run dev`) |
| Event `new-webhook` tidak sampai | Token harus sama: stream `/stream/X` hanya menerima `/in/X`. Cek juga isi frame `data` → field `token` |
| Progress meter curl mengotori hasil (`% Total`) | Tambahkan `-s` (`curl -sN …`) — isi frame tetap sama |
| Response SSE masih di-buffer / menumpuk di belakang proxy | Header `X-Accel-Buffering: no` dan `Transfer-Encoding: chunked` (dari `streamSSE`) jangan dihapus/di-override; jangan pernah set `Content-Length` manual pada stream |
| `EADDRINUSE :::3000` | Sisa `node --watch`: `netstat -ano \| findstr :3000` lalu `taskkill /PID <pid> /T /F` |
| `npm test` total ±12–16 detik | Normal di Windows: ±55% untuk startup worker (semua test sendiri <1 dtk). Tuning di Fase 8 |
| File `package.json`/`package-lock.json` muncul di `git status` padahal `git diff` kosong | Hanya line ending (Biome menulis LF, worktree CRLF) — isi identik; `git checkout -- <file>` atau abaikan |

---

## 16. Checklist Verifikasi Akhir Fase 3

- [ ] `npm ls vitest --all` → `vitest@5.0.3` (tanpa instalasi baru)
- [ ] `apps/api/src/bus.ts` ada; `emitNewWebhook(...)` terpanggil **setelah** insert di `webhooks.ts`
- [ ] `apps/api/src/routes/stream.ts` ada; `X-Accel-Buffering`, heartbeat, `onAbort` + `finally` lengkap
- [ ] Router & `app` ditulis **chaining** → `testClient` typed
- [ ] `npm run typecheck` → tanpa error (termasuk `vitest.config.ts`)
- [ ] `npm run lint` → `Checked 39 files … No fixes applied`
- [ ] `npm test` → `Test Files 9 passed (9)`, `Tests 41 passed (41)`
- [ ] `curl -i --max-time 3 localhost:3000/stream/demo` → 4 header SSE, `chunked`, tanpa `Content-Length`
- [ ] `curl -sN localhost:3000/stream/demo` + tembak `/in/demo` → frame `event: new-webhook` muncul seketika
- [ ] Diamkan stream → `event: ping` muncul ±15 detik & ±30 detik (stream hidup >30 detik)
- [ ] `/stream/other` **tidak** menerima event `/in/demo`
- [ ] `/stream/bad%20token` → `400` + `issues`

Semua terpenuhi = **Fase 3 selesai**, lanjut ke **Fase 4** (Frontend Setup,
Tailwind v4, shadcn/ui & Dashboard Layout) — di Fase 4 hook `useWebhookStream`
akan membuka `EventSource` ke `GET /stream/:token` ini.
