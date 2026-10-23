# Real-Time Webhook Relay & Inspector (DevTool)

## 1. Overview & Konsep
Mini Ngrok / Webhook Tester berbasis web (mirip *Webhook.site* atau *RequestBin*) untuk menangkap (*catch*), menginspeksi (*inspect*) payload secara *real-time*, dan mengirim ulang (*replay*) HTTP request secara instan ke endpoint target.

* **Tech Focus:** Next.js (App Router), Route Handlers, Edge Runtime, Server-Sent Events (SSE), Upstash Redis.
* **Tantangan Utama:** Menjaga latensi rendah di Edge dan mengelola koneksi *long-lived streaming* (SSE) tanpa *memory leak*.

---

## 2. Hasil Research & Brainstorming

### A. Evaluasi Lingkungan & Hardware
* **Hardware:** Apple M5, 16 GB Unified Memory.
* **Status Keserasian:** Sangat mumpuni dan efisien untuk menjalankan dev server Next.js, live reload, dan browser devtools secara simultan.
* **Database / Broker:** Dipilih **Upstash Redis** (Cloud Serverless via `@upstash/redis` REST API).
  * *Alasan:* Berjalan sempurna di **Edge Runtime** tanpa hambatan TCP connection limit/socket raw.
  * *Alternatif Lokal:* Colima (Docker) tersedia jika di masa depan diperlukan simulasi offline/container lokal.

### B. Arsitektur Komponen
1. **Endpoint Sesi (`/api/catch/[sessionId]`):**
   * Menerima request HTTP (GET, POST, PUT, DELETE, PATCH).
   * Menangkap: Method, URL, Headers, Query Params, Raw/JSON Body, Client IP, dan Timestamp.
   * Menyimpan data riwayat ke Redis (List/Hash) dengan masa kedaluwarsa (TTL 1–24 jam).
   * Mem-publish notifikasi event ke Redis Pub/Sub channel `session:[sessionId]`.
2. **Real-time Pipeline (`/api/stream/[sessionId]`):**
   * Endpoint SSE berbasis standard `ReadableStream` (Edge Runtime).
   * Membuka koneksi event stream ke browser, mengirimkan payload seketika saat event dipublish.
3. **Frontend Dashboard UI:**
   * Split-screen layout:
     * *Kiri:* Real-time activity feed (daftar request terbaru).
     * *Kanan:* Tab Inspector (Headers, Query, Formatted Body Viewer) dan panel Replay.
4. **Replay Engine (`/api/replay`):**
   * Mengambil request yang tersimpan, mengizinkan user mengedit payload/header/target URL, dan melakukan *dispatch* via `fetch()`.

---

## 3. Detail Roadmap & Pembagian Fase (~30 Menit per Fase)

Setiap fase dirancang bertahap, modular, dan dapat diuji secara mandiri (*standalone*).

