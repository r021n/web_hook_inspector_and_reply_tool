import { zValidator } from "@hono/zod-validator";
import * as z from "zod";

export const tokenSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);

export const tokenParamSchema = z.object({ token: tokenSchema });

export const requestParamSchema = z.object({
  token: tokenSchema,
  id: z.uuid(),
});

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

export const requestDetailSchema = requestSummarySchema.extend({
  token: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
  bodyEncoding: z.enum(["text", "base64"]),
});

export type RequestDetail = z.infer<typeof requestDetailSchema>;
