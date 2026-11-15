import assert from "node:assert/strict";
import http from "node:http";
import process from "node:process";
import { Redis } from "@upstash/redis";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const sessionId = `smoke-replay-${Date.now()}`;
const requestsKey = `session:${sessionId}:requests`;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const receiver = http.createServer((request, response) => {
  let receivedBody = "";

  request.on("data", (chunk) => {
    receivedBody += chunk;
  });

  request.on("end", () => {
    if (request.url === "/echo") {
      response.writeHead(201, {
        "content-type": "application/json",
        "x-receiver": "phase5",
      });
      response.end(
        JSON.stringify({
          method: request.method,
          body: receivedBody,
          replayHeader: request.headers["x-replay-test"] ?? null,
          host: request.headers.host,
          contentLength: request.headers["content-length"] ?? null,
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
});

async function postReplay(payload) {
  return fetch(`${baseUrl}/api/replay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

try {
  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const receiverPort = receiver.address().port;
  const targetUrl = `http://127.0.0.1:${receiverPort}/echo`;

  const replay = await postReplay({
    targetUrl,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-replay-test": "phase5",
      host: "evil.example",
      "content-length": "999",
    },
    body: JSON.stringify({ hello: "replay" }),
  });
  assert.equal(replay.status, 200);

  const replayData = await replay.json();
  assert.equal(replayData.success, true);
  assert.equal(replayData.status, 201);
  assert.equal(replayData.statusText, "Created");
  assert.ok(Number.isInteger(replayData.durationMs));
  assert.ok(replayData.durationMs >= 0);
  assert.match(replayData.contentType, /application\/json/);
  assert.equal(replayData.truncated, false);

  const echoed = JSON.parse(replayData.body);
  assert.equal(echoed.method, "POST");
  assert.equal(echoed.replayHeader, "phase5");
  assert.equal(echoed.host, `127.0.0.1:${receiverPort}`);
  assert.notEqual(echoed.contentLength, "999");
  assert.deepEqual(JSON.parse(echoed.body), { hello: "replay" });

  const getReplay = await postReplay({
    targetUrl,
    method: "GET",
    headers: { "x-replay-test": "get" },
    body: "ignored for GET",
  });
  const getData = await getReplay.json();
  assert.equal(getData.success, true);
  assert.equal(JSON.parse(getData.body).method, "GET");
  assert.equal(JSON.parse(getData.body).body, "");

  const notFound = await postReplay({
    targetUrl: `http://127.0.0.1:${receiverPort}/missing`,
    method: "GET",
  });
  const notFoundData = await notFound.json();
  assert.equal(notFoundData.success, true);
  assert.equal(notFoundData.status, 404);
  assert.equal(notFoundData.body, "not found");

  const invalidUrl = await postReplay({
    targetUrl: "not-a-url",
    method: "POST",
  });
  assert.equal(invalidUrl.status, 400);
  assert.equal((await invalidUrl.json()).success, false);

  const invalidScheme = await postReplay({
    targetUrl: "ftp://example.com/file",
    method: "POST",
  });
  assert.equal(invalidScheme.status, 400);
  assert.equal((await invalidScheme.json()).success, false);

  const invalidMethod = await postReplay({ targetUrl, method: "TRACE" });
  assert.equal(invalidMethod.status, 400);
  assert.equal((await invalidMethod.json()).success, false);

  const deadServer = http.createServer();
  await new Promise((resolve) => deadServer.listen(0, "127.0.0.1", resolve));
  const deadPort = deadServer.address().port;
  await new Promise((resolve) => deadServer.close(resolve));

  const unreachable = await postReplay({
    targetUrl: `http://127.0.0.1:${deadPort}/echo`,
    method: "POST",
  });
  assert.equal(unreachable.status, 502);
  assert.equal((await unreachable.json()).success, false);

  const catchResponse = await fetch(`${baseUrl}/api/catch/${sessionId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hello: "replay-ui" }),
  });
  assert.equal(catchResponse.status, 200);

  const dashboard = await fetch(`${baseUrl}/${sessionId}`);
  const dashboardHtml = await dashboard.text();
  assert.equal(dashboard.status, 200);
  assert.match(dashboardHtml, /Replay/);

  console.log("Phase 5 replay smoke test passed");
} finally {
  await redis.del(requestsKey);
  receiver.closeAllConnections();
  await new Promise((resolve) => receiver.close(resolve));
}
