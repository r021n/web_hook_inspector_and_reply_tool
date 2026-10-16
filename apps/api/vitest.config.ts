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
