# Panduan Fase 4: Inspector Web Dashboard & UI Components

**Target:** halaman `/[sessionId]` berupa dashboard split-screen: feed request real-time di kiri, inspector (Headers, Query, Body) di kanan, plus tombol copy webhook URL. Request baru dari Fase 2/3 langsung muncul tanpa refresh.

## 0. Catatan Versi 2026 (Wajib)

Project memakai **Next.js 16.4.2** dengan `cacheComponents: true`.

- **Jangan** pakai `export const runtime = "edge"` atau `export const dynamic = "force-dynamic"`. Keduanya bentrok dengan konfigurasi ini.
- `params` adalah **Promise**, jadi wajib `await params`.
- Semua komponen interaktif (state, `EventSource`, clipboard) wajib diawali `"use client"`.
- Halaman dashboard **wajib** memanggil `await connection()` dari `next/server`. Tanpa ini, Next.js mencoba prerender komponen client dan dev overlay menampilkan error:
  `Next.js encountered the unstable value Date.now() while prerendering`.
- Badge `200` di feed adalah status balasan endpoint catcher (Fase 2), bukan status dari target replay.

---

## 1. Tambah Helper Riwayat Request

**File:** `src/lib/webhook.ts` (sudah ada dari Fase 2)

### 1.1 Ubah baris import pertama

```ts
import { getRedisClient, isRedisConfigured } from "@/lib/redis";
```

### 1.2 Tambahkan fungsi ini tepat setelah `buildWebhookRequest`

```ts
/** Ambil riwayat request terbaru; aman jika Redis belum dikonfigurasi. */
export async function getWebhookRequests(
  sessionId: string,
): Promise<WebhookRequest[]> {
  if (!isRedisConfigured) return [];

  try {
    const items = await getRedisClient().lrange<WebhookRequest | string>(
      requestsKey(sessionId),
      0,
      MAX_REQUESTS_PER_SESSION - 1,
    );

    return items.flatMap((item) => {
      if (typeof item !== "string") return [item];
      try {
        return [JSON.parse(item) as WebhookRequest];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
```

Fungsi ini dipakai Server Component untuk memuat riwayat awal, sehingga feed tidak kosong setelah halaman di-refresh.

---

## 2. Helper Format Tampilan

**File baru:** `src/lib/format.ts`

```ts
const METHOD_COLORS: Record<string, string> = {
  GET: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  POST: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PUT: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  PATCH: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  DELETE: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function methodColor(method: string): string {
  return (
    METHOD_COLORS[method.toUpperCase()] ??
    "bg-slate-500/15 text-slate-300 border-slate-500/30"
  );
}

/** Waktu deterministik (UTC, HH:MM:SS) agar aman dari hydration mismatch. */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(11, 19);
}

/** Pretty-print JSON; body non-JSON dikembalikan apa adanya. */
export function formatBody(body: string | null): string {
  if (!body) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
```

---

## 3. Custom Hook SSE

**File baru:** `src/hooks/use-webhook-stream.ts`

```ts
"use client";

import { useEffect, useState } from "react";
import type { WebhookRequest } from "@/types/webhook";

export type StreamStatus = "connecting" | "live" | "offline";

const MAX_FEED_ITEMS = 100;

export function useWebhookStream(
  sessionId: string,
  initialRequests: WebhookRequest[],
) {
  const [requests, setRequests] = useState(initialRequests);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    const source = new EventSource(`/api/stream/${sessionId}`);

    const handleReady = () => setStatus("live");

    const handleWebhook = (event: Event) => {
      try {
        const webhook = JSON.parse((event as MessageEvent).data) as WebhookRequest;
        setRequests((prev) =>
          [webhook, ...prev.filter((item) => item.id !== webhook.id)].slice(
            0,
            MAX_FEED_ITEMS,
          ),
        );
      } catch {
        // Abaikan payload yang tidak valid.
      }
    };

    source.addEventListener("ready", handleReady);
    source.addEventListener("webhook", handleWebhook);
    // EventSource otomatis reconnect; status hanya untuk indikator UI.
    source.onerror = () => setStatus("offline");

    return () => {
      source.removeEventListener("ready", handleReady);
      source.removeEventListener("webhook", handleWebhook);
      source.close();
    };
  }, [sessionId]);

  return { requests, status };
}
```

Event `ready` dan `webhook` mengikuti nama event yang dikirim `/api/stream/[sessionId]` dari Fase 3.

