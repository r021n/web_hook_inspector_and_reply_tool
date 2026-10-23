import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRedisConfigured: boolean = Boolean(url && token);

export const redis: Redis | null = isRedisConfigured
  ? new Redis({
      url: url!,
      token: token!,
    })
  : null;

export function getRedisClient(): Redis {
  if (!redis) {
    throw new Error(
      "Upstash Redis is not configured. Please set UPSTASH_REDIS_REST_API and UPSTASH_REST_TOKEN in your environment.",
    );
  }

  return redis;
}
