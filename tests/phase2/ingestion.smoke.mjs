import assert from "node:assert/strict";
import process from "node:process";
import { Redis } from "@upstash/redis";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const sessionId = `smoke-${Date.now()}`;
const key = `session:${sessionId}:requests`;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function send(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  return { response, body };
}

const get = await send(`/api/catch/${sessionId}?foo=bar`, {
  headers: { "x-test": "get" },
});
assert.equal(get.response.status, 200);
assert.equal(get.body.success, true);
assert.ok(get.body.id);

const post = await send(`/api/catch/${sessionId}?source=smoke`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-test": "post" },
  body: JSON.stringify({ hello: "world" }),
});
assert.equal(post.response.status, 200);
assert.equal(post.body.success, true);
assert.ok(post.body.id);

const invalid = await send("/api/catch/bad", {});
assert.equal(invalid.response.status, 400);
assert.equal(invalid.body.success, false);

const stored = await redis.lrange(key, 0, -1);
assert.equal(stored.length, 2);

const parsed = stored.map((item) =>
  typeof item === "string" ? JSON.parse(item) : item,
);

assert.equal(parsed[0].method, "POST");
assert.equal(parsed[0].body, JSON.stringify({ hello: "world" }));
assert.equal(parsed[0].queryParams.source, "smoke");
assert.equal(parsed[0].headers["x-test"], "post");
assert.equal(parsed[0].sessionId, sessionId);
assert.ok(parsed[0].id);
assert.ok(parsed[0].timestamp);

assert.equal(parsed[1].method, "GET");
assert.equal(parsed[1].queryParams.foo, "bar");
assert.equal(parsed[1].headers["x-test"], "get");

const ttl = await redis.ttl(key);
assert.ok(ttl > 0 && ttl <= 7200);

await redis.del(key);
console.log(`Phase 2 smoke test passed for session ${sessionId}`);
