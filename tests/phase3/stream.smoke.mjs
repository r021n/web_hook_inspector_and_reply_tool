import assert from "node:assert/strict";
import process from "node:process";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const sessionId = `smoke-${Date.now()}`;
const streamUrl = `${baseUrl}/api/stream/${sessionId}`;

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 20_000);

function readChunks(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];

  async function nextEvent() {
    while (true) {
      const newlineIndex = buffer.indexOf("\n\n");
      if (newlineIndex !== -1) {
        const raw = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 2);
        const event = raw
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice("data: ".length);
        if (event) return JSON.parse(event);
      }
      const { done, value } = await reader.read();
      if (done) throw new Error("Stream ended unexpectedly");
      buffer += decoder.decode(value, { stream: true });
    }
  }

  return { nextEvent, events };
}

try {
  const response = await fetch(streamUrl, {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "text/event-stream; charset=utf-8",
  );

  const reader = response.body.getReader();
  const { nextEvent } = readChunks(reader);

  const ready = await nextEvent();
  assert.equal(ready.type, "connected");
  assert.equal(ready.sessionId, sessionId);

  const webhookResponse = await fetch(
    `${baseUrl}/api/catch/${sessionId}?source=sse-smoke`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "stream" }),
    },
  );
  assert.equal(webhookResponse.status, 200);

  const event = await nextEvent();
  assert.equal(event.sessionId, sessionId);
  assert.equal(event.method, "POST");
  assert.equal(event.queryParams.source, "sse-smoke");
  assert.equal(event.body, JSON.stringify({ hello: "stream" }));

  await reader.cancel();
  console.log(`Phase 3 SSE smoke test passed for session ${sessionId}`);
} finally {
  clearTimeout(timeout);
  controller.abort();
}
