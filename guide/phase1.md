# Panduan Fase 1 — Setup Monorepo, Biome & Backend Skeleton

> Panduan ini dibuat berdasarkan pengerjaan nyata fase ini (seluruh langkah sudah dijalankan dan diverifikasi: lint ✅, typecheck ✅, unit test ✅, integration test ✅, `curl /health` ✅).
>
> Untuk setiap langkah berisi: **(1)** file apa yang harus ditulis, **(2)** di mana letaknya, **(3)** perintah CLI apa yang dijalankan, dan **(4)** output apa yang harus muncul.

---

## 0. Cakupan & Hasil Akhir Fase

| Item | Status |
| --- | --- |
| npm workspace (`apps/*`, `packages/*`) di root `package.json` | ✅ |
| `apps/api` — Hono + `@hono/node-server` v2, endpoint `GET /health` | ✅ |
| `apps/web` — Vite + React 19 (skeleton, UI dikerjakan Fase 4) | ✅ |
| `packages/shared` — tipe bersama | ✅ |
| Biome v2 tunggal di root + script `lint`/`format` | ✅ |
| `tsconfig.json` **strict mode** di tiap package | ✅ |
| Unit test + integration test (Vitest) | ✅ |

**Hasil akhir yang harus terpenuhi:**

1. `npm run dev` di root menjalankan API.
2. `curl localhost:3000/health` → `{"ok":true}`.
3. `npm run lint` membersihkan & memformat semua file dalam hitungan milidetik (engine Biome ~60ms; total `npm run lint` ~1–1.5 detik karena overhead proses npm di Windows).
4. `npm run typecheck` dan `npm test` lulus tanpa error.

---

## 1. Prasyarat

```powershell
node -v   # harus v24.x  (diketahui saat panduan dibuat: v24.20.0)
npm -v    # harus 11.x   (diketahui saat panduan dibuat: 11.19.0)
```

**Node 24 wajib** — backend dijalankan langsung oleh Node.js dengan fitur *type stripping* (stabil sejak Node v24.12), jadi tidak perlu tsx/tsc-build untuk menjalankan file `.ts`.

Versi dependency yang dipakai (cek versi terbaru kapan pun dengan `npm view <nama> version`):

| Package | Versi saat panduan dibuat | Keterangan |
| --- | --- | --- |
| `hono` | `4.13.13` | ≥4.12.4 (patch CVE-2026-29085) |
| `@hono/node-server` | `2.1.3` | v2 (throughput 2.3x v1) |
| `@biomejs/biome` | `2.5.15` | linter + formatter |
| `typescript` | `7.0.2` | native compiler, seragam semua workspace |
| `vitest` | `5.0.3` | unit + integration test |
| `vite` | `8.3.2` | dari template create-vite |
| `react` / `react-dom` | `19.3.0` | dari template create-vite |

---

## 2. Struktur Folder Hasil Akhir

```
web_hook_inspector_and_reply_tool/
├── .gitignore                  ← buat di langkah 1
├── biome.json                  ← buat di langkah 6
├── package.json                ← buat di langkah 1 (root workspace)
├── package-lock.json           ← auto, hasil npm install
├── project.md
├── guide/
│   └── phase1.md
├── apps/
│   ├── api/                    ← backend Hono (dibuat langkah 3)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app.ts                      ← Hono app + route GET /health
│   │       ├── config.ts                   ← resolvePort()
│   │       ├── index.ts                    ← entry: serve() di port 3000
│   │       ├── app.test.ts                 ← unit test route
│   │       ├── config.test.ts              ← unit test config
│   │       └── health.integration.test.ts  ← integration test (HTTP asli)
│   └── web/                    ← SPA React (dibuat langkah 2, UI di Fase 4)
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│       ├── public/favicon.svg
│       └── src/ (App.tsx, main.tsx, App.css, index.css)
└── packages/
    └── shared/                 ← tipe bersama (dibuat langkah 4)
        ├── package.json
        ├── tsconfig.json
        └── src/index.ts
```

> Selalu jalankan perintah npm **dari root folder project** (`D:\coding\web\web_hook_inspector_and_reply_tool`), kecuali disebutkan lain.

