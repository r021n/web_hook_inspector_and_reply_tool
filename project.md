# Deskripsi Project

**Webhook Inspector & Replay Tool** — alat dev lokal untuk menangkap, menginspeksi, dan me-replay HTTP request secara real-time. Berjalan sepenuhnya di localhost tanpa Redis, tanpa Edge Runtime, dan tanpa auth. Request masuk ke endpoint unik, disimpan ke SQLite via Drizzle ORM, di-push ke dashboard melalui SSE, lalu user dapat menginspeksi detail dan me-replay ke target URL.

**Alur utama:** Request masuk → disimpan ke SQLite → SSE push ke dashboard → inspeksi detail (headers, body, query, method, timing) → replay request.

---

# Tech Stack (Riset 2026)

| Layer            | Teknologi                         | Catatan Kritis                                                                                                         |
| ---------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Runtime          | **Node.js 24**                    | `node:sqlite` Stability 1.2 — Release Candidate, sudah aman dipakai                                                    |
| API Framework    | **Hono 4.12.4+**                  | Wajib ≥4.12.4 — patch CVE-2026-29085 (SSE Control Field Injection)                                                     |
| Node Adapter     | **@hono/node-server v2**          | Throughput 2.3x v1; ⚠️ buffer SSE kecil + tambah `Content-Length` → HTTP/2 PROTOCOL_ERROR. Set `X-Accel-Buffering: no` |
| Database         | **node:sqlite** + **Drizzle ORM** | Drizzle support native driver `drizzle-orm/node-sqlite`                                                                |
| Frontend         | **React 19 + Vite**               | SPA murni                                                                                                              |
| Routing          | **TanStack Router v2**            | Reactive core baru berbasis alien-signals; `key` → `__TSR_key`                                                         |
| Data Fetching    | **TanStack Query v6**             | ⚠️ `useQuery` single options object; `mutateAsync` dihapus; mutation callbacks (`onSuccess`/`onError`) dihapus         |
| Styling          | **Tailwind CSS v4**               | Vite plugin `@tailwindcss/vite` — no `tailwind.config.js`, no PostCSS                                                  |
| UI Components    | **shadcn/ui**                     | Install Tailwind dulu, baru `npx shadcn@latest init`                                                                   |
| State Management | **Zustand v5**                    | Client state (filter, selected request, modal)                                                                         |
| Body Viewer      | **Monaco Editor**                 | Pakai `@monaco-editor/react@next` untuk React 19                                                                       |
| Linter/Formatter | **Biome v2**                      | Satu `biome.json`, ganti ESLint + Prettier. `npx @biomejs/biome init`                                                  |
| Testing          | **Vitest**                        | Butuh Vite ≥6.4.0 dan Node ≥22.12.0                                                                                    |
| Validasi         | **Zod**                           | Schema payload webhook                                                                                                 |
| Package Manager  | **npm**                           | Workspaces via field `workspaces` di root `package.json`                                                               |
| DevTools         | **TanStack Query DevTools v6**    | Observe queries + mutations                                                                                            |

---

# 8 Fase @ 30 Menit

## Fase 1 — Setup Monorepo, Biome & Backend Skeleton

**Yang dikerjakan:**

- Inisialisasi npm workspace: root `package.json` dengan field `"workspaces": ["apps/*", "packages/*"]`.
- Buat `apps/api` (Hono + Node.js), `apps/web` (Vite + React), `packages/shared` (tipe bersama).
- Install Biome di root: `npx @biomejs/biome init` → `biome.json` untuk seluruh monorepo. Tambahkan script `"lint": "biome check --write ."`, `"format": "biome format --write ."`.
- Buat Hono app minimal: `GET /health` → `{ ok: true }`, jalankan di port 3000 via `@hono/node-server`.
- Setup `tsconfig.json` strict mode di masing-masing package.

**Hasil akhir fase:**

- `npm run dev` di root menjalankan API.
- `curl localhost:3000/health` → `{ ok: true }`.
- `npm run lint` membersihkan dan memformat semua file dalam <1 detik.

---

## Fase 2 — Webhook Ingest + Drizzle ORM + SQLite

**Yang dikerjakan:**

- Install `drizzle-orm` + `drizzle-kit`; definisikan schema di `apps/api/src/db/schema.ts` menggunakan `drizzle-orm/node-sqlite`.
- Buat `drizzle.config.ts` dengan `dialect: 'sqlite'`; jalankan `npx drizzle-kit push` untuk buat tabel.
- Buat endpoint `ALL /in/:token` — terima semua method, simpan request ke SQLite via Drizzle (generate `id` dengan `crypto.randomUUID()`).
- Buat endpoint `GET /hooks/:token` → list 50 request terbaru; `GET /hooks/:token/:id` → detail satu request.
- Tambahkan Zod schema untuk validasi payload.

**Hasil akhir fase:**

- `curl -X POST localhost:3000/in/test -d '{"foo":"bar"}'` tersimpan.
- `curl localhost:3000/hooks/test` mengembalikan list berisi request tersebut.
- Autocomplete penuh di query Drizzle; error TypeScript kalau kolom salah.

---

## Fase 3 — SSE Streaming Endpoint + Vitest Setup

**Yang dikerjakan:**

- Buat `EventEmitter` sederhana sebagai bus internal (satu instance, export dari module terpisah).
- Di endpoint ingest (Fase 2), setelah insert sukses, `emit('new-webhook', payload)`.
- Buat `GET /stream/:token` dengan `streamSSE` dari `hono/streaming`:
  - Set header `X-Accel-Buffering: no` (wajib untuk @hono/node-server v2).
  - Forward event ke `stream.writeSSE()`.
  - Heartbeat setiap 15 detik: `stream.writeSSE({ event: 'ping', data: '' })`.
  - Cleanup: `stream.onAbort(() => unsubscribe())` + `finally` block.