---

## 4. Komponen Dashboard

Buat folder `src/components/dashboard/`.

### 4.1 Header + Copy Webhook URL

**File baru:** `src/components/dashboard/session-header.tsx`

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Copy, Radio, WifiOff } from "lucide-react";
import type { StreamStatus } from "@/hooks/use-webhook-stream";

interface SessionHeaderProps {
  sessionId: string;
  status: StreamStatus;
}

const STATUS_STYLES: Record<
  StreamStatus,
  { label: string; className: string; icon: typeof Radio }
> = {
  connecting: {
    label: "Connecting",
    className: "text-amber-300 bg-amber-950/60 border-amber-800/80",
    icon: Radio,
  },
  live: {
    label: "Live",
    className: "text-emerald-300 bg-emerald-950/60 border-emerald-800/80",
    icon: Radio,
  },
  offline: {
    label: "Reconnecting",
    className: "text-rose-300 bg-rose-950/60 border-rose-800/80",
    icon: WifiOff,
  },
};

export function SessionHeader({ sessionId, status }: SessionHeaderProps) {
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/catch/${sessionId}`;
  const statusStyle = STATUS_STYLES[status];
  const StatusIcon = statusStyle.icon;

  async function copyEndpoint() {
    await navigator.clipboard.writeText(`${window.location.origin}${endpoint}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <header className="h-16 shrink-0 border-b border-slate-800 px-4 md:px-6 flex items-center justify-between gap-3 bg-slate-900/40 backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-lg hover:bg-slate-800 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Kembali</span>
        </Link>
        <div className="h-4 w-px bg-slate-800 shrink-0" />
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon
            className={`w-4 h-4 shrink-0 ${
              status === "live" ? "text-emerald-400 animate-pulse" : ""
            }`}
          />
          <code className="text-xs font-mono bg-slate-800 text-indigo-300 px-2.5 py-1 rounded border border-slate-700 truncate max-w-[140px] md:max-w-none">
            {sessionId}
          </code>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
          <code className="text-xs font-mono text-slate-300">{endpoint}</code>
          <button
            type="button"
            onClick={copyEndpoint}
            className="flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <span
          className={`flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full ${statusStyle.className}`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {statusStyle.label}
        </span>
      </div>
    </header>
  );
}
```

### 4.2 Feed Request (Sidebar)

**File baru:** `src/components/dashboard/request-feed.tsx`

```tsx
"use client";

import { Inbox } from "lucide-react";
import type { WebhookRequest } from "@/types/webhook";
import { formatTime, methodColor } from "@/lib/format";

