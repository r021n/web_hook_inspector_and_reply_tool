import { API_DEFAULT_PORT } from "@whi/shared";
import { describe, expect, test } from "vitest";
import { resolvePort } from "./config.ts";

describe("resolvePort", () => {
  test("defaults when PORT is missing or empty", () => {
    expect(resolvePort({})).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "" })).toBe(API_DEFAULT_PORT);
  });

  test("useS PORT when it is a valid port number", () => {
    expect(resolvePort({ PORT: "4000" })).toBe(4000);
  });

  test("falls back when PORT is invalid", () => {
    expect(resolvePort({ PORT: "abc" })).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "0" })).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "-1" })).toBe(API_DEFAULT_PORT);
    expect(resolvePort({ PORT: "70000" })).toBe(API_DEFAULT_PORT);
  });
});
