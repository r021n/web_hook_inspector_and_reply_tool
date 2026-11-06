const encoder = new TextEncoder();

export function sseEvent(data: unknown, event?: string): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const lines = event
    ? [`event: ${event}`, `data: ${payload}`]
    : [`data: ${payload}`];
  return encoder.encode(`${lines.join("\n")}\n\n`);
}

export function sseHeartbeat(): Uint8Array {
  return encoder.encode(`: heartbeat ${Date.now()}\n\n`);
}
