import type { WebhookRequest } from "@/types/webhook";
import { getRedisClient } from "@/lib/redis";

const REQUEST_TTL_SECONDS = 2 * 60 * 60;
const MAX_REQUESTS_PER_SESSION = 100;

export function requestsKey(sessionId: string): string {
  return `session:${sessionId}:requests`;
}

export function eventChannel(sessionId: string): string {
  return `session:${sessionId}`;
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "unknown"
  );
}

export async function buildWebhookRequest(
  request: Request,
  sessionId: string,
): Promise<WebhookRequest> {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const rawBody = hasBody ? await request.text() : "";

  return {
    id: crypto.randomUUID(),
    sessionId,
    method: request.method,
    url: request.url,
    path: url.pathname,
    headers,
    queryParams: Object.fromEntries(url.searchParams.entries()),
    body: rawBody.length > 0 ? rawBody : null,
    contentType: headers["content-type"] ?? null,
    clientIp: getClientIp(request.headers),
    timestamp: Date.now(),
  };
}

export async function saveWebhookRequest(
  webhook: WebhookRequest,
): Promise<void> {
  const redis = getRedisClient();
  const payload = JSON.stringify(webhook);
  const key = requestsKey(webhook.sessionId);

  await redis
    .pipeline()
    .lpush(key, payload)
    .ltrim(key, 0, MAX_REQUESTS_PER_SESSION - 1)
    .expire(key, REQUEST_TTL_SECONDS)
    .publish(eventChannel(webhook.sessionId), payload)
    .exec();
}
