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