### Fase 1: Project Setup & Upstash Integration
* **Durasi Target:** ~30 Menit
* **Apa yang Dikerjakan:**
  1. Inisialisasi project Next.js (App Router, TypeScript, Tailwind CSS, Lucide Icons).
  2. Install dan konfigurasi client Upstash (`@upstash/redis`).
  3. Setup environment variables (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
  4. Buat utility helper untuk Redis connection, data models/schema (TypeScript interfaces untuk `WebhookRequest`), dan generator session UUID.
* **Deliverables (Kriteria Selesai):**
  * Project Next.js dapat berjalan via `npm run dev`.
  * Koneksi Upstash teruji (bisa set/get key sederhana melalui script uji/route test).
  * Halaman awal mengarahkan user atau meng-generate `sessionId` unik.

---

### Fase 2: Webhook Ingestion Route Handler (`/api/catch/[sessionId]`)
* **Durasi Target:** ~30 Menit
* **Apa yang Dikerjakan:**
  1. Buat Route Handler dinamis di `app/api/catch/[sessionId]/route.ts` dengan konfigurasi `export const runtime = 'edge'`.
  2. Implementasi parser serbaguna untuk menangkap method HTTP apa pun, headers, query params, dan request body (mendukung JSON, text, atau form-urlencoded).
  3. Simpan data request ke Upstash Redis (`LPUSH` / Hash dengan TTL 2 jam).
  4. Publish metadata request ke channel Redis Pub/Sub untuk realtime trigger.
  5. Kembalikan response cepat `200 OK` `{ "success": true, "id": "..." }` ke pengirim webhook.
* **Deliverables (Kriteria Selesai):**
  * Mengirim cURL / Postman ke `http://localhost:3000/api/catch/test-session` berhasil mengembalikan 200 OK.
  * Payload tersimpan dan terverifikasi di Upstash Redis lengkap dengan timestamp dan headers.

---

### Fase 3: Real-Time SSE Streaming Handler (`/api/stream/[sessionId]`)
* **Durasi Target:** ~30 Menit
* **Apa yang Dikerjakan:**
  1. Buat Route Handler SSE di `app/api/stream/[sessionId]/route.ts`.
  2. Implementasikan `ReadableStream` dengan header `Content-Type: text/event-stream`, `Cache-Control: no-cache`, dan `Connection: keep-alive`.
  3. Hubungkan stream dengan subscriber Upstash atau mekanisme periodic short-poll/pubsub listener ke session key.
  4. Tambahkan mekanisme heartbeat / ping setiap 15 detik agar koneksi tidak diputus oleh proxy/browser.
  5. Tangani gracefully disconnect (clean up listener saat tab/koneksi browser ditutup) untuk mencegah memory leak.
* **Deliverables (Kriteria Selesai):**
  * Akses endpoint via browser/cURL (`curl -N http://localhost:3000/api/stream/test-session`) menjaga koneksi tetap terbuka.
  * Setiap ada webhook baru dikirim ke Fase 2, event data langsung terdorong ke stream terminal/browser secara seketika.

---

### Fase 4: Inspector Web Dashboard & UI Components
* **Durasi Target:** ~30 Menit
* **Apa yang Dikerjakan:**
  1. Bangun halaman dashboard `app/[sessionId]/page.tsx`.
  2. Buat custom hook `useWebhookStream(sessionId)` menggunakan `EventSource` Web API.
  3. Buat komponen **Header / Copy Webhook URL** dengan tombol copy cepat.
  4. Buat komponen **Request Feed List** (sidebar) yang menampilkan badge method (`POST`, `GET`), status, path, dan timestamp.
  5. Buat komponen **Detail Inspector Panel**:
     * Tab Headers (tabel key-value).
     * Tab Query Parameters.
     * Tab Body (JSON formatter/syntax viewer dengan tombol *Copy Payload*).
* **Deliverables (Kriteria Selesai):**
  * UI tampil responsif dan rapi.
  * Ketika ada request webhook baru masuk via cURL/Postman, item baru langsung muncul di sidebar feed tanpa refresh halaman, dan payload bisa diklik serta diinspeksi.

---

### Fase 5: Request Replay & Resend Engine
* **Durasi Target:** ~30 Menit
* **Apa yang Dikerjakan:**
  1. Buat Route Handler `/api/replay` (atau Server Action) yang menerima target URL, HTTP method, custom headers, dan body.
  2. Buat modal / panel form **"Replay Request"** di UI:
     * Input field *Target URL* (misal: `http://localhost:8000/webhook-receiver`).
     * Editable payload area (memungkinkan modifikasi isi JSON sebelum dikirim).
     * Tombol *Send Replay*.
  3. Tampilkan hasil replay: status code balasan target (`200`, `500`, dll.), latency/durasi request, dan response body balasan dari target.
* **Deliverables (Kriteria Selesai):**
  * User dapat memilih salah satu webhook yang telah ditangkap, mengedit URL/body, menekan tombol "Replay", dan melihat response sukses dari server target langsung di UI.
