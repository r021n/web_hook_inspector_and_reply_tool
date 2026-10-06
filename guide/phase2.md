# Panduan Fase 2 — Webhook Ingest + Drizzle ORM + SQLite

> Panduan ini dibuat berdasarkan pengerjaan nyata fase ini. Seluruh langkah sudah
> dijalankan dan diverifikasi pada mesin ini: lint ✅, typecheck ✅, unit test ✅,
> integration test ✅, `drizzle-kit push` ✅, dan alur `curl` ingest → list → detail ✅.
>
> Setiap langkah menjelaskan: **(1)** file apa yang harus ditulis, **(2)** di mana
> letaknya, **(3)** perintah CLI yang dijalankan, dan **(4)** output yang harus muncul.

---

## 0. Cakupan & Hasil Akhir Fase

| Item | Status |
| --- | --- |
| Schema Drizzle `apps/api/src/db/schema.ts` (tabel `webhook_requests` + index) | ✅ |
| `drizzle.config.ts` + script `npm run db:push` | ✅ |
| `ALL /in/:token` — terima semua method, simpan ke SQLite (`id` = `randomUUID()`) | ✅ |
| `GET /hooks/:token` — list 50 request terbaru | ✅ |
| `GET /hooks/:token/:id` — detail satu request | ✅ |
| Validasi Zod: path param + kontrak payload yang disimpan | ✅ |
| Unit test + integration test (Vitest) | ✅ |

**Kriteria sukses dari `project.md` dan buktinya:**

1. `curl -X POST localhost:3000/in/test -d '{"foo":"bar"}'` tersimpan → balasan
   `{"ok":true,"id":"2919feef-…"}` (lihat Langkah 10).
2. `curl localhost:3000/hooks/test` mengembalikan list berisi request tersebut →
   array JSON berisi ringkasan request.
3. Autocomplete penuh di query Drizzle; salah nama kolom → error TypeScript
   (dibuktikan di Langkah 9: `error TS2551: Property 'tokn' does not exist … Did you mean 'token'?`).

---

## 1. Prasyarat

```powershell
node -v   # v26.7.0   (diketahui saat panduan dibuat; Node ≥ 24 juga jalan)
npm -v    # 11.19.0
```

Panduan Fase 1 sudah menghasilkan: monorepo npm workspaces, `apps/api` (Hono +
`@hono/node-server` v2, endpoint `GET /health`), Biome, `tsconfig` strict, dan
Vitest. Fase 2 **menambah** dependency berikut (sekali install, dari root):

| Package | Versi saat panduan dibuat | Peran |
| --- | --- | --- |
| `drizzle-orm` | `1.0.0-rc.4` (tag `@rc`) | ORM + driver `drizzle-orm/node-sqlite` |
| `drizzle-kit` | `1.0.0-rc.4` (tag `@rc`) | CLI `push` untuk membuat tabel |
| `zod` | `4.6.5` | validasi payload (Zod v4) |
| `@hono/zod-validator` | `0.9.1` | middleware validasi Hono untuk Zod |

### Catatan riset dokumentasi (2026) — baca sebelum mengubah versi

- **`drizzle-orm/node-sqlite` HANYA ada di jalur `1.0.0-rc`.** Versi stable
  `0.45.x` yang terpasang awalnya **tidak** punya export `./node-sqlite` sama
  sekali. Dokumentasi resmi (orm.drizzle.team/docs/sqlite/connect-node-sqlite)
  menulis instalasi sebagai `npm i drizzle-orm@rc` + `npm i -D drizzle-kit@rc`.
  Karena itu panduan ini memakai **`@rc`**, bukan `latest`.
- `drizzle-kit` jalur 1.0 **mendeteksi driver `node:sqlite` secara otomatis**
  (pesan saat jalan: `Using 'node:sqlite' driver for database querying`), jadi
  **tidak perlu** `@libsql/client` maupun `better-sqlite3`.
- **Zod v4**: validasi UUID memakai `z.uuid()` (bukan `z.string().uuid()` yang
  sudah deprecated), dan `z.record()` wajib dua argumen: `z.record(z.string(), z.string())`.
- **`node:sqlite`** ada sejak Node 22.5, kini **Stability 1.2 — Release Candidate**
  (di Node 26 tidak ada lagi warning experimental). `DatabaseSync` bersifat sinkron.
- Import relatif di seluruh backend **wajib berekstensi `.ts`** (Node type stripping,
  sudah berlaku sejak Fase 1).

---

## 2. Struktur Folder Hasil Akhir

```
web_hook_inspector_and_reply_tool/
├── .gitignore                  ← edit di langkah 6 (tambah baris *.db)
├── package.json                ← edit di langkah 6 (script db:push)
├── package-lock.json           ← auto, hasil npm install
├── project.md
├── guide/
│   ├── phase1.md
│   └── phase2.md
└── apps/
    └── api/                    ← SEMUA kerjaan Fase 2 ada di sini
        ├── package.json        ← edit di langkah 1 (deps) & langkah 6 (script)
        ├── tsconfig.json       ← edit di langkah 6 (include drizzle.config.ts)
        ├── drizzle.config.ts   ← buat di langkah 6
        ├── webhook-inspector.db    ← auto, hasil drizzle-kit push (di-gitignore)
        └── src/
            ├── app.ts              ← edit di langkah 5 (mount router)
            ├── validation.ts       ← buat di langkah 4
            ├── validation.test.ts  ← buat di langkah 8
            ├── webhooks.integration.test.ts  ← buat di langkah 8
            ├── db/
            │   ├── schema.ts       ← buat di langkah 2
            │   ├── path.ts         ← buat di langkah 3
            │   ├── path.test.ts    ← buat di langkah 8
            │   └── index.ts        ← buat di langkah 3
            └── routes/
                └── webhooks.ts     ← buat di langkah 5
```