---

## 3. Langkah 1 — Root `package.json` (monorepo) + `.gitignore`

**Tulis file:** `package.json` (di root)

```json
{
  "name": "webhook-inspector",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace apps/api",
    "dev:web": "npm run dev --workspace apps/web",
    "lint": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.15"
  }
}
```

Penjelasan:

- `"workspaces": ["apps/*", "packages/*"]` — semua folder ber-`package.json` di dalam `apps/` dan `packages/` otomatis jadi workspace (di-*symlink* ke root `node_modules` saat `npm install`).
- `"dev"` → menjalankan **API** (sesuai spesifikasi project.md).
- `"typecheck"` / `"test"` → dijalankan ke semua workspace, dilewati kalau script tidak ada (`--if-present`).

**Tulis file:** `.gitignore` (di root)

```gitignore
node_modules/
dist/
coverage/
.vite/
*.log
*.tsbuildinfo
```

---

## 4. Langkah 2 — Scaffold `apps/web` (Vite + React)

**Jalankan perintah:**

```powershell
npm create vite@latest apps/web -- --template react-ts
```

**Output yang muncul:**

```text
> webhook-inspector@0.1.0 npx
> create-vite apps/web --template react-ts

│
◇  Scaffolding project in D:\coding\web\web_hook_inspector_and_reply_tool\apps\web...
│
└  Done. Now run:

  cd apps\web
  npm install
  npm run dev
```

> **Jangan jalankan `npm install` di dalam `apps/web`** — install dilakukan sekali di root (langkah 5).

### 4a. Edit `apps/web/package.json`

Template terbaru ikut memasang **oxlint**. Project ini memakai **Biome**, jadi oxlint dihapus (jangan pasang dua linter).

**Tulis ulang isi file** `apps/web/package.json`:

```json
{
  "name": "@whi/web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "typescript": "^7.0.2",
    "vite": "^8.3.0"
  }
}
```

Perubahan dari template: `name` → `@whi/web`, hapus `oxlint` + script `"lint"`, tambah script `"typecheck"`, `typescript` → `^7.0.2` (diseragamkan dengan workspace lain).

**Hapus file** `.oxlintrc.json`:

```powershell
del apps\web\.oxlintrc.json
```

### 4b. Tambahkan `strict` ke tsconfig web

Template Vite **belum** mengaktifkan `strict`. Tambahkan satu baris di **dua file**:

- `apps/web/tsconfig.app.json` — tambahkan di `compilerOptions`:

```json
"strict": true,
```

- `apps/web/tsconfig.node.json` — tambahkan di `compilerOptions`:

```json
"strict": true,
```

### 4c. Ganti `apps/web/src/main.tsx`

Template memakai non-null assertion (`!`) yang dilarang Biome (`style/noNonNullAssertion`).

**Tulis file:** `apps/web/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### 4d. Ganti `apps/web/src/App.tsx` (placeholder)

Demo bawaan Vite memicu error a11y Biome (`a11y/noAmbiguousAnchorText`). Ganti total dengan placeholder project:

**Tulis file:** `apps/web/src/App.tsx`

```tsx
import "./App.css";

function App() {
  return (
    <main className="app-shell">
      <h1>Webhook Inspector</h1>
      <p>Dashboard UI dibangun pada Fase 4.</p>
    </main>
  );
}

