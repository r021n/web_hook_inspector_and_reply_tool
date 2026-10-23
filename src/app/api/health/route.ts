import { NextResponse } from "next/server";
import { getRedisClient, isRedisConfigured } from "@/lib/redis";

export async function GET() {
  if (!isRedisConfigured) {
    return NextResponse.json(
      {
        status: "unconfigured",
        message: "Upstash Redis environment variables are missing.",
        timestamp: Date.now(),
      },
      { status: 503 },
    );
  }

  try {
    const client = getRedisClient();
    const testKey = `health:${Date.now()}`;
    await client.set(testKey, "ok", { ex: 10 });
    const result = await client.get<string>(testKey);

    return NextResponse.json({
      status: "healthy",
      redis: result === "ok" ? "connected" : "unexpected_response",
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown Redis error",
        timestamp: Date.now(),
      },
      { status: 500 },
    );
  }
}