> Jalankan semua perintah npm **dari root folder project**
> (`D:\coding\web\web_hook_inspector_and_reply_tool`), kecuali disebutkan lain.

---

## 3. Langkah 1 — Install dependencies

**Jalankan perintah** (dari root):

```powershell
npm install drizzle-orm@rc zod @hono/zod-validator -w apps/api
npm install -D drizzle-kit@rc -w apps/api
```

`-w apps/api` = pasang hanya ke workspace backend. **Output yang muncul**
(angka bisa sedikit berbeda tergantung waktu):

```text
added 3 packages, and audited 60 packages in 21s

14 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

```text
added 9 packages, and audited 69 packages in 15s

16 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.25.12 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

> Baris `npm warn install-scripts … esbuild` muncul dari `drizzle-kit` (dia
> memakai esbuild untuk memuat `drizzle.config.ts`) — itu peringatan biasa,
> bukan error. Yang wajib diperhatikan: `found 0 vulnerabilities`.

**Verifikasi versi yang terpasang:**

```powershell
npm ls drizzle-orm drizzle-kit zod @hono/zod-validator --all
```

```text
webhook-inspector@0.1.0 D:\coding\web\web_hook_inspector_and_reply_tool
└─┬ @whi/api@0.0.0 -> .\apps\api
  ├─┬ @hono/zod-validator@0.9.1
  │ └── zod@4.6.5 deduped
  ├── drizzle-kit@1.0.0-rc.4
  ├─┬ drizzle-orm@1.0.0-rc.4
  │ └── zod@4.6.5 deduped
  └── zod@4.6.5
```

`apps/api/package.json` otomatis bertambah (jangan dihapus):

```json
"dependencies": {
  "@hono/zod-validator": "^0.9.1",
  "drizzle-orm": "^1.0.0-rc.4",
  "zod": "^4.6.5"
},
"devDependencies": {
  "drizzle-kit": "^1.0.0-rc.4"
}
```

---

## 4. Langkah 2 — Schema Drizzle

**Tulis file:** `apps/api/src/db/schema.ts`

```ts
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Satu baris = satu request HTTP yang ditangkap oleh endpoint `ALL /in/:token`.
 */
export const webhookRequests = sqliteTable(
  "webhook_requests",
  {
    /** Di-generate aplikasi via crypto.randomUUID(), bukan autoincrement. */
    id: text("id").primaryKey(),
    /** Token dari URL (/in/:token) — memisahkan channel antar klien. */
    token: text("token").notNull(),
    /** HTTP method asli, contoh: POST */
    method: text("method").notNull(),
    /** Path lengkap tanpa query string, contoh: /in/test */
    path: text("path").notNull(),
    /** Query string mentah tanpa "?", contoh: a=1&b=2 ("" bila kosong). */
    query: text("query").notNull().default(""),
    /** Seluruh header sebagai JSON object (disimpan sebagai teks). */
    headers: text("headers").notNull(),
    /** Nilai header content-type apa adanya, null bila tidak dikirim. */
    contentType: text("content_type"),
    /** Isi body: teks biasa, atau base64 bila bodyEncoding = "base64". */
    body: text("body"),
    /** "text" | "base64" — dipilih dari content-type request. */
    bodyEncoding: text("body_encoding").notNull().default("text"),
    /** Ukuran body ASLI dalam byte (sebelum encoding base64). */
    bodySize: integer("body_size").notNull().default(0),
    /** Epoch millisecond saat request diterima. */
    receivedAt: integer("received_at").notNull(),
  },
  (table) => [
    // Membuat query "50 terbaru milik token X" tetap index scan.
    index("webhook_requests_token_received_at_idx").on(
      table.token,
      table.receivedAt,
    ),
  ],
);

export type WebhookRequestRow = typeof webhookRequests.$inferSelect;
```

Penjelasan keputusan desain:

| Kolom | Alasan |
| --- | --- |
| `id` `text` PK | `project.md` mensyaratkan `crypto.randomUUID()`; bukan autoincrement supaya id tidak menebak jumlah request |
| `headers` teks (JSON) | SQLite tidak punya tipe object; di-parse lagi saat membaca detail |
| `body` + `bodyEncoding` | body binary (gambar, protobuf) disimpan sebagai **base64** supaya tidak rusak; body teks disimpan apa adanya |
| `bodySize` | ukuran asli byte → dipakai list/detail tanpa perlu menghitung ulang base64 |
| index `(token, received_at)` | list "50 terbaru per token" jadi index scan, bukan full table scan |
| argumen ketiga memakai **array** `(table) => [...]` | bentuk terbaru Drizzle 1.0 untuk definisi index |

---

## 5. Langkah 3 — Path database + koneksi

### 5a. `apps/api/src/db/path.ts`

**Tulis file:** `apps/api/src/db/path.ts`

```ts
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Root workspace backend (folder tempat drizzle.config.ts berada). */
export const API_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Path file SQLite.
 *
 * - `DB_FILE_NAME` tidak di-set  → `<API_ROOT>/webhook-inspector.db`
 * - `DB_FILE_NAME=":memory:"`   → database in-memory (dipakai test)
 * - `DB_FILE_NAME` absolut       → dipakai apa adanya
 * - `DB_FILE_NAME` relatif       → di-resolve terhadap cwd proses
 *
 * Sengaja dibuat fungsi (bukan konstanta module-level) supaya test bisa
 * meng-set `process.env.DB_FILE_NAME` sebelum koneksi pertama dibuat.
 */
export function resolveDbPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.DB_FILE_NAME;
  if (raw === undefined || raw === "") {
    return join(API_ROOT, "webhook-inspector.db");
  }
  if (raw === ":memory:") {
    return raw;
  }
  return isAbsolute(raw) ? raw : resolve(raw);
}
```

Dua poin yang jangan diubah:

- Path default dihitung dari lokasi file (`import.meta.url`), **bukan cwd**, jadi
  tetap menunjuk `apps/api/webhook-inspector.db` walau server dijalankan dari root.
- `resolveDbPath()` adalah **fungsi**, bukan konstanta — test meng-set
  `DB_FILE_NAME` *setelah* import module tetapi *sebelum* request pertama.

### 5b. `apps/api/src/db/index.ts`

**Tulis file:** `apps/api/src/db/index.ts`

```ts
import { DatabaseSync } from "node:sqlite";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { resolveDbPath } from "./path.ts";

/** Tipe database = driver node:sqlite tanpa relasi (relasi belum dipakai). */
export type Db = NodeSQLiteDatabase;

let db: Db | undefined;
let client: DatabaseSync | undefined;

/**
 * Koneksi database dibuat LAZY (saat request pertama), bukan saat module load.
 *
 * Alasan: test meng-set `process.env.DB_FILE_NAME` ke file sementara setelah
 * import, tetapi sebelum request pertama dijalankan.
 */
export function getDb(): Db {
  if (db === undefined) {
    client = new DatabaseSync(resolveDbPath());
    // WAL: reader (API) tidak saling mengunci dengan writer (drizzle-kit push).
    client.exec("PRAGMA journal_mode = WAL;");
    db = drizzle({ client });
  }
  return db;
}

/** Tutup koneksi (test memakai ini agar file DB sementara bisa dihapus). */
export function closeDb(): void {
  client?.close();
  client = undefined;
  db = undefined;
}
```

Catatan:

- `drizzle({ client })` — **tanpa** opsi `schema`: di Drizzle 1.0 opsi itu untuk
  objek relasi (`defineRelations`), bukan modul tabel. Kita belum butuh
  `db.query.*`, cukup query builder biasa.
- `PRAGMA journal_mode = WAL` → API (reader) bisa membaca saat `drizzle-kit push`
  (writer) berjalan, dan sebaliknya.
- `closeDb()` hanya dipakai test supaya file DB sementara bisa dihapus di Windows
  (file yang masih dibuka tidak bisa dihapus).

---

## 6. Langkah 4 — Skema validasi Zod

**Tulis file:** `apps/api/src/validation.ts`

```ts
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";

/**
 * Validasi payload (Zod) — dua peran:
 * 1. Menolak parameter URL yang tidak sah SEBELUM menyentuh database.
 * 2. Menjadi kontrak tipe untuk payload yang disimpan & dikembalikan API.
 *
 * Catatan: body webhook TIDAK divalidasi terhadap skema tertentu — inspector
 * harus bisa menangkap payload apa pun, termasuk yang rusak.
 */

/** Token di URL: /in/:token — huruf, angka, titik, underscore, strip. */
export const tokenSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);

export const tokenParamSchema = z.object({ token: tokenSchema });

/** Param untuk detail: token + id request (harus UUID v4 dari randomUUID()). */
export const requestParamSchema = z.object({
  token: tokenSchema,
  id: z.uuid(),
});

/** Kontrak object yang di-insert ke tabel webhook_requests. */
export const capturedRequestSchema = z.object({
  id: z.uuid(),
  token: tokenSchema,
  method: z.string().min(1).max(32),
  path: z.string().min(1),
  query: z.string(),
  headers: z.record(z.string(), z.string()),
  contentType: z.string().nullable(),
  body: z.string().nullable(),
  bodyEncoding: z.enum(["text", "base64"]),
  bodySize: z.number().int().min(0),
  receivedAt: z.number().int().positive(),
});

export type CapturedRequest = z.infer<typeof capturedRequestSchema>;

/**
 * Middleware validasi path parameter dengan pesan error yang rapi.
 *
 * Default `zValidator` mengembalikan `{ success, error }` berisi ZodError yang
 * di-serialize sebagai string; hook ini menggantinya dengan body 400 yang
 * stabil: `{ "error": "...", "issues": [...] }`.
 */
export function paramValidator<T extends z.ZodType>(schema: T) {
  return zValidator("param", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "invalid path parameter", issues: result.error.issues },
        400,
      );
    }
  });
}

/** Ringkasan untuk list (50 terbaru) — tanpa headers/body. */
export const requestSummarySchema = z.object({
  id: z.uuid(),
  method: z.string(),
  path: z.string(),
  query: z.string(),
  contentType: z.string().nullable(),
  bodySize: z.number().int(),
  receivedAt: z.number().int(),
});

export type RequestSummary = z.infer<typeof requestSummarySchema>;

/** Detail lengkap satu request. */
export const requestDetailSchema = requestSummarySchema.extend({
  token: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
  bodyEncoding: z.enum(["text", "base64"]),
});

export type RequestDetail = z.infer<typeof requestDetailSchema>;
```

Kenapa begini:

- **Body webhook tidak divalidasi** — tugas inspector adalah menangkap apa pun
  yang dikirim, termasuk payload rusak. Yang divalidasi adalah **path param**
  (supaya token aneh tidak masuk ke query) dan **payload yang akan disimpan**
  (`capturedRequestSchema.parse(...)` = jaring pengaman sebelum insert).
- `requestSummarySchema` / `requestDetailSchema` dipakai sebagai **kontrak tipe**
  respons list & detail (dicek TypeScript saat runtime menunya disusun).
- `paramValidator()` adalah pembungkus `zValidator` dari `@hono/zod-validator`
  dengan hook: kalau validasi gagal, balas `400` dengan body
  `{"error":"invalid path parameter","issues":[…]}` (default-nya mengembalikan
  ZodError yang di-string-kan, kurang enak dibaca).

---

## 7. Langkah 5 — Endpoint webhook

**Tulis file:** `apps/api/src/routes/webhooks.ts`

```ts
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/index.ts";
import { type WebhookRequestRow, webhookRequests } from "../db/schema.ts";
import {
  capturedRequestSchema,
  paramValidator,
  type RequestDetail,
  type RequestSummary,
  requestParamSchema,
  tokenParamSchema,
} from "../validation.ts";

export const webhooksRouter = new Hono();

const TEXTUAL_CONTENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/graphql",
  "application/x-www-form-urlencoded",
]);

/** Body dianggap teks bila content-type-nya textual; selain itu → base64. */
function isTextual(contentType: string | null): boolean {
  if (contentType === null) {
    return true; // tanpa content-type → anggap teks
  }
  const essence = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return (
    essence.startsWith("text/") ||
    essence.endsWith("+json") ||
    essence.endsWith("+xml") ||
    TEXTUAL_CONTENT_TYPES.has(essence)
  );
}

function toSummary(row: WebhookRequestRow): RequestSummary {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    query: row.query,
    contentType: row.contentType,
    bodySize: row.bodySize,
    receivedAt: row.receivedAt,
  };
}

function parseHeaders(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, string>;
    }
  } catch {
    // headers tersimpan rusak → kembalikan kosong, jangan 500
  }
  return {};
}

function toDetail(row: WebhookRequestRow): RequestDetail {
  return {
    ...toSummary(row),
    token: row.token,
    headers: parseHeaders(row.headers),
    body: row.body,
    bodyEncoding: row.bodyEncoding === "base64" ? "base64" : "text",
  };
}

/**
 * ALL /in/:token — terima SEMUA method, simpan ke SQLite.
 */
webhooksRouter.all(
  "/in/:token",
  paramValidator(tokenParamSchema),
  async (c) => {
    const url = new URL(c.req.url);
    const rawHeaders = Object.fromEntries(c.req.raw.headers);
    const contentType = rawHeaders["content-type"] ?? null;
    const bytes = Buffer.from(await c.req.arrayBuffer());
    const textual = isTextual(contentType);

    const captured = capturedRequestSchema.parse({
      id: randomUUID(),
      token: c.req.param("token"),
      method: c.req.method,
      path: url.pathname,
      query: url.search.slice(1),
      headers: rawHeaders,
      contentType,
      body:
        bytes.length === 0
          ? null
          : textual
            ? bytes.toString("utf8")
            : bytes.toString("base64"),
      bodyEncoding: textual ? "text" : "base64",
      bodySize: bytes.length,
      receivedAt: Date.now(),
    });

    await getDb()
      .insert(webhookRequests)
      .values({ ...captured, headers: JSON.stringify(captured.headers) });

    return c.json({ ok: true, id: captured.id });
  },
);

/** GET /hooks/:token — 50 request terbaru untuk token tersebut. */
webhooksRouter.get(
  "/hooks/:token",
  paramValidator(tokenParamSchema),
  async (c) => {
    const rows = await getDb()
      .select()
      .from(webhookRequests)
      .where(eq(webhookRequests.token, c.req.param("token")))
      .orderBy(desc(webhookRequests.receivedAt))
      .limit(50);

    return c.json(rows.map(toSummary));
  },
);

/** GET /hooks/:token/:id — detail satu request. */
webhooksRouter.get(
  "/hooks/:token/:id",
  paramValidator(requestParamSchema),
  async (c) => {
    const row = await getDb()
      .select()
      .from(webhookRequests)
      .where(
        and(
          eq(webhookRequests.token, c.req.param("token")),
          eq(webhookRequests.id, c.req.param("id")),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (row === undefined) {
      return c.json({ error: "request not found" }, 404);
    }
    return c.json(toDetail(row));
  },
);
```

### 7a. Mount router di `apps/api/src/app.ts` (edit)

**Tulis ulang isi** `apps/api/src/app.ts`:

```ts
import type { HealthResponse } from "@whi/shared";
import { Hono } from "hono";
import { webhooksRouter } from "./routes/webhooks.ts";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true } satisfies HealthResponse));

// Endpoint webhook (Fase 2): ALL /in/:token, GET /hooks/:token[/:id]
app.route("/", webhooksRouter);
```

### Kontrak API hasil Fase 2

| Method + Path | Fungsi | Status sukses | Gagal |
| --- | --- | --- | --- |
| `ALL /in/:token` | simpan request | `200` `{"ok":true,"id":"<uuid>"}` | `400` bila token tidak sah |
| `GET /hooks/:token` | 50 terbaru (ringkasan) | `200` array JSON | `400` bila token tidak sah |
| `GET /hooks/:token/:id` | detail lengkap | `200` object JSON | `400` token/id tidak sah, `404` tidak ada |
| `GET /health` | dari Fase 1 | `200` `{"ok":true}` | — |

Ringkasan list = `id, method, path, query, contentType, bodySize, receivedAt`
(tanpa `headers`/`body` supaya list tetap ringan). Detail = semua kolom, dengan
`headers` sebagai object dan `bodyEncoding` bernilai `"text"`/`"base64"`.

---

## 8. Langkah 6 — drizzle.config, script, tsconfig, .gitignore

### 8a. **Tulis file:** `apps/api/drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";
import { resolveDbPath } from "./src/db/path.ts";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    // Sumber kebenaran yang sama dengan yang dipakai aplikasi (src/db/path.ts),
    // jadi `drizzle-kit push` dan server selalu menyentuh file yang sama.
    url: resolveDbPath(),
  },
});
```

`dbCredentials.url` memakai `resolveDbPath()` dari `src/db/path.ts`, sehingga
`drizzle-kit` dan server **selalu** menunjuk file DB yang sama (termasuk saat
`DB_FILE_NAME` di-set untuk test).

### 8b. **Edit** `apps/api/package.json` — tambahkan satu script

```json
"test": "vitest run",
"db:push": "drizzle-kit push"
```

### 8c. **Edit** `package.json` (root) — tambahkan satu script

```json
"dev:web": "npm run dev --workspace apps/web",
"db:push": "npm run db:push --workspace apps/api",
```

### 8d. **Edit** `apps/api/tsconfig.json` — ikut di-typecheck

```json
"include": ["src/**/*.ts", "drizzle.config.ts"]
```

### 8e. **Edit** `.gitignore` (root) — file DB jangan masuk git

Tambahkan 4 baris ini:

```gitignore
*.db
*.db-journal
*.db-wal
*.db-shm
```

(Windows membuat `webhook-inspector.db-wal` dan `-shm` karena WAL aktif.)

---

## 9. Langkah 7 — Buat tabel: `drizzle-kit push`

**Jalankan perintah** (dari root):

```powershell
npm run db:push
```

**Output yang muncul (sekali jalan pertama kali):**

```text
> webhook-inspector@0.1.0 db:push
> npm run db:push --workspace apps/api

> @whi/api@0.0.0 db:push
> drizzle-kit push

No config path provided, using default 'drizzle.config.ts'
Reading config file 'D:\coding\web\web_hook_inspector_and_reply_tool\apps\api\drizzle.config.ts'
Reading schema files:
D:\coding\web\web_hook_inspector_and_reply_tool\apps\api\src\db\schema.ts

Using 'node:sqlite' driver for database querying
[⣷] Pulling schema from database...
[✓] Pulling schema from database...
[✓] Changes applied
```

Periksa file DB sudah terbentuk:

```powershell
ls apps/api/*.db*
```

```text
webhook-inspector.db
webhook-inspector.db-shm
webhook-inspector.db-wal
```

**Jalankan lagi** — wajib idempoten:

```powershell
npm run db:push
```

```text
Using 'node:sqlite' driver for database querying
[⣷] Pulling schema from database...
[✓] Pulling schema from database...

[i] No changes detected
```

> **Urutan penting:** `npm run db:push` harus dijalankan **sebelum** server
> menerima request. Kalau tabel belum ada, endpoint `/in/…` dan `/hooks/…`
> membalas `500 Internal Server Error` (lihat Troubleshooting).

Tabel & index yang dibuat (diverifikasi langsung dari `sqlite_master`):

```sql
CREATE TABLE `webhook_requests` (
  `id` text PRIMARY KEY,
  `token` text NOT NULL,
  `method` text NOT NULL,
  `path` text NOT NULL,
  `query` text DEFAULT '' NOT NULL,
  `headers` text NOT NULL,
  `content_type` text,
  `body` text,
  `body_encoding` text DEFAULT 'text' NOT NULL,
  `body_size` integer DEFAULT 0 NOT NULL,
  `received_at` integer NOT NULL
);
CREATE INDEX `webhook_requests_token_received_at_idx`
  ON `webhook_requests` (`token`,`received_at`);
```

---

## 10. Langkah 8 — Test (unit + integration)

### 10a. **Tulis file:** `apps/api/src/validation.test.ts`

```ts
import { describe, expect, test } from "vitest";
import {
  capturedRequestSchema,
  requestParamSchema,
  tokenParamSchema,
} from "./validation.ts";

describe("tokenParamSchema", () => {
  test("menerima token yang sah", () => {
    expect(tokenParamSchema.safeParse({ token: "test" }).success).toBe(true);
    expect(tokenParamSchema.safeParse({ token: "my-hook_1.a-b" }).success).toBe(
      true,
    );
  });

  test("menolak token kosong / mengandung spasi / terlalu panjang", () => {
    expect(tokenParamSchema.safeParse({ token: "" }).success).toBe(false);
    expect(tokenParamSchema.safeParse({ token: "bad token" }).success).toBe(
      false,
    );
    expect(tokenParamSchema.safeParse({ token: "a/b" }).success).toBe(false);
    expect(tokenParamSchema.safeParse({ token: "x".repeat(65) }).success).toBe(
      false,
    );
  });
});

describe("requestParamSchema", () => {
  test("menerima token + id UUID", () => {
    const result = requestParamSchema.safeParse({
      token: "test",
      id: "e3366c4b-d81d-46eb-8992-97b9809307ac",
    });
    expect(result.success).toBe(true);
  });

  test("menolak id yang bukan UUID", () => {
    expect(
      requestParamSchema.safeParse({ token: "test", id: "not-a-uuid" }).success,
    ).toBe(false);
    expect(
      requestParamSchema.safeParse({ token: "test", id: "" }).success,
    ).toBe(false);
  });
});

const validCaptured = {
  id: "e3366c4b-d81d-46eb-8992-97b9809307ac",
  token: "test",
  method: "POST",
  path: "/in/test",
  query: "foo=1",
  headers: { "content-type": "application/json" },
  contentType: "application/json",
  body: '{"foo":"bar"}',
  bodyEncoding: "text",
  bodySize: 13,
  receivedAt: 1791269374858,
} as const;

describe("capturedRequestSchema", () => {
  test("menerima payload yang akan disimpan", () => {
    expect(capturedRequestSchema.safeParse(validCaptured).success).toBe(true);
  });

  test("menolak bodyEncoding di luar text/base64", () => {
    expect(
      capturedRequestSchema.safeParse({
        ...validCaptured,
        bodyEncoding: "hex",
      }).success,
    ).toBe(false);
  });

  test("menolak bodySize negatif / bukan integer", () => {
    expect(
      capturedRequestSchema.safeParse({ ...validCaptured, bodySize: -1 })
        .success,
    ).toBe(false);
    expect(
      capturedRequestSchema.safeParse({ ...validCaptured, bodySize: 1.5 })
        .success,
    ).toBe(false);
  });

  test("menolak id yang bukan UUID dan receivedAt nol", () => {
    expect(
      capturedRequestSchema.safeParse({ ...validCaptured, id: "abc" }).success,
    ).toBe(false);
    expect(
      capturedRequestSchema.safeParse({ ...validCaptured, receivedAt: 0 })
        .success,
    ).toBe(false);
  });
});
```

### 10b. **Tulis file:** `apps/api/src/db/path.test.ts`

```ts
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { API_ROOT, resolveDbPath } from "./path.ts";

describe("resolveDbPath", () => {
  test("default → <apps/api>/webhook-inspector.db", () => {
    expect(resolveDbPath({})).toBe(join(API_ROOT, "webhook-inspector.db"));
  });

  test("nilai kosong → default", () => {
    expect(resolveDbPath({ DB_FILE_NAME: "" })).toBe(
      join(API_ROOT, "webhook-inspector.db"),
    );
  });

  test(":memory: dipertahankan apa adanya", () => {
    expect(resolveDbPath({ DB_FILE_NAME: ":memory:" })).toBe(":memory:");
  });

  test("path absolut dipertahankan", () => {
    const absolute = join(API_ROOT, "custom.db");
    expect(resolveDbPath({ DB_FILE_NAME: absolute })).toBe(absolute);
  });

  test("path relatif di-resolve terhadap cwd", () => {
    expect(resolveDbPath({ DB_FILE_NAME: join("data", "x.db") })).toBe(
      resolve(join("data", "x.db")),
    );
  });
});
```

### 10c. **Tulis file:** `apps/api/src/webhooks.integration.test.ts`

Test ini menjalankan server HTTP sungguhan (port acak) di atas **file DB sementara**
per-run, jadi aman untuk dijalankan berapa kali pun dan tidak menyentuh data dev.

```ts
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "./app.ts";
import { closeDb } from "./db/index.ts";
import { API_ROOT } from "./db/path.ts";

// File DB unik per run. Harus di-set SEBELUM request pertama: koneksi SQLite
// dibuat lazy (lihat src/db/index.ts), jadi nilai ini masih terbaca tepat waktu.
const testDb = join(tmpdir(), `whi-test-${randomUUID()}.db`);
process.env.DB_FILE_NAME = testDb;

// Lokasi binary drizzle-kit di-resolve dari node_modules (tanpa hardcode path).
const kitBin = join(
  dirname(createRequire(import.meta.url).resolve("drizzle-kit")),
  "bin.cjs",
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let server: ServerType | undefined;
let base = "";

beforeAll(async () => {
  // Buat tabel di DB test memakai perintah yang sama dengan yang dipakai dev.
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
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
  }
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${testDb}${suffix}`, { force: true });
  }
});

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`);
  expect(res.status).toBe(200);
  return res.json();
}

async function ingest(
  token: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${base}/in/${token}`, init);
  expect(res.status).toBe(200);
  return res.json() as Promise<{ ok: boolean; id: string }>;
}

describe("webhook ingest → list → detail (HTTP asli)", () => {
  test("POST JSON tersimpan, muncul di list, dan detail lengkap", async () => {
    const created = await ingest("alpha", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    expect(created.ok).toBe(true);
    expect(created.id).toMatch(UUID_RE);

    const list = (await getJson("/hooks/alpha")) as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      method: "POST",
      path: "/in/alpha",
      query: "",
      contentType: "application/json",
      bodySize: 13,
    });
    // list adalah ringkasan: body & headers tidak dikirim
    expect(list[0]).not.toHaveProperty("headers");
    expect(list[0]).not.toHaveProperty("body");

    const detail = (await getJson(`/hooks/alpha/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(detail.token).toBe("alpha");
    expect(detail.method).toBe("POST");
    expect(detail.body).toBe('{"foo":"bar"}');
    expect(detail.bodyEncoding).toBe("text");
    expect(detail.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(typeof detail.receivedAt).toBe("number");
  });

  test("query string tersimpan tanpa tanda ?", async () => {
    const res = await fetch(`${base}/in/query?foo=1&bar=2`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "halo dunia",
    });
    expect(res.status).toBe(200);
    const list = (await getJson("/hooks/query")) as { query: string }[];
    expect(list[0].query).toBe("foo=1&bar=2");
  });

  test("body binary disimpan sebagai base64 dengan ukuran asli", async () => {
    const bytes = Uint8Array.from([0, 1, 2, 255, 254, 0, 10]);
    const created = await ingest("binary", {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: bytes,
    });
    const detail = (await getJson(`/hooks/binary/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(detail.method).toBe("PUT");
    expect(detail.bodyEncoding).toBe("base64");
    expect(detail.body).toBe(Buffer.from(bytes).toString("base64"));
    expect(detail.bodySize).toBe(bytes.length);
  });

  test("request tanpa body (GET) menyimpan body null", async () => {
    const created = await ingest("nobody", { method: "GET" });
    const detail = (await getJson(`/hooks/nobody/${created.id}`)) as Record<
      string,
      unknown
    >;
    expect(detail.method).toBe("GET");
    expect(detail.body).toBeNull();
    expect(detail.bodySize).toBe(0);
    expect(detail.bodyEncoding).toBe("text");
  });

  test("token yang belum pernah dipakai → list kosong", async () => {
    expect(await getJson("/hooks/never-used")).toEqual([]);
  });

  test("token tidak valid → 400 + issues Zod", async () => {
    const res = await fetch(`${base}/in/bad%20token`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      issues: { path: string[] }[];
    };
    expect(body.error).toBe("invalid path parameter");
    expect(body.issues[0]?.path).toEqual(["token"]);
  });

  test("id tidak ditemukan → 404", async () => {
    const res = await fetch(
      `${base}/hooks/alpha/00000000-0000-4000-8000-000000000000`,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "request not found" });
  });

  test("list di-limit 50 walaupun request lebih banyak", async () => {
    for (let i = 0; i < 52; i++) {
      await ingest("limit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ i }),
      });
    }
    const list = (await getJson("/hooks/limit")) as unknown[];
    expect(list).toHaveLength(50);
  });
});
```

Penjelasan 3 baris kritis:

1. `process.env.DB_FILE_NAME = testDb` di **top-level file** (bukan di `beforeAll`)
   — koneksi DB dibuat lazy, jadi nilai ini masih terbaca saat request pertama.
2. `spawnSync(process.execPath, [kitBin, "push"])` → membuat tabel di DB test
   memakai **perintah yang sama** dengan yang dipakai developer (tanpa duplikasi DDL).
3. `afterAll` → `closeDb()` dulu, baru `rmSync` file DB (di Windows file yang masih
   dibuka tidak bisa dihapus).

**Jalankan seluruh test:**

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

 Test Files  6 passed (6)
      Tests  27 passed (27)
   Duration  2.82s
```

Cakupan test:

| File | Jenis | Yang diverifikasi |
| --- | --- | --- |
| `app.test.ts` | unit (Fase 1) | route `/health` |
| `config.test.ts` | unit (Fase 1) | `resolvePort()` |
| `health.integration.test.ts` | integration (Fase 1) | HTTP asli `/health` |
| `validation.test.ts` | unit | token/id/`capturedRequestSchema` diterima-ditolak |
| `db/path.test.ts` | unit | resolusi path DB (default, `:memory:`, absolut, relatif) |
| `webhooks.integration.test.ts` | integration | ingest→list→detail, query, binary base64, GET tanpa body, list kosong, 400, 404, limit 50 |

---

## 11. Langkah 9 — Typecheck, lint, dan bukti autocomplete Drizzle

```powershell
npm run typecheck
```

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

(Tanpa baris error — `drizzle.config.ts` ikut di-typecheck berkat edit tsconfig.)

```powershell
npm run lint
```

```text
> webhook-inspector@0.1.0 lint
> biome check --write

Checked 33 files in 35ms. No fixes applied.
```

> Jalankan dua kali bila baru menulis file: baris pertama biasanya
> `Fixed N files` (auto-format), kedua kali harus `No fixes applied`.

**Bukti autocomplete/query type-safe** (kriteria 3 dari `project.md`). Simpan
sementara file `apps/api/src/__probe.ts` berisi query dengan kolom salah:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "./db/index.ts";
import { webhookRequests } from "./db/schema.ts";

await getDb()
  .select()
  .from(webhookRequests)
  .where(eq(webhookRequests.tokn, "x"));
```

`npx tsc --noEmit` di `apps/api` menghasilkan:

```text
src/__probe.ts(9,29): error TS2551: Property 'tokn' does not exist on type
'SQLiteTableWithColumns<{ name: "webhook_requests"; ... }>'.
Did you mean 'token'?
```

**Hapus file itu lagi** (`del apps\api\src\__probe.ts`) dan jalankan
`npm run typecheck` untuk memastikan kembali bersih.

---

## 12. Langkah 10 — Jalankan server & verifikasi dengan curl

**Terminal A** (dari root):

```powershell
npm run db:push   # sekali saja / bila schema berubah
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

**Terminal B** — jalankan urutan ini persis:

```powershell
curl http://localhost:3000/health
```

```text
{"ok":true}
```

```powershell
curl -X POST localhost:3000/in/test -d '{"foo":"bar"}'
```

```text
{"ok":true,"id":"2919feef-7c22-41e0-a369-a55665f5f250"}
```

```powershell
curl localhost:3000/hooks/test
```

```text
[{"id":"2919feef-7c22-41e0-a369-a55665f5f250","method":"POST","path":"/in/test","query":"","contentType":"application/x-www-form-urlencoded","bodySize":13,"receivedAt":1791270058576}, …]
```

> `curl -d` tanpa header mengirim `content-type: application/x-www-form-urlencoded`
> — tetap diperlakukan sebagai teks, jadi body tersimpan apa adanya.

Detail satu request (ganti `<id>` dengan `id` dari langkah sebelumnya):

```powershell
curl localhost:3000/hooks/test/<id>
```

```text
{"id":"e3366c4b-d81d-46eb-8992-97b9809307ac","method":"POST","path":"/in/test","query":"","contentType":"application/json","bodySize":13,"receivedAt":1791269374858,"token":"test","headers":{"accept":"*/*","content-length":"13","content-type":"application/json","host":"localhost:3000","user-agent":"curl/8.18.0"},"body":"{\"foo\":\"bar\"}","bodyEncoding":"text"}
```

Query string (tersimpan tanpa `?`):

```powershell
curl -X POST "localhost:3000/in/test?foo=1&bar=2" -H "content-type: text/plain" -d "halo dunia"
curl localhost:3000/hooks/test      # lihat field "query":"foo=1&bar=2"
```

Body binary → base64:

```powershell
curl -X POST localhost:3000/in/bin -H "content-type: application/octet-stream" --data-binary @apps/api/webhook-inspector.db
```

```text
{"ok":true,"id":"5dd40564-aa17-410a-b5aa-34474643d63e"}
```

(Di detail, `bodyEncoding` = `"base64"`, `bodySize` = ukuran file asli.)

Token tidak valid → `400`:

```powershell
curl "localhost:3000/in/bad%20token"
```

```text
{"error":"invalid path parameter","issues":[{"origin":"string","code":"invalid_format","format":"regex","pattern":"/^[A-Za-z0-9._-]+$/","path":["token"],"message":"Invalid string: must match pattern /^[A-Za-z0-9._-]+$/"}]}
```

ID tidak ada → `404`:

```powershell
curl localhost:3000/hooks/test/00000000-0000-4000-8000-000000000000
```

```text
{"error":"request not found"}
```

Token yang belum pernah dipakai → list kosong:

```powershell
curl localhost:3000/hooks/never-used
```

```text
[]
```

Hentikan server dengan `Ctrl+C` di Terminal A.

---

## 13. Referensi dokumentasi (dipakai untuk panduan ini)

| Topik | Sumber |
| --- | --- |
| Driver `node:sqlite` + cara install `@rc` | https://orm.drizzle.team/docs/sqlite/connect-node-sqlite |
| Setup lengkap (schema + `drizzle.config.ts`) | https://orm.drizzle.team/docs/get-started/node-sqlite-new |
| `drizzle-kit push` & auto-pemilihan driver | https://orm.drizzle.team/docs/sqlite/drizzle-kit-push |
| Opsi `drizzle.config.ts` | https://orm.drizzle.team/docs/sqlite/drizzle-config-file |
| `node:sqlite` API & stability | https://nodejs.org/api/sqlite.html |
| Middleware Zod untuk Hono | https://www.npmjs.com/package/@hono/zod-validator |
| Zod v4 | https://zod.dev (catatan: `z.uuid()`, `z.record(k, v)`) |

---

## 14. Troubleshooting

| Gejala | Penyebab / Solusi |
| --- | --- |
| `500 Internal Server Error` saat `curl /in/...` atau `/hooks/...` | Tabel belum dibuat (SQLite: `no such table: webhook_requests`). Jalankan `npm run db:push` **sebelum** `npm run dev` |
| `Error [ERR_MODULE_NOT_FOUND]: Cannot find module ... 'drizzle-orm/node-sqlite'` | `drizzle-orm` terpasang versi stable `0.45.x` (tidak punya driver itu). Install ulang: `npm install drizzle-orm@rc -w apps/api` |
| `drizzle-kit` gagal: `No compatible driver found` / tidak kenal `node:sqlite` | `drizzle-kit` versi stable. Install `npm install -D drizzle-kit@rc -w apps/api` |
| Pesan config `Reading config file … drizzle.config.ts` lalu error `Cannot find module './src/db/path.ts'` | `drizzle-kit` harus dijalankan dari root project lewat `npm run db:push` (cwd = `apps/api`), bukan dari folder lain |
| `error TS2344: Type 'typeof schema' does not satisfy … TablesRelationalConfig` | Opsi `schema` di `drizzle({ client, schema })` di Drizzle 1.0 hanya untuk objek relasi; cukup `drizzle({ client })` |
| Test gagal: `expected 500 to be 200` | DB test belum punya tabel — `beforeAll` tidak menjalankan `drizzle-kit push` (cek `kitBin`/`spawnSync`) atau ada baris `expect(pushed.status, pushed.stderr).toBe(0)` yang gagal (baca `stderr`) |
| `EBUSY` / `EPERM` saat menghapus file DB test di Windows | Koneksi belum ditutup — pastikan `closeDb()` dipanggil sebelum `rmSync` |
| `npm run lint` memunculkan `Fixed N files` berulang | Baris kedua harus `No fixes applied`; kalau tidak, ada file yang ditulis manual dengan format berbeda — jalankan `npm run lint` sekali lagi |
| File `webhook-inspector.db` muncul di `git status` | Editan `.gitignore` (langkah 8e) belum diterapkan |
| `git status` menampilkan `package.json`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/app.ts` termodifikasi **padahal `git diff` kosong** | Bukan perubahan isi — hanya line ending: Biome menulis LF, sedangkan git di mesin ini memakai `core.autocrlf=true` (worktree CRLF). Isinya identik (bisa dicek: `git diff --exit-code` → `0`). Perbaiki dengan `git checkout -- <file>` atau biarkan saja |
| `EADDRINUSE :::3000` | Sisa `node --watch` dari sesi sebelumnya: `netstat -ano \| findstr :3000` lalu `taskkill /PID <pid> /T /F` |

---

## 15. Checklist Verifikasi Akhir Fase 2

- [ ] `npm run lint` → `Checked 33 files … No fixes applied`
- [ ] `npm run typecheck` → tanpa error (termasuk `drizzle.config.ts`)
- [ ] `npm test` → `Test Files 6 passed`, `Tests 27 passed`
- [ ] `npm run db:push` pertama → `[✓] Changes applied`; kedua → `[i] No changes detected`
- [ ] `npm run dev` → `[api] listening on http://localhost:3000`
- [ ] `curl -X POST localhost:3000/in/test -d '{"foo":"bar"}'` → `{"ok":true,"id":"<uuid>"}`
- [ ] `curl localhost:3000/hooks/test` → array berisi request tersebut
- [ ] `curl localhost:3000/hooks/test/<id>` → detail lengkap (headers object, body, `bodyEncoding`)
- [ ] `curl "localhost:3000/in/bad%20token"` → `400` + `issues`
- [ ] Kolom salah di query Drizzle → error TypeScript

Semua terpenuhi = **Fase 2 selesai**, lanjut ke **Fase 3** (SSE Streaming Endpoint + Vitest Setup).