export default App;
```

### 4e. Bersihkan aset template yang tidak terpakai

```powershell
del apps\web\public\icons.svg
del apps\web\src\assets\hero.png
del apps\web\src\assets\react.svg
del apps\web\src\assets\vite.svg
rmdir apps\web\src\assets
```

> `icons.svg` wajib dihapus atau lint gagal (`a11y/noSvgWithoutTitle`).

### 4f. Edit `apps/web/public/favicon.svg`

Tambahkan `<title>` tepat setelah tag pembuka `<svg ...>` (di dalam file, satu baris):

```text
... viewBox="0 0 48 46"><title>Webhook Inspector</title><path ...
```

> Tanpa ini, lint gagal dengan `a11y/noSvgWithoutTitle`.

### 4g. Edit `apps/web/index.html`

Ganti judul halaman:

```html
<title>Webhook Inspector</title>
```

---

## 5. Langkah 3 — Buat `apps/api` (Hono + Node.js)

### 5a. `apps/api/package.json`

**Tulis file:** `apps/api/package.json`

```json
{
  "name": "@whi/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.ts",
    "start": "node src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^2.1.3",
    "@whi/shared": "*",
    "hono": "^4.13.13"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "typescript": "^7.0.2",
    "vitest": "^5.0.3"
  }
}
```

Catatan:

- `"dev": "node --watch src/index.ts"` — Node 24 menjalankan `.ts` langsung (type stripping) + auto-restart saat file berubah. Tidak perlu tsx/esbuild.
- `"@whi/shared": "*"` — dependency antar-workspace; npm akan men-*symlink* package lokal (bukan mengunduh dari registry).
- `type: "module"` → file `.ts` diperlakukan sebagai ESM.

### 5b. `apps/api/tsconfig.json`

**Tulis file:** `apps/api/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedSideEffectImports": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Penjelasan opsi kunci (rekomendasi resmi Node.js untuk TS):

| Opsi | Alasan |
| --- | --- |
| `strict: true` | spesifikasi project |
| `allowImportingTsExtensions` | mengizinkan import bergaya `./app.ts` yang wajib untuk Node type stripping |
| `verbatimModuleSyntax` | memaksa type-only import memakai `import type` (kalau tidak, Node mencari value-nya saat runtime → error) |
| `erasableSyntaxOnly` | mencegah `enum`/`namespace` runtime/parameter properties yang tidak didukung type stripping |
| `noEmit: true` | TS hanya dipakai untuk typecheck; eksekusi oleh Node langsung |

### 5c. Source code API (4 file)

**Tulis file:** `apps/api/src/app.ts`

```ts
import type { HealthResponse } from "@whi/shared";
import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true } satisfies HealthResponse));
```

**Tulis file:** `apps/api/src/config.ts`

```ts
import { API_DEFAULT_PORT } from "@whi/shared";

export function resolvePort(env: Record<string, string | undefined>): number {
  const raw = env.PORT;
  if (raw === undefined || raw === "") {
    return API_DEFAULT_PORT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    return API_DEFAULT_PORT;
  }
  return parsed;
}

export const PORT = resolvePort(process.env);
```

**Tulis file:** `apps/api/src/index.ts`

```ts
import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { PORT } from "./config.ts";

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
```

> Perhatikan: import relatif **wajib** berekstensi `.ts` (bukan `./app`) — ini ketentuan Node type stripping, bukan selera.

### 5d. Test (3 file)

**Tulis file:** `apps/api/src/app.test.ts` *(unit test route)*

```ts
import { describe, expect, test } from "vitest";
import { app } from "./app.ts";

describe("GET /health", () => {
  test("responds with { ok: true }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("unknown route responds 404", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
```

**Tulis file:** `apps/api/src/config.test.ts` *(unit test config)*

```ts
import { API_DEFAULT_PORT } from "@whi/shared";
import { describe, expect, test } from "vitest";
import { resolvePort } from "./config.ts";

describe("resolvePort", () => {
  test("defaults when PORT is missing or empty", () => {
    expect(resolvePort({})).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "" })).toBe(API_DEFAULT_PORT);
  });

  test("uses PORT when it is a valid port number", () => {
    expect(resolvePort({ PORT: "4000" })).toBe(4000);
  });

  test("falls back when PORT is invalid", () => {
    expect(resolvePort({ PORT: "abc" })).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "0" })).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "-1" })).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "70000" })).toBe(API_DEFAULT_PORT);
  });
});
```

**Tulis file:** `apps/api/src/health.integration.test.ts` *(integration test — server HTTP sungguhan)*

