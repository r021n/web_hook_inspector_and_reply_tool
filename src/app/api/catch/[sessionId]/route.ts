import { NextResponse } from "next/server";
import { isValidSessionId } from "@/lib/session";
import { buildWebhookRequest, saveWebhookRequest } from "@/lib/webhook";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

async function handleWebhook(request: Request, { params }: RouteContext) {
  const { sessionId } = await params;

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { success: false, error: "Invalid sessionId" },
      { status: 400 },
    );
  }

  try {
    const webhook = await buildWebhookRequest(request, sessionId);
    await saveWebhookRequest(webhook);

    return NextResponse.json(
      { success: true, id: webhook.id },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process webhook",
      },
      { status: 500 },
    );
  }
}

export const GET = handleWebhook;
export const POST = handleWebhook;
export const PUT = handleWebhook;
export const PATCH = handleWebhook;
export const DELETE = handleWebhook;
export const HEAD = handleWebhook;
export const OPTIONS = handleWebhook;