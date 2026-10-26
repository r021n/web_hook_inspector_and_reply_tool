# Panduan Fase 2: Webhook Ingestion (`/api/catch/[sessionId]`)

**Target:** endpoint menerima semua method HTTP, menyimpan request ke Upstash Redis (TTL 2 jam), publish event realtime, lalu membalas `200 {"success":true,"id":"..."}`.

## 0. Catatan Versi 2026

Project memakai **Next.js 16.4.2**. Jangan tambahkan `export const runtime = 'edge'` seperti yang tertulis di `project.md`:

- Edge Runtime sudah **deprecated** dan tidak didukung mulai Next.js 16.3+.
- Route Handler otomatis berjalan di **Node.js** (default). Tidak perlu export `runtime`.

`params` di Next.js 16 adalah **Promise**, jadi wajib `await params`.

---

## 1. Fix Error Build Fase 1 (Wajib)

**File:** `src/app/[sessionId]/page.tsx`

Jika baris ini belum ada, tambahkan tepat setelah baris import:

```ts
// Route ini memang butuh sessionId dari URL dan harus dirender per-request.
export const instant = false;
```

**Alasan:** `cacheComponents: true` di `next.config.ts` membuat build gagal karena `params` dibaca di server tanpa Suspense. `instant = false` mengizinkan route blocking.

---

## 2. Buat Helper Data & Redis

**File baru:** `src/lib/webhook.ts`

Tulis kode berikut:

```ts
import type { WebhookRequest } from "@/types/webhook";
import { getRedisClient } from "@/lib/redis";

const REQUEST_TTL_SECONDS = 2 * 60 * 60;
const MAX_REQUESTS_PER_SESSION = 100;

export function requestsKey(sessionId: string): string {
  return `session:${sessionId}:requests`;
}

export function eventsChannel(sessionId: string): string {
  return `session:${sessionId}`;
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "unknown";
}

export async function buildWebhookRequest(
  request: Request,
  sessionId: string,
): Promise<WebhookRequest> {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const rawBody = hasBody ? await request.text() : "";

  return {
    id: crypto.randomUUID(),
    sessionId,
    method: request.method,
    url: request.url,
    path: url.pathname,
    headers,
    queryParams: Object.fromEntries(url.searchParams.entries()),
    body: rawBody.length > 0 ? rawBody : null,
    contentType: headers["content-type"] ?? null,
    clientIp: getClientIp(request.headers),
    timestamp: Date.now(),
  };
}

export async function saveWebhookRequest(webhook: WebhookRequest): Promise<void> {
  const redis = getRedisClient();
  const payload = JSON.stringify(webhook);
  const key = requestsKey(webhook.sessionId);

  await redis
    .pipeline()
    .lpush(key, payload)
    .ltrim(key, 0, MAX_REQUESTS_PER_SESSION - 1)
    .expire(key, REQUEST_TTL_SECONDS)
    .publish(eventsChannel(webhook.sessionId), payload)
    .exec();
}
```

**Peran file ini (SRP/DRY):** parsing request dan operasi Redis dikumpulkan di satu tempat. Route Handler tetap tipis.

---

## 3. Buat Route Handler

**File baru:** `src/app/api/catch/[sessionId]/route.ts`

Tulis kode berikut:

```ts
import { NextResponse } from "next/server";
import { isValidSessionId } from "@/lib/session";
import { buildWebhookRequest, saveWebhookRequest } from "@/lib/webhook";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

async function handleWebhook(request: Request, { params }: RouteContext) {
  const { sessionId } = await params;

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { success: false, error: "Invalid sessionId" },
      { status: 400 },
    );
  }

  try {
    const webhook = await buildWebhookRequest(request, sessionId);
    await saveWebhookRequest(webhook);

    return NextResponse.json({ success: true, id: webhook.id }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process webhook",
      },
      { status: 500 },
    );
  }
}

export const GET = handleWebhook;
export const POST = handleWebhook;
export const PUT = handleWebhook;
export const PATCH = handleWebhook;
export const DELETE = handleWebhook;
export const HEAD = handleWebhook;
export const OPTIONS = handleWebhook;
```

**Kenapa satu fungsi?** Semua method memakai pipeline yang sama. Ini DRY dan KISS: tidak ada duplikasi kode per method.

---

## 4. Verifikasi CLI

### 4.1 Lint

```bash
npm run lint
```

**Yang muncul:** command selesai tanpa error. Contoh output bersih:

```text
> temp-app@0.1.0 lint
> eslint
```

### 4.2 Build

```bash
npm run build
```

**Yang muncul:** build sukses dan route terdaftar sebagai dinamis (`ƒ`):

```text
Route (app)
┌ ○ /
├ ○ /_not-found
├   /[sessionId]
│ └ ◐ /[sessionId]
├ ƒ /api/catch/[sessionId]
└ ƒ /api/health
```

Jika muncul error `Next.js encountered uncached or runtime data during prerendering`, ulangi Langkah 1.

### 4.3 Jalankan dev server

Terminal 1:

```bash
npm run dev
```

**Yang muncul:** server siap di port 3000 (atau port lain jika 3000 terpakai):

```text
▲ Next.js 16.4.2 (Turbopack)
- Local: http://localhost:3000
```

### 4.4 Uji endpoint

Terminal 2. Kirim webhook `POST`:

```bash
curl -i -X POST "http://localhost:3000/api/catch/test-session?source=curl" \
  -H "Content-Type: application/json" \
  -H "X-Custom-Header: demo" \
  -d '{"hello":"world","nested":{"ok":true}}'
```

**Yang muncul:** status `200 OK` dan ID unik:

```text
HTTP/1.1 200 OK
content-type: application/json

{"success":true,"id":"<uuid>"}
```

Uji `GET` + query params:

```bash
curl -i "http://localhost:3000/api/catch/test-session?foo=bar" \
  -H "X-Test: get"
```

**Yang muncul:** `200 OK` dengan `{"success":true,"id":"<uuid>"}`.

Uji session tidak valid:

```bash
curl -i "http://localhost:3000/api/catch/bad"
```

**Yang muncul:** `400 Bad Request`:

```text
HTTP/1.1 400 Bad Request
content-type: application/json

{"success":false,"error":"Invalid sessionId"}
```

### 4.5 Cek data di Redis

```bash
node --env-file=.env.local -e "import('@upstash/redis').then(async ({Redis})=>{const r=new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN});const v=await r.lrange('session:test-session:requests',0,-1);console.log(JSON.stringify(v,null,2));console.log('TTL:',await r.ttl('session:test-session:requests'));})"
```

**Yang muncul:** array request (terbaru di index 0) berisi `method`, `url`, `headers`, `queryParams`, `body`, `clientIp`, `timestamp`, lalu TTL mendekati 7200:

```text
[
  { "method": "GET", "queryParams": { "foo": "bar" }, ... },
  { "method": "POST", "body": "{\"hello\":\"world\",\"nested\":{\"ok\":true}}", ... }
]
TTL: 7189
```

### 4.6 Opsional: smoke test

```bash
node --env-file=.env.local tests/phase2/ingestion.smoke.mjs
```

**Yang muncul:**

```text
Phase 2 smoke test passed for session smoke-...
```

---

## 5. Ringkasan Implementasi

| Prinsip | Penerapan |
|---|---|
| **SRP** | `src/lib/webhook.ts` khusus parsing + Redis. Route Handler hanya validasi + response. |
| **DRY** | Semua method memakai `handleWebhook` yang sama. |
| **KISS** | Tanpa dependency baru; body disimpan sebagai string mentah. |
| **TTL** | List `session:<id>:requests` kedaluwarsa 2 jam (sliding, reset tiap request). |
| **Batas memori** | `LTRIM` menyimpan maksimal 100 request terbaru per sesi. |
| **Realtime** | `PUBLISH session:<id>` mengirim JSON request untuk konsumsi Fase 3 (SSE). |
| **IP** | Diambil dari `x-forwarded-for`, lalu `x-real-ip`, lalu `cf-connecting-ip`; lokal biasanya `::1`. |

---

## 6. Selesai

Fase 2 selesai jika:

- `npm run lint` bersih.
- `npm run build` sukses dan `/api/catch/[sessionId]` muncul sebagai `ƒ`.
- `curl` POST/GET membalas `200` dengan `success: true` dan `id`.
- Redis berisi payload lengkap dengan `timestamp`, `headers`, dan TTL ±7200 detik.

Lanjut ke **Fase 3: SSE `/api/stream/[sessionId]`**.