```ts
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { afterEach, describe, expect, test } from "vitest";
import { app } from "./app.ts";

let server: ServerType | undefined;

afterEach(async () => {
  const current = server;
  if (!current) return;
  server = undefined;
  await new Promise<void>((resolve) => {
    current.close(() => resolve());
  });
});

describe("health integration over real HTTP", () => {
  test("GET /health returns 200 with { ok: true }", async () => {
    const { port } = await new Promise<{ port: number }>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => {
        resolve({ port: info.port });
      });
    });

    const res = await fetch(`http://127.0.0.1:${port}/health`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

Catatan integration test:

- `port: 0` = port acak (aman dari konflik); port asli diambil dari callback `serve()`.
- Test membuka socket HTTP sungguhan via `fetch()` → memverifikasi stack `@hono/node-server` end-to-end, bukan hanya handler.
- Jangan panggil `server.closeAllConnections()` — tipe `ServerType` adalah union HTTP/HTTP/2 dan method itu tidak ada di sisi HTTP/2. `close()` di Node ≥19 sudah menutup koneksi idle.

---

## 6. Langkah 4 — Buat `packages/shared`

**Tulis file:** `packages/shared/package.json`

```json
{
  "name": "@whi/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^7.0.2"
  }
}
```

**Tulis file:** `packages/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Tulis file:** `packages/shared/src/index.ts`

```ts
export interface HealthResponse {
  ok: boolean;
}

export const API_DEFAULT_PORT = 3000;
```

Catatan: `exports` menunjuk langsung ke `./src/index.ts` (tanpa build step). Terbukti aman untuk ketiga konsumen: `tsc` (typecheck), Vite (web), dan Node 24 (workspace symlink di-resolve ke realpath `packages/shared/...`, jadi type stripping tetap diizinkan — bukan jalur `node_modules`).

---

## 7. Langkah 5 — Install dependencies (sekali, di root)

**Jalankan perintah** (dari root):

```powershell
npm install
```

**Output yang muncul (angka bisa sedikit berbeda tergantung waktu):**

```text
added 53 packages, and audited 57 packages in 1m

13 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

**Verifikasi workspace sudah ter-link:**

```powershell
npm ls --depth 0
```

**Output yang diharapkan** (penting: `-> .\apps\api` berarti symlink lokal, bukan dari registry):

```text
webhook-inspector@0.1.0 D:\coding\web\web_hook_inspector_and_reply_tool
├── @biomejs/biome@2.5.15
├─┬ @whi/api@0.0.0 -> .\apps\api
│ ├── @hono/node-server@2.1.3
│ ├── @types/node@24.19.1
│ ├── @whi/shared@0.0.0 deduped -> .\packages\shared
│ ├── hono@4.13.13
│ ├── typescript@7.0.2
│ └── vitest@5.0.3
├─┬ @whi/shared@0.0.0 -> .\packages\shared
│ └── typescript@7.0.2 deduped
└─┬ @whi/web@0.0.0 -> .\apps\web
    ...
```

---

## 8. Langkah 6 — Setup Biome (root)

**Jalankan perintah** (dari root):

```powershell
npx @biomejs/biome init
```

**Output yang muncul:**

```text
init ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  i Welcome to Biome! Let's get you started...

    Files created

      - biome.json
        Your project configuration. See https://biomejs.dev/reference/configuration
```

