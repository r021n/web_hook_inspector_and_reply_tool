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
