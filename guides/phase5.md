# Panduan Fase 5: Request Replay & Resend Engine

**Target:** user memilih webhook yang tertangkap, mengisi URL target, mengedit payload, menekan **Send Replay**, lalu melihat status, latency, dan response body dari server target.

## 0. Catatan Versi 2026 (Wajib)

Project memakai **Next.js 16.4.2** dengan `cacheComponents: true`.

- **Jangan** tulis `export const runtime = "edge"` atau `export const dynamic = "force-dynamic"`. Keduanya bentrok dengan `cacheComponents`.
- Route Handler `POST` tidak di-cache. Tidak perlu config tambahan.
- Replay berjalan di Node.js runtime dan memakai `fetch()` bawaan. Timeout memakai `AbortSignal.timeout()`.
- Hanya URL `http://` dan `https://` yang diterima. `localhost` sengaja diizinkan karena ini dev tool.
- Header hop-by-hop seperti `host` dan `content-length` dibuang otomatis agar `fetch()` menghitung ulang.

### Perbaikan kecil dari fase sebelumnya

Samakan dua teks ini dengan Panduan Fase 4 agar test lama tetap lolos:

- `src/app/[sessionId]/page.tsx` → `Session ID Tidak Valid` (huruf **T** besar).
- `src/components/dashboard/request-feed.tsx` → `Menunggu request webhook masuk...` (tanpa **s**).

---

## 1. Tipe Data Replay

**File baru:** `src/types/replay.ts`

```ts
export interface ReplayPayload {
  targetUrl: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ReplayResult {
  status: number;
  statusText: string;
  durationMs: number;
  contentType: string | null;
  body: string;
  truncated: boolean;
}

export type ReplayApiResponse =
  | ({ success: true } & ReplayResult)
  | { success: false; error: string };
```

---

## 2. Helper Replay

**File baru:** `src/lib/replay.ts`

```ts
import type { ReplayPayload, ReplayResult } from "@/types/replay";

const REPLAY_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 100_000;
const REPLAY_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/** Header hop-by-hop / dihitung ulang oleh fetch, jangan diteruskan. */
const BLOCKED_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function sanitizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).filter(
      ([key, value]) =>
        typeof value === "string" && !BLOCKED_HEADERS.has(key.toLowerCase()),
    ),
  );
}

/** Validasi input replay dari client. Melempar Error dengan pesan aman. */
export function parseReplayPayload(input: unknown): ReplayPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Payload replay tidak valid.");
  }

  const { targetUrl, method, headers, body } = input as Record<string, unknown>;

  if (typeof targetUrl !== "string") {
    throw new Error("Target URL wajib diisi.");
  }

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new Error("Target URL tidak valid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Target URL harus memakai http atau https.");
  }

  const normalizedMethod = String(method ?? "POST").toUpperCase();
  if (!REPLAY_METHODS.has(normalizedMethod)) {
    throw new Error(`Method ${normalizedMethod} tidak didukung.`);
  }

  if (body !== undefined && body !== null && typeof body !== "string") {
    throw new Error("Body harus berupa string atau null.");
  }

  return {
    targetUrl: url.toString(),
    method: normalizedMethod,
    headers: sanitizeHeaders(headers),
    body: typeof body === "string" ? body : null,
  };
}

async function readLimitedBody(
  response: Response,
): Promise<{ body: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { body: "", truncated: false };

  const decoder = new TextDecoder();
  let body = "";
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    body += decoder.decode(value, { stream: true });
    if (body.length > MAX_BODY_CHARS) {
      truncated = true;
      body = body.slice(0, MAX_BODY_CHARS);
      await reader.cancel();
      break;
    }
  }

  if (!truncated) body += decoder.decode();
  return { body, truncated };
}

/** Kirim request ke target replay dan ukur status, durasi, serta response body. */
export async function executeReplay(
  payload: ReplayPayload,
): Promise<ReplayResult> {
  const startedAt = performance.now();
  const hasBody =
    payload.body !== null &&
    payload.method !== "GET" &&
    payload.method !== "HEAD";

  const response = await fetch(payload.targetUrl, {
    method: payload.method,
    headers: payload.headers,
    body: hasBody ? payload.body : undefined,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(REPLAY_TIMEOUT_MS),
  });

  const durationMs = Math.round(performance.now() - startedAt);
  const { body, truncated } = await readLimitedBody(response);

  return {
    status: response.status,
    statusText: response.statusText,
    durationMs,
    contentType: response.headers.get("content-type"),
    body,
    truncated,
  };
}
```