interface RequestFeedProps {
  requests: WebhookRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RequestFeed({
  requests,
  selectedId,
  onSelect,
}: RequestFeedProps) {
  return (
    <aside className="border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/30 flex flex-col min-h-0 md:h-[calc(100vh-4rem)]">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Requests
        </h2>
        <span className="text-xs font-mono text-slate-500">
          {requests.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {requests.length === 0 ? (
          <div className="h-full min-h-48 flex flex-col items-center justify-center text-center p-6">
            <Inbox className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-xs text-slate-400">
              Menunggu request webhook masuk...
            </p>
          </div>
        ) : (
          requests.map((request) => {
            const isSelected = request.id === selectedId;
            return (
              <button
                key={request.id}
                type="button"
                onClick={() => onSelect(request.id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-800/70 transition cursor-pointer ${
                  isSelected
                    ? "bg-indigo-500/10 border-l-2 border-l-indigo-400"
                    : "hover:bg-slate-800/50 border-l-2 border-l-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${methodColor(request.method)}`}
                  >
                    {request.method}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 border border-emerald-800/70 bg-emerald-950/50 px-1.5 py-0.5 rounded">
                    200
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-slate-500">
                    {formatTime(request.timestamp)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-mono text-slate-300 truncate">
                  {request.path}
                </p>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
```

### 4.3 Panel Inspector

**File baru:** `src/components/dashboard/inspector-panel.tsx`

```tsx
"use client";

import { useState } from "react";
import { Check, Copy, MousePointerClick } from "lucide-react";
import type { WebhookRequest } from "@/types/webhook";
import { formatBody, formatTime, methodColor } from "@/lib/format";

const TABS = ["headers", "query", "body"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  headers: "Headers",
  query: "Query",
  body: "Body",
};

interface InspectorPanelProps {
  request: WebhookRequest | null;
}

export function InspectorPanel({ request }: InspectorPanelProps) {
  const [tab, setTab] = useState<Tab>("headers");
  const [copied, setCopied] = useState(false);

  if (!request) {
    return (
      <section className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <MousePointerClick className="w-8 h-8 text-slate-600 mb-3" />
        <p className="text-sm text-slate-400">
          Pilih request di feed untuk melihat detailnya.
        </p>
      </section>
    );
  }

  const body = formatBody(request.body);

  async function copyBody() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="flex-1 flex flex-col min-h-0 md:h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-slate-800 bg-slate-900/20 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${methodColor(request.method)}`}
          >
            {request.method}
          </span>
          <span className="text-[10px] font-mono text-emerald-400 border border-emerald-800/70 bg-emerald-950/50 px-1.5 py-0.5 rounded">
            200 OK
          </span>
        </div>
        <p className="text-sm font-mono text-slate-200 break-all">
          {request.url}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
          <span>IP: {request.clientIp}</span>
          <span>Waktu: {formatTime(request.timestamp)} UTC</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-800 px-4 pt-3 shrink-0">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition cursor-pointer ${
              tab === item
                ? "text-indigo-300 border-indigo-400 bg-indigo-500/10"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}
          >
            {TAB_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === "headers" && (
          <KeyValueTable data={request.headers} empty="Tidak ada header." />
        )}

        {tab === "query" && (
          <KeyValueTable
            data={request.queryParams}
            empty="Tidak ada query parameter."
          />
        )}

        {tab === "body" &&
          (body ? (
            <div>
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={copyBody}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied" : "Copy Payload"}
                </button>
              </div>
              <pre className="text-xs font-mono text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-words">
                {body}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Request ini tidak memiliki body.
            </p>
          ))}
      </div>
    </section>
  );
}

function KeyValueTable({
  data,
  empty,
}: {
  data: Record<string, string>;
  empty: string;
}) {
  const rows = Object.entries(data);

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400">{empty}</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key} className="border-b border-slate-800/70 align-top">
            <td className="py-2 pr-4 font-mono text-indigo-300 whitespace-nowrap">
              {key}
            </td>
            <td className="py-2 font-mono text-slate-300 break-all">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 4.4 Orkestrator Dashboard

**File baru:** `src/components/dashboard/dashboard.tsx`

```tsx
"use client";

import { useState } from "react";
import type { WebhookRequest } from "@/types/webhook";
import { useWebhookStream } from "@/hooks/use-webhook-stream";
import { SessionHeader } from "./session-header";
import { RequestFeed } from "./request-feed";
import { InspectorPanel } from "./inspector-panel";

interface DashboardProps {
  sessionId: string;
  initialRequests: WebhookRequest[];
}

export function Dashboard({ sessionId, initialRequests }: DashboardProps) {
  const { requests, status } = useWebhookStream(sessionId, initialRequests);
  const [selectedId, setSelectedId] = useState(initialRequests[0]?.id ?? null);
  const selected =
    requests.find((request) => request.id === selectedId) ??
    requests[0] ??
    null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SessionHeader sessionId={sessionId} status={status} />
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[340px_1fr] min-h-0">
        <RequestFeed
          requests={requests}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        <InspectorPanel request={selected} />
      </main>
    </div>
  );
}
```

---

## 5. Ganti Halaman Session

**File:** `src/app/[sessionId]/page.tsx` (ganti seluruh isi)

```tsx
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getWebhookRequests } from "@/lib/webhook";
import { isValidSessionId } from "@/lib/session";

// Route ini butuh sessionId dari URL dan data runtime, jadi render per-request.
export const instant = false;

interface SessionPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function SessionDashboardPage({
  params,
}: SessionPageProps) {
  const { sessionId } = await params;

  // Paksa render saat request agar data runtime (Redis) tidak ikut diprerender.
  await connection();

  if (!isValidSessionId(sessionId)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="p-6 rounded-2xl bg-amber-950/40 border border-amber-800 text-amber-200 max-w-md">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5" />
            <h2 className="text-lg font-bold">Session ID Tidak Valid</h2>
          </div>
          <p className="text-xs text-amber-300/80 mb-4">
            Session ID harus berupa format alfanumerik atau UUID antara 8
            hingga 64 karakter.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke beranda
          </Link>
        </div>
      </div>
    );
  }

  const initialRequests = await getWebhookRequests(sessionId);

  return (
    <Dashboard sessionId={sessionId} initialRequests={initialRequests} />
  );
}
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

**Yang muncul:** build sukses. `/[sessionId]` tetap partial prerender, API tetap dinamis.

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

Jika muncul error `unstable value Date.now() while prerendering`, pastikan `await connection()` sudah ada di `page.tsx` (langkah 5).

### 6.3 Jalankan dev server

Terminal 1:

```bash
npm run dev
```

**Yang muncul:** server siap di port 3000.

```text
▲ Next.js 16.4.2 (Turbopack)
- Local: http://localhost:3000
- Environments: .env.local
✓ Ready in ...ms
```

### 6.4 Buka dashboard

Buka browser:

```text
http://localhost:3000/test-session
```

**Yang muncul:**

- Header berisi session ID, endpoint `/api/catch/test-session`, tombol **Copy**, dan badge status.
- Badge berubah dari `Connecting` menjadi **`Live`** setelah SSE tersambung.
- Sidebar **Requests** kosong dengan tulisan `Menunggu request webhook masuk...`.
- Panel kanan menampilkan `Pilih request di feed untuk melihat detailnya.`

Klik **Copy**; URL lengkap `http://localhost:3000/api/catch/test-session` tersalin ke clipboard.

### 6.5 Kirim webhook dan cek real-time

Terminal 2:

```bash
curl -i -X POST "http://localhost:3000/api/catch/test-session?source=dashboard" \
  -H "Content-Type: application/json" \
  -H "X-Demo: fase4" \
  -d '{"hello":"dashboard","nested":{"ok":true}}'
```

**Yang muncul di terminal:**

```text
HTTP/1.1 200 OK
content-type: application/json

{"success":true,"id":"<uuid>"}
```

**Yang muncul di browser tanpa refresh:**

- Item baru masuk ke sidebar: badge `POST`, `200`, path `/api/catch/test-session`, dan jam (UTC).
- Klik item tersebut. Panel kanan menampilkan URL, IP, waktu, dan tab `Headers`, `Query`, `Body`.

Cek tiap tab:

- **Headers** → ada baris `content-type`, `x-demo`, dan nilainya.
- **Query** → ada baris `source` dengan nilai `dashboard`.
- **Body** → JSON ter-format rapi; tombol **Copy Payload** menyalin isi body.

### 6.6 Cek riwayat setelah refresh

Tekan `F5` / refresh browser.

**Yang muncul:** item `POST` tadi tetap ada di feed (dimuat dari Redis lewat `getWebhookRequests`), dan badge kembali ke `Live`.

### 6.7 Cek session tidak valid

Buka:

```text
http://localhost:3000/bad
```

**Yang muncul:** kartu `Session ID Tidak Valid` dengan tombol kembali ke beranda.

---

## 7. Ringkasan Implementasi

| Prinsip | Penerapan |
|---|---|
| **SRP** | `format.ts` urus tampilan; `use-webhook-stream.ts` urus SSE; tiap komponen dashboard punya satu tanggung jawab. |
| **DRY** | `Dashboard` memakai satu hook dan satu sumber data; helper format dipakai feed + inspector. |
| **KISS** | Tanpa dependency baru; JSON viewer cukup `JSON.parse` + `JSON.stringify(..., null, 2)`. |
| **Realtime** | `EventSource` mendengarkan event `ready` dan `webhook` dari Fase 3. |
| **Riwayat** | Server Component memuat list Redis terbaru sebelum render pertama. |
| **Cleanup** | `source.close()` + `removeEventListener` saat komponen unmount. |
| **Anti memory leak** | Feed dibatasi 100 item; ID duplikat difilter. |
| **Responsif** | Grid 1 kolom di mobile, `340px + 1fr` di desktop. |

---

## 8. Selesai

Fase 4 selesai jika:

- `npm run lint` bersih.
- `npm run build` sukses dan tidak ada error prerender.
- Dashboard menampilkan status `Live`.
- Webhook baru muncul di feed seketika tanpa refresh.
- Tab Headers, Query, dan Body menampilkan data yang benar.
- Tombol Copy URL dan Copy Payload berfungsi.
- Riwayat tetap ada setelah refresh.
- Session ID tidak valid menampilkan pesan error.

Lanjut ke **Fase 5: Request Replay & Resend Engine**.
