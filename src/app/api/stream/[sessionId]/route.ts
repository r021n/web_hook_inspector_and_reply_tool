import { getRedisClient } from "@/lib/redis";
import { eventChannel } from "@/lib/webhook";
import { isValidSessionId } from "@/lib/session";
import { sseEvent, sseHeartbeat } from "@/lib/sse";

const HEARTBEAT_INTERVAL_MS = 15_000;

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { sessionId } = await params;

  if (!isValidSessionId(sessionId)) {
    return Response.json(
      { success: false, error: "Invalid sessionId" },
      { status: 400 },
    );
  }

  let subscriber: ReturnType<ReturnType<typeof getRedisClient>["subscribe"]>;
  try {
    subscriber = getRedisClient().subscribe(eventChannel(sessionId));
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Redis unavailable",
      },
      { status: 503 },
    );
  }

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    subscriber.removeAllListeners();
    void subscriber.unsubscribe();
  };

  const stream = new ReadableStream({
    start(controller) {
      const closeStream = () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      };

      controller.enqueue(sseEvent({ type: "connected", sessionId }, "ready"));

      subscriber.on("message", ({ message }) => {
        if (closed) return;
        try {
          controller.enqueue(sseEvent(message, "webhook"));
        } catch {
          closeStream();
        }
      });

      subscriber.on("error", closeStream);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(sseHeartbeat());
        } catch {
          closeStream();
        }
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", closeStream, {
        once: true,
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