**Peran (SRP):** satu file menangani validasi, sanitasi header, eksekusi fetch, pengukuran latency, dan pembatasan ukuran response.

---

## 3. Route Handler Replay

**File baru:** `src/app/api/replay/route.ts`

```ts
import { executeReplay, parseReplayPayload } from "@/lib/replay";

export async function POST(request: Request) {
  let payload;
  try {
    payload = parseReplayPayload(await request.json());
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Payload tidak valid.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await executeReplay(payload);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Replay request gagal.",
      },
      {
        status:
          error instanceof Error && error.name === "TimeoutError" ? 504 : 502,
      },
    );
  }
}
```

**Status yang dikembalikan:**

| Kondisi | Status HTTP |
|---|---|
| Request replay berhasil dikirim | `200` |
| Input tidak valid | `400` |
| Target tidak bisa dihubungi | `502` |
| Target tidak merespons dalam 15 detik | `504` |

---

## 4. Panel Form Replay

**File baru:** `src/components/dashboard/replay-panel.tsx`

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import type { ReplayApiResponse, ReplayResult } from "@/types/replay";
import type { WebhookRequest } from "@/types/webhook";
import { formatBody, methodColor } from "@/lib/format";

interface ReplayPanelProps {
  request: WebhookRequest;
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) {
    return "text-emerald-300 bg-emerald-950/60 border-emerald-800/80";
  }
  if (status >= 300 && status < 400) {
    return "text-amber-300 bg-amber-950/60 border-amber-800/80";
  }
  return "text-rose-300 bg-rose-950/60 border-rose-800/80";
}

