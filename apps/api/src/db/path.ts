import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const API_ROOT = fileURLToPath(new URL("../..", import.meta.url));

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
