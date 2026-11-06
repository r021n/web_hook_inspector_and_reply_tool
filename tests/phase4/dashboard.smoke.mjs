import assert from "node:assert/strict";
import process from "node:process";
import { Redis } from "@upstash/redis";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const sessionId = `smoke-ui-${Date.now()}`;
const key = `session:${sessionId}:requests`;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

try {
  const invalid = await fetch(`${baseUrl}/bad`);
  const invalidHtml = await invalid.text();
  assert.equal(invalid.status, 200);
  assert.match(invalidHtml, /Session ID Tidak Valid/);

  const empty = await fetch(`${baseUrl}/${sessionId}`);
  const emptyHtml = await empty.text();
  assert.equal(empty.status, 200);
  assert.match(emptyHtml, /Requests/);
  assert.match(emptyHtml, /Menunggu request webhook masuk/);
  assert.match(emptyHtml, new RegExp(`/api/catch/${sessionId}`));
  assert.match(emptyHtml, /Pilih request di feed/);

  const webhook = await fetch(`${baseUrl}/api/catch/${sessionId}?source=ui-smoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-smoke-header": "phase4",
    },
    body: JSON.stringify({ hello: "dashboard", nested: { ok: true } }),
  });
  assert.equal(webhook.status, 200);

  const populated = await fetch(`${baseUrl}/${sessionId}`);
  const populatedHtml = await populated.text();
  assert.equal(populated.status, 200);
  assert.match(populatedHtml, new RegExp(`/api/catch/${sessionId}`));
  assert.match(populatedHtml, /x-smoke-header/);
  assert.match(populatedHtml, /phase4/);
  assert.match(populatedHtml, /POST/);
  assert.match(populatedHtml, /200 OK/);
  assert.match(populatedHtml, /Headers/);
  assert.match(populatedHtml, /Query/);
  assert.match(populatedHtml, /Body/);

  const stored = await redis.lrange(key, 0, -1);
  assert.equal(stored.length, 1);

  console.log(`Phase 4 dashboard smoke test passed for session ${sessionId}`);
} finally {
  await redis.del(key);
}