export function ReplayPanel({ request }: ReplayPanelProps) {
  const [targetUrl, setTargetUrl] = useState("");
  const [body, setBody] = useState(formatBody(request.body));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bodyDisabled = request.method === "GET" || request.method === "HEAD";

  async function sendReplay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl,
          method: request.method,
          headers: request.headers,
          body: body.trim().length > 0 ? body : null,
        }),
      });
      const data = (await response.json()) as ReplayApiResponse;

      if (!data.success) {
        setError(data.error);
        return;
      }

      setResult(data);
    } catch {
      setError("Gagal menghubungi server replay.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={sendReplay} className="space-y-4">
        <div>
          <label
            htmlFor="replay-target"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Target URL
          </label>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${methodColor(request.method)}`}
            >
              {request.method}
            </span>
            <input
              id="replay-target"
              type="url"
              required
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="http://localhost:8000/webhook-receiver"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="replay-body"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Payload
          </label>
          <textarea
            id="replay-body"
            rows={10}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={bodyDisabled}
            placeholder="Body request (opsional)"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            Header asli ikut dikirim. Header host dan content-length dibuang
            otomatis.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {loading ? "Mengirim..." : "Send Replay"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-800/80 bg-rose-950/60 px-3 py-2 text-xs text-rose-300"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-slate-800 bg-slate-950">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2.5">
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono font-bold ${statusColor(result.status)}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {result.status} {result.statusText}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {result.durationMs} ms
            </span>
            {result.contentType && (
              <span className="ml-auto truncate text-[11px] font-mono text-slate-500">
                {result.contentType}
              </span>
            )}
          </div>

          <div className="p-3">
            {result.body ? (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs font-mono text-slate-200">
                {formatBody(result.body)}
              </pre>
            ) : (
              <p className="text-xs text-slate-400">
                Response tidak memiliki body.
              </p>
            )}

            {result.truncated && (
              <p className="mt-2 text-[11px] text-amber-300">
                Response dipotong pada 100.000 karakter.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

`key={request.id}` nanti dipakai saat mount, jadi form otomatis reset ketika user memilih request lain.

---

## 5. Sambungkan ke Panel Inspector

**File:** `src/components/dashboard/inspector-panel.tsx`

### 5.1 Tambah import

```ts
import { ReplayPanel } from "./replay-panel";
```

### 5.2 Tambah tab `replay`

```ts
const TABS = ["headers", "query", "body", "replay"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  headers: "Headers",
  query: "Query",
  body: "Body",
  replay: "Replay",
};
```

### 5.3 Render panel

Di dalam area konten tab, setelah blok `tab === "body"`:

```tsx
{tab === "replay" && (
  <ReplayPanel key={request.id} request={request} />
)}
```

---

## 6. Verifikasi CLI

### 6.1 Lint

```bash
npm run lint
```

**Yang muncul:** selesai tanpa error.

```text
> temp-app@0.1.0 lint
> eslint
```

### 6.2 Build

```bash
npm run build
```

**Yang muncul:** build sukses dan route `/api/replay` terdaftar.

```text
Route (app)
┌ ○ /
├ ○ /_not-found
├   /[sessionId]
│ └ ◐ /[sessionId]
├ ƒ /api/catch/[sessionId]
├ ƒ /api/health
├ ƒ /api/replay
└ ƒ /api/stream/[sessionId]
```

### 6.3 Jalankan dev server

Terminal 1:

```bash
npm run dev
```

**Yang muncul:**

```text
▲ Next.js 16.4.2 (Turbopack)
- Local: http://localhost:3000
- Environments: .env.local
✓ Ready in ...ms
```

### 6.4 Jalankan server target untuk menerima replay

Terminal 2:

```bash
node -e 'require("http").createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{console.log(req.method,req.url,b);res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,received:b?JSON.parse(b):null}))})}).listen(8000,()=>console.log("receiver on http://localhost:8000"))'
```

**Yang muncul:**

```text
receiver on http://localhost:8000
```

### 6.5 Siapkan satu webhook

Terminal 3:

```bash
curl -s -X POST http://localhost:3000/api/catch/test-session \
  -H "Content-Type: application/json" \
  -d '{"hello":"replay"}'
```

**Yang muncul:**

```json
{"success":true,"id":"<uuid>"}
```

### 6.6 Replay dari UI

1. Buka `http://localhost:3000/test-session`.
2. Klik request `POST` di sidebar.
3. Buka tab **Replay**.
4. Isi **Target URL** dengan `http://localhost:8000/webhook-receiver`.
5. Edit payload jika perlu, lalu klik **Send Replay**.

**Yang muncul di browser:**

- Badge status hijau, misalnya `200 OK`.
- Latency, misalnya `12 ms`.
- Response body `{"ok":true,"received":{"hello":"replay"}}`.

**Yang muncul di Terminal 2:**

```text
POST /webhook-receiver {"hello":"replay"}
```

### 6.7 Replay langsung lewat API

```bash
curl -s -X POST http://localhost:3000/api/replay \
  -H "Content-Type: application/json" \
  -d '{"targetUrl":"http://localhost:8000/webhook-receiver","method":"POST","headers":{"content-type":"application/json","x-demo":"fase5"},"body":"{\"hello\":\"replay\"}"}'
```

**Yang muncul:**

```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "durationMs": 12,
  "contentType": "application/json",
  "body": "{\"ok\":true,\"received\":{\"hello\":\"replay\"}}",
  "truncated": false
}
```

### 6.8 Cek error

URL tidak valid:

```bash
curl -s -X POST http://localhost:3000/api/replay \
  -H "Content-Type: application/json" \
  -d '{"targetUrl":"bukan-url","method":"POST"}'
```

**Yang muncul (HTTP 400):**

```json
{"success":false,"error":"Target URL tidak valid."}
```

Target mati:

```bash
curl -s -X POST http://localhost:3000/api/replay \
  -H "Content-Type: application/json" \
  -d '{"targetUrl":"http://localhost:9999/hilang","method":"GET"}'
```

**Yang muncul (HTTP 502):** `{"success":false,"error":"fetch failed"}`.

### 6.9 Jalankan smoke test Fase 5

```bash
node --env-file=.env.local tests/phase5/replay.smoke.mjs
```

**Yang muncul:**

```text
Phase 5 replay smoke test passed
```

---

## 7. Ringkasan Prinsip

| Prinsip | Penerapan |
|---|---|
| **SRP** | `replay.ts` urus validasi + fetch; `route.ts` urus HTTP; `replay-panel.tsx` urus form dan hasil. |
| **DRY** | `formatBody` dan `methodColor` dipakai ulang dari Fase 4; tipe replay dipusatkan di `types/replay.ts`. |
| **KISS** | Tanpa dependency baru; replay memakai `fetch()` dan `AbortSignal.timeout()`. |
| **Aman** | Hanya `http`/`https`; header `host`/`content-length` dibuang; response dibatasi 100.000 karakter. |
| **Robust** | Timeout 15 detik; error target mengembalikan `502`; UI menampilkan pesan error. |

---

## 8. Selesai

Fase 5 selesai jika:

- `npm run lint` bersih.
- `npm run build` sukses dan `/api/replay` muncul sebagai route dinamis.
- Tab **Replay** tampil di panel inspector.
- Replay dari UI menampilkan status, latency, dan response body target.
- Payload hasil edit benar-benar diterima server target.
- URL tidak valid menghasilkan `400`; target mati menghasilkan `502`.
- Smoke test Fase 5 lolos.
