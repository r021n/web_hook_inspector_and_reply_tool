# Panduan Pengerjaan Fase 1: Project Setup & Upstash Integration

Panduan ini memandu Anda menginisialisasi pondasi project **Real-Time Webhook Relay & Inspector (DevTool)** menggunakan **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Lucide Icons**, dan **@upstash/redis** dengan pendekatan arsitektur **Single Responsibility**, **DRY (Don't Repeat Yourself)**, dan **KISS (Keep It Simple, Stupid)**.

---

## Daftar Isi
1. [Prasyarat & Konsep Dasar](#1-prasyarat--konsep-dasar)
2. [Langkah 1: Inisialisasi Project Next.js](#langkah-1-inisialisasi-project-nextjs)
3. [Langkah 2: Instalasi Dependensi Tambahan](#langkah-2-instalasi-dependensi-tambahan)
4. [Langkah 3: Konfigurasi Next.js (`next.config.ts`)](#langkah-3-konfigurasi-nextjs-nextconfigts)
5. [Langkah 4: Setup Environment Variables Upstash Redis](#langkah-4-setup-environment-variables-upstash-redis)
6. [Langkah 5: Membuat Schema & Tipe Data (`src/types/webhook.ts`)](#langkah-5-membuat-schema--tipe-data-srctypeswebhookts)
7. [Langkah 6: Utility Session Generator (`src/lib/session.ts`)](#langkah-6-utility-session-generator-srclibsessionts)
8. [Langkah 7: Utility Upstash Redis Client (`src/lib/redis.ts`)](#langkah-7-utility-upstash-redis-client-srclibredists)
9. [Langkah 8: Route Handler Health Check Upstash (`src/app/api/health/route.ts`)](#langkah-8-route-handler-health-check-upstash-srcappapihealthroutets)
10. [Langkah 9: Halaman Utama Pembuat Sesi (`src/app/page.tsx`)](#langkah-9-halaman-utama-pembuat-sesi-srcapppagetsx)
11. [Langkah 10: Dynamic Route Session Awal (`src/app/[sessionId]/page.tsx`)](#langkah-10-dynamic-route-session-awal-srcappsessionidpagetsx)
12. [Langkah 11: Verifikasi Build & Linting](#langkah-11-verifikasi-build--linting)
13. [Langkah 12: Menjalankan Dev Server](#langkah-12-menjalankan-dev-server)

---

## 1. Prasyarat & Konsep Dasar

* **Runtime:** Node.js v20+ atau v24+.
* **Edge vs Node.js Runtime (Catatan Standar 2026):**
  Next.js App Router secara default menggunakan runtime Node.js modern yang sudah mendukung penuh Web Standards (`fetch`, `Request`, `Response`, `ReadableStream`, `crypto.randomUUID()`). `@upstash/redis` berbasis REST HTTP sehingga sepenuhnya stateless, tidak memerlukan persistent TCP connection, dan berjalan mulus tanpa konfigurasi khusus.
* **Arsitektur Modular:**
  * `src/types/`: Hanya bertanggung jawab atas definisi kontrak tipe data (*Single Responsibility*).
  * `src/lib/`: Berisi modul utility murni yang independen dan dapat digunakan kembali (*DRY*).
  * `src/app/`: Mengelola routing dan tampilan tanpa mencampur logika koneksi database (*KISS*).

---

## Langkah 1: Inisialisasi Project Next.js

Jika direktori sudah memiliki file `project.md` dan folder `guides/`, buat project Next.js di folder sementara atau langsung generate struktur dasarnya.

Jalankan perintah berikut di terminal:

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

> **Catatan Penting:** Jika CLI memberi peringatan bahwa folder tidak kosong karena adanya file panduan/proyek, jalankan pembuatan di folder sementara lalu pindahkan file-filenya:
> ```bash
> npx create-next-app@latest /tmp/temp-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --no-agent-feedback
> cp -R /tmp/temp-app/. .
> rm -rf /tmp/temp-app
> ```

### Output CLI yang Diharapkan:
```text
Creating a new Next.js app in /Users/r021n/coding/web/web_hook_inspector_and_reply_tool.

Using npm.

Initializing project with template: app-tw 

Installing dependencies:
- next
- react
- react-dom

Installing devDependencies:
- @tailwindcss/turbopack
- @types/node
- @types/react
- @types/react-dom
- eslint
- eslint-config-next
- tailwindcss
- typescript

Success! Created project
```

---

## Langkah 2: Instalasi Dependensi Tambahan

Instal library Upstash Redis Client (`@upstash/redis`) dan set icon UI modern (`lucide-react`).

Jalankan perintah:

```bash
npm install @upstash/redis lucide-react
```

### Output CLI yang Diharapkan:
```text
added 3 packages, and audited 362 packages in ...s

146 packages are looking for funding
  run `npm fund` for details
```

---

## Langkah 3: Konfigurasi Next.js (`next.config.ts`)

Pastikan file konfigurasi Next.js mendukung Turbopack dengan Tailwind CSS v4 tanpa konflik caching.

Buka atau modifikasi file:
`next.config.ts`

Tulis kode berikut:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
```

---

## Langkah 4: Setup Environment Variables Upstash Redis

Upstash Redis REST API membutuhkan dua variabel: URL endpoint dan REST Token.

### 1. Buat template environment
Buat file baru:
`.env.local.example`

Isi dengan:
```env
# Upstash Redis REST Credentials
# Dapatkan dari: https://console.upstash.com/ -> Pilih Database -> Tab REST API
UPSTASH_REDIS_REST_URL="https://your-database-name.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-rest-token-here"
```

### 2. Buat file konfigurasi lokal
Buat file baru:
`.env.local`

Isi dengan nilai kredensial Upstash Anda (atau biarkan string kosong sementara jika belum membuat database di dashboard Upstash):
```env
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

> **Catatan Keamanan:** File `.env.local` sudah otomatis diabaikan oleh `.gitignore` sehingga aman dari kebocoran token git.

---

## Langkah 5: Membuat Schema & Tipe Data (`src/types/webhook.ts`)

Sesuai prinsip **Single Responsibility**, kita meletakkan struktur data `WebhookRequest` dan sesi di file tersendiri agar konsisten dipakai dari Fase 1 hingga Fase 5.

Buat file baru:
`src/types/webhook.ts`

Tulis kode berikut:

```typescript
export interface WebhookRequest {
  id: string;
  sessionId: string;
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: string | null;
  contentType: string | null;
  clientIp: string;
  timestamp: number;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: number;
}
```

---

## Langkah 6: Utility Session Generator (`src/lib/session.ts`)

Menggunakan Web Crypto bawaan (`crypto.randomUUID()`) mengikuti prinsip **KISS (tanpa dependency eksternal seperti `uuid` atau `nanoid`)** dan berjalan optimal di Node.js maupun serverless runtime.

Buat file baru:
`src/lib/session.ts`

Tulis kode berikut:

```typescript
/**
 * Utility functions for Webhook Session management.
 * Strictly handles session ID generation and validation.
 */

/**
 * Generate a cryptographically secure random session UUID.
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Validates whether a provided string is a valid session ID slug.
 * Accepts standard UUIDs and alphanumeric slugs (8 to 64 characters).
 */
export function isValidSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }
  return /^[a-zA-Z0-9_-]{8,64}$/.test(sessionId);
}
```

---

## Langkah 7: Utility Upstash Redis Client (`src/lib/redis.ts`)

Menerapkan pola **Singleton Client** dan memisahkan pengecekan konfigurasi agar aplikasi tetap responsif dan memberi error message yang jelas saat env belum diatur.

Buat file baru:
`src/lib/redis.ts`

Tulis kode berikut:

```typescript
import { Redis } from '@upstash/redis';

/**
 * Upstash Redis Client Singleton and connection status helper.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRedisConfigured: boolean = Boolean(url && token);

export const redis: Redis | null = isRedisConfigured
  ? new Redis({
      url: url!,
      token: token!,
    })
  : null;

/**
 * Returns the Redis client instance or throws a descriptive error if unconfigured.
 */
export function getRedisClient(): Redis {
  if (!redis) {
    throw new Error(
      'Upstash Redis is not configured. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your environment.'
    );
  }
  return redis;
}
```

---

## Langkah 8: Route Handler Health Check Upstash (`src/app/api/health/route.ts`)

Endpoint ini berfungsi menguji koneksi baca/tulis ke Upstash Redis secara langsung.

Buat file baru:
`src/app/api/health/route.ts`

Tulis kode berikut:

```typescript
import { NextResponse } from 'next/server';
import { getRedisClient, isRedisConfigured } from '@/lib/redis';

export async function GET() {
  if (!isRedisConfigured) {
    return NextResponse.json(
      {
        status: 'unconfigured',
        message: 'Upstash Redis environment variables are missing.',
        timestamp: Date.now(),
      },
      { status: 503 }
    );
  }

  try {
    const client = getRedisClient();
    const testKey = `health:${Date.now()}`;
    await client.set(testKey, 'ok', { ex: 10 });
    const result = await client.get<string>(testKey);

    return NextResponse.json({
      status: 'healthy',
      redis: result === 'ok' ? 'connected' : 'unexpected_response',
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown Redis error',
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
```

---

## Langkah 9: Halaman Utama Pembuat Sesi (`src/app/page.tsx`)

Halaman landing yang bersih dan to the point:
1. Menyediakan tombol **"Mulai Buat Sesi Webhook Baru"** yang secara otomatis meng-generate `sessionId` dan me-redirect user ke `/[sessionId]`.
2. Menyediakan input form untuk membuka sesi manual yang sudah ada.
3. Menampilkan status konfigurasi Upstash Redis secara real-time.

Buka dan ganti isi file:
`src/app/page.tsx`

Tulis kode berikut:

```typescript
import { redirect } from 'next/navigation';
import { generateSessionId } from '@/lib/session';
import { isRedisConfigured } from '@/lib/redis';
import { Radio, ArrowRight, Zap, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

export default function HomePage() {
  async function createSessionAction() {
    'use server';
    const newSessionId = generateSessionId();
    redirect(`/${newSessionId}`);
  }

  async function openManualSessionAction(formData: FormData) {
    'use server';
    const session = formData.get('sessionId')?.toString().trim();
    if (session) {
      redirect(`/${encodeURIComponent(session)}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 md:p-12 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="flex items-center justify-between max-w-5xl w-full mx-auto pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Webhook Relay & Inspector</h1>
            <p className="text-xs text-slate-400">Real-time HTTP devtool powered by Next.js & Upstash</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {isRedisConfigured ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800 rounded-full font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Redis Configured
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/60 text-amber-400 border border-amber-800 rounded-full font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Redis Unconfigured (.env.local)
            </span>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-3xl w-full mx-auto my-auto py-12 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/70 text-indigo-300 border border-indigo-700/50 text-xs font-medium mb-6">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          Fase 1: Setup & Upstash Integration Ready
        </div>

        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
          Tangkap, Inspeksi, dan Replay Webhook Secara Real-Time
        </h2>

        <p className="text-slate-400 text-base md:text-lg max-w-xl mb-8 leading-relaxed">
          Alternatif ringan untuk Webhook.site & RequestBin. Dilengkapi endpoint Edge runtime, stream Server-Sent Events, dan integrasi Upstash Redis.
        </p>

        {/* Action Button */}
        <form action={createSessionAction} className="w-full max-w-md">
          <button
            type="submit"
            className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition duration-150 cursor-pointer text-base"
          >
            <span>Mulai Buat Sesi Webhook Baru</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        {/* Manual Sesi Input */}
        <div className="mt-8 pt-8 border-t border-slate-800/80 w-full max-w-md text-left">
          <label htmlFor="manual-session" className="block text-xs font-medium text-slate-400 mb-2">
            Atau buka sesi yang sudah ada:
          </label>
          <form action={openManualSessionAction} className="flex gap-2">
            <input
              id="manual-session"
              name="sessionId"
              type="text"
              placeholder="Masukkan Session ID..."
              required
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition"
            >
              Buka
            </button>
          </form>
        </div>

        {/* Features preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 w-full text-left">
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <Shield className="w-5 h-5 text-indigo-400 mb-2" />
            <h3 className="text-sm font-semibold text-slate-200">Modern Architecture</h3>
            <p className="text-xs text-slate-400 mt-1">Next.js App Router dengan kecepatan komputasi tinggi.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <Radio className="w-5 h-5 text-indigo-400 mb-2" />
            <h3 className="text-sm font-semibold text-slate-200">Server-Sent Events</h3>
            <p className="text-xs text-slate-400 mt-1">Streaming real-time instan ke browser tanpa socket berat.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <Zap className="w-5 h-5 text-indigo-400 mb-2" />
            <h3 className="text-sm font-semibold text-slate-200">Upstash Redis REST</h3>
            <p className="text-xs text-slate-400 mt-1">Penyimpanan serverless & pub-sub berkecepatan tinggi.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
        <p>Webhook Relay & Inspector DevTool &bull; Fase 1: Setup & Upstash Integration</p>
      </footer>
    </div>
  );
}
```

---

## Langkah 10: Dynamic Route Session Awal (`src/app/[sessionId]/page.tsx`)

Halaman ini menangkap parameter dinamis `sessionId` dan menyiapkan wadah sebelum dashboard lengkap diimplementasikan pada Fase 4.

> **Catatan Next.js 15+ / 16:** Properti `params` pada Server Component diperlakukan sebagai Promise (`params: Promise<{ sessionId: string }>`) sehingga harus di-`await`.

Buat file baru:
`src/app/[sessionId]/page.tsx`

Tulis kode berikut:

```typescript
import Link from 'next/link';
import { ArrowLeft, Radio, Terminal, CheckCircle2 } from 'lucide-react';
import { isValidSessionId } from '@/lib/session';

interface SessionPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function SessionDashboardPage({ params }: SessionPageProps) {
  const { sessionId } = await params;
  const isValid = isValidSessionId(sessionId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-lg hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Session ID:</span>
            <code className="text-xs font-mono bg-slate-800 text-indigo-300 px-2.5 py-1 rounded border border-slate-700">
              {sessionId}
            </code>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Listening (Fase 1 Ready)
          </span>
        </div>
      </header>

      {/* Main Workspace Placeholder */}
      <main className="flex-1 p-6 md:p-8 max-w-5xl mx-auto w-full flex flex-col justify-center items-center text-center">
        {!isValid ? (
          <div className="p-6 rounded-2xl bg-amber-950/40 border border-amber-800 text-amber-200 max-w-md">
            <h2 className="text-lg font-bold mb-2">Session ID Tidak Valid</h2>
            <p className="text-xs text-amber-300/80 mb-4">
              Session ID harus berupa format alfanumerik atau UUID antara 8 hingga 64 karakter.
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium"
            >
              Kembali ke Beranda
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 text-left shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Endpoint Webhook Anda</h2>
                <p className="text-xs text-slate-400">Siap menerima payload HTTP di Fase 2</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6">
              <p className="text-xs text-slate-400 mb-1 font-mono uppercase tracking-wider">Target Ingestion URL:</p>
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                <code className="text-xs font-mono text-indigo-300">
                  {`/api/catch/${sessionId}`}
                </code>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-5 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-300">Tahap Berikutnya:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                <li><strong className="text-slate-300">Fase 2:</strong> Ingestion Route Handler (<code className="text-indigo-300">/api/catch/{sessionId}</code>) & simpan payload ke Upstash Redis.</li>
                <li><strong className="text-slate-300">Fase 3:</strong> Stream Server-Sent Events (<code className="text-indigo-300">/api/stream/{sessionId}</code>).</li>
                <li><strong className="text-slate-300">Fase 4:</strong> Split-screen Dashboard Inspector & realtime activity feed.</li>
                <li><strong className="text-slate-300">Fase 5:</strong> Replay Engine.</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

---

## Langkah 11: Verifikasi Build & Linting

Pastikan kode Anda bebas dari kesalahan sintaksis atau ketidaksesuaian tipe.

### 1. Jalankan Linter
```bash
npm run lint
```
**Output yang diharapkan:**
```text
> webhook-inspector-and-replay-tool@0.1.0 lint
> eslint
```
*(Tidak ada pesan error atau warning)*

### 2. Jalankan Build
```bash
npm run build
```
**Output yang diharapkan:**
```text
▲ Next.js 16.4.2 (Turbopack)
- Environments: .env.local

  Creating an optimized production build ...
✓ Compiled successfully
✓ Finished TypeScript
✓ Generating static pages (5/5)

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /[sessionId]
└ ƒ /api/health

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## Langkah 12: Menjalankan Dev Server

Jalankan server pengembangan:

```bash
npm run dev
```

### Output CLI yang Diharapkan:
```text
> webhook-inspector-and-replay-tool@0.1.0 dev
> next dev

▲ Next.js 16.4.2 (Turbopack)
- Local:        http://localhost:3000
- Network:      http://192.168.x.x:3000
- Environments: .env.local

✓ Starting...
✓ Ready in 600ms
```

### Verifikasi di Browser / cURL:
1. Buka browser di `http://localhost:3000`. Anda akan melihat landing page dengan status konfigurasi Redis dan tombol **"Mulai Buat Sesi Webhook Baru"**.
2. Klik tombol tersebut: browser akan secara otomatis dialihkan ke dynamic URL baru seperti `http://localhost:3000/647b10ac-9210-417d-800d-420a1d79cafa`.
3. Periksa status health check via cURL:
   ```bash
   curl -i http://localhost:3000/api/health
   ```
   * Jika `.env.local` belum diisi:
     ```json
     HTTP/1.1 503 Service Unavailable
     {"status":"unconfigured","message":"Upstash Redis environment variables are missing.","timestamp":1792728797028}
     ```
   * Jika kredensial Upstash sudah diisi dengan benar:
     ```json
     HTTP/1.1 200 OK
     {"status":"healthy","redis":"connected","timestamp":1792728797028}
     ```

Selamat! **Fase 1 telah selesai**. Pondasi arsitektur, routing, model schema, dan koneksi Upstash Redis kini siap untuk dihubungkan dengan Webhook Ingestion Route Handler pada **Fase 2**.
