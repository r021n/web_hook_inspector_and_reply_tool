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