- Install Vitest: `npm install -D vitest` di `apps/api`. Buat `vitest.config.ts`. Tulis test pertama dengan `testClient` dari `hono/testing`.

**Hasil akhir fase:**

- Terminal A: `curl -N localhost:3000/stream/test` → tampil SSE event saat webhook ditembak.
- Stream tetap hidup setelah 30+ detik (heartbeat bekerja).
- `npm test` menjalankan test SSE pertama dengan sukses.

---

## Fase 4 — Frontend Setup, Tailwind v4, shadcn/ui & Dashboard Layout

**Yang dikerjakan:**

- Inisialisasi Vite + React + TypeScript di `apps/web`.
- Install Tailwind v4: `npm install tailwindcss @tailwindcss/vite`. Tambahkan plugin di `vite.config.ts`; `@import "tailwindcss"` di `index.css`.
- Install shadcn/ui: `npx shadcn@latest init`, lalu `npx shadcn@latest add button card badge dialog table skeleton toast`.
- Setup TanStack Router v2 dengan dua route: `/` → redirect `/inspect/local`, `/inspect/$token` → dashboard.
- Setup `QueryClientProvider` + TanStack Query DevTools v6.
- Buat hook `useWebhookStream(token)` yang membuka `EventSource` ke `/stream/:token` dan meng-invalidate query TanStack saat event masuk.

**Hasil akhir fase:**

- Buka `localhost:5173/inspect/local` → layout sidebar + panel dengan komponen shadcn.
- DevTools → Network → EventStream → SSE aktif.
- Webhook ditembak via curl → sidebar otomatis refetch.

---

## Fase 5 — Inspector Detail View + Zustand + Monaco Editor

**Yang dikerjakan:**

- Install Zustand + buat `useUIStore` untuk `selectedId`, `filterMethod`, `searchQuery`.
- Buat `RequestList` (sidebar): method badge, path, waktu relatif. Klik → `select(id)` Zustand.
- Buat `RequestDetail`: method + path + timestamp, tabel headers, tabel query params.
- Install `@monaco-editor/react@next` (React 19 compatible). Lazy load via `React.lazy` — bundle Monaco ~3.67 MB, wajib lazy agar initial load cepat.
- Body viewer: jika `application/json` → Monaco dengan language `json`; jika `text/*` → Monaco `plaintext`; jika binary → placeholder ukuran.

**Hasil akhir fase:**

- Klik request → detail tampil dengan Monaco syntax highlighting.
- State UI dikelola Zustand; server state tetap TanStack Query.
- Filter method berfungsi via Zustand.

---

## Fase 6 — Replay Functionality

**Yang dikerjakan:**

- Buat `POST /hooks/:token/:id/replay` di Hono:
  - Ambil request asli dari SQLite.
  - Rekonstruksi `fetch()` dengan method, headers, body sama.
  - Kirim ke target URL dari body request (`{ targetUrl: string }`).
  - Kembalikan response target (status, headers, body).
- Frontend: form replay di panel detail menggunakan shadcn `Dialog`.
- Gunakan `useMutation` — ⚠️ di v6, `onSuccess`/`onError` callback di mutation dihapus; handle di `mutationFn` atau di komponen dengan `useQueryClient()`.
- Simpan hasil replay sebagai entry baru dengan flag `is_replay: 1`.
- Tampilkan response target (status, headers, body) di bawah form.

**Hasil akhir fase:**

- Klik request → isi URL target → Replay → response target muncul di UI.
- Request hasil replay muncul di sidebar.
- Error handling: target URL invalid → pesan error jelas.

---

## Fase 7 — Polish UI + Edge Cases

**Yang dikerjakan:**

- Empty states: "Belum ada request" di sidebar, "Pilih request" di panel detail.
- Loading states: shadcn `Skeleton` di sidebar.
- Error states: pesan jika API down.
- Auto-scroll sidebar ke atas saat request baru masuk via SSE.
- Badge "new" / highlight singkat pada request baru.
- Copy button: raw body, headers JSON, curl command (shadcn `Toast` untuk notifikasi).
- Filter by method + search via Zustand.
- Hapus request individual + "Clear all".

**Hasil akhir fase:**

- UI responsif, tidak ada state kosong membingungkan.
- Copy button berfungsi; filter + clear all berfungsi.
- Toast muncul saat replay sukses/gagal.

---

## Fase 8 — Testing, Dokumentasi & Finalisasi

**Yang dikerjakan:**

- Tulis minimal 3 integration test dengan Vitest:
  1. Ingest → tersimpan → list mengembalikannya.
  2. SSE mengirim event saat request baru masuk.
  3. Replay mengirim request ke target yang benar (mock `fetch`).
- Tulis `README.md`: cara install, cara run, cara pakai, endpoint list.
- `npm run build` untuk frontend; pastikan build sukses tanpa error TypeScript.
- Cek memory leak: buka SSE, tutup tab, log `process.memoryUsage()` — pastikan tidak membengkak.
- Jalankan `biome check` sebagai gate akhir.

**Hasil akhir fase:**

- `npm test` menjalankan seluruh test suite dalam <5 detik.
- Build frontend sukses.
- README lengkap dan bisa diikuti.
- Alur end-to-end terverifikasi: fresh clone → install → dev → tembak webhook → inspeksi → replay.

---