`biome.json` otomatis terbuat. **Tulis ulang isi `biome.json`** (di root) — tambahkan indent 2 spasi dan eksklusikan file besar yang tidak perlu di-lint:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": {
    "enabled": false,
    "clientKind": "git",
    "useIgnoreFile": false
  },
  "files": {
    "ignoreUnknown": false,
    "includes": ["**", "!**/node_modules", "!**/dist", "!**/.git", "!**/package-lock.json"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended"
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

> Default `biome init` memakai **tab**; config di atas mengubahnya ke **spasi** agar konsisten. Dengan config ini, semua kode TS/JSON/CSS otomatis diformat: 2 spasi, double quote, semicolon.

**Jalankan lint** (script `lint` sudah ada di root package.json):

```powershell
npm run lint
```

**Output yang diharapkan (setelah semua langkah di atas dikerjakan urut):**

```text
> webhook-inspector@0.1.0 lint
> biome check --write .

Checked 24 files in 59ms. No fixes applied.
```

Catatan:

- Baris pertama kali mungkin memunculkan `Fixed N files` — itu auto-format file template Vite yang belum terformat. **Jalankan lagi**, kedua kali harus `No fixes applied`.
- Jika muncul error `a11y/...` atau `style/noNonNullAssertion` → editan langkah 4 (4a–4f) belum diterapkan.
- Waktu check Biome sendiri ~60ms. Total wall-time `npm run lint` ~1–1,5 detik karena overhead spawn `npm` di Windows; jalankan `npx @biomejs/biome check .` bila ingin melihat waktu murni Biome.

---

## 9. Langkah 7 — Typecheck (strict, semua workspace)

```powershell
npm run typecheck
```

**Output yang diharapkan** (tanpa baris error):

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

---

## 10. Langkah 8 — Test (unit + integration)

```powershell
npm test
```

**Output yang diharapkan:**

```text
> webhook-inspector@0.1.0 test
> npm run test --workspaces --if-present

> @whi/api@0.0.0 test
> vitest run

 RUN  v5.0.3 D:/coding/web/web_hook_inspector_and_reply_tool/apps/api

 Test Files  3 passed (3)
      Tests  6 passed (6)
   Duration  3.55s
```

Cakupan test:

| File | Jenis | Yang diverifikasi |
| --- | --- | --- |
| `app.test.ts` | unit | route `/health` → 200 `{ok:true}`, route aneh → 404 |
| `config.test.ts` | unit | `resolvePort()`: default, valid, invalid |
| `health.integration.test.ts` | integration | server HTTP asli di port acak → `fetch` → assert status/header/body |

---

## 11. Langkah 9 — Jalankan API + curl (verifikasi akhir)

**Terminal A** (dari root):

```powershell
npm run dev
```

**Output yang muncul:**

```text
> webhook-inspector@0.1.0 dev
> npm run dev --workspace apps/api

> @whi/api@0.1.0 dev
> node --watch src/index.ts

[api] listening on http://localhost:3000
```

**Terminal B:**

```powershell
curl http://localhost:3000/health
```

**Output yang muncul:**

```text
{"ok":true}
```

Hentikan server dengan `Ctrl+C` di Terminal A. (Bonus: `set PORT=4000` sebelum `npm run dev` menjalankan API di port 4000 — perilaku ini yang diuji di `config.test.ts`.)

---

## 12. Troubleshooting

| Gejala | Penyebab / Solusi |
| --- | --- |
| `Error: listen EADDRINUSE :::3000` | Port 3000 terpakai. Cari PID: `netstat -ano \| findstr :3000` lalu `taskkill /PID <pid> /T /F`, atau jalankan dengan `set PORT=4000` |
| `Cannot find module './app'` | Import relatif wajib `.ts`: `import { app } from "./app.ts"` |
| `RuntimeError: ... is not a function` saat `node src/index.ts` | Type-only import tidak memakai `import type` → Node mencari value yang tidak ada |
| `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | Ada `enum`/`namespace` runtime/parameter properties → harus di-refactor (dilarang type stripping; tsconfig `erasableSyntaxOnly` mencegah ini muncul saat typecheck) |
| Error lint `style/noNonNullAssertion` / `a11y/*` | Editan langkah 4 belum diterapkan |
| `npm run dev` tidak menemukan script | Harus dijalankan dari root project, bukan dari subfolder |
| Module `@whi/shared` tidak ditemukan | `npm install` belum dijalankan di root (symlink belum dibuat) |

---

## 13. Checklist Verifikasi Akhir Fase 1

- [ ] `npm run lint` → `No fixes applied` (dan cepat)
- [ ] `npm run typecheck` → sukses untuk `@whi/api`, `@whi/web`, `@whi/shared`
- [ ] `npm test` → `Test Files 3 passed`, `Tests 6 passed`
- [ ] `npm run dev` → log `[api] listening on http://localhost:3000`
- [ ] `curl http://localhost:3000/health` → `{"ok":true}`

Semua terpenuhi = **Fase 1 selesai**, lanjut ke **Fase 2** (Webhook Ingest + Drizzle ORM + SQLite).
