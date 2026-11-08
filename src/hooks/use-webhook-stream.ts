"use client";

import { useState, useEffect } from "react";
import type { WebhookRequest } from "@/types/webhook";

export type StreamStatus = "connecting" | "live" | "offline";

const MAX_FEED_ITEMS = 100;

export function useWebhookStream(
  sessionId: string,
  initialRequests: WebhookRequest[],
) {
  const [requests, setRequests] = useState(initialRequests);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    const source = new EventSource(`/api/stream/${sessionId}`);

    const handleReady = () => setStatus("live");
    const handleWebhook = (event: Event) => {
      try {
        const webhook = JSON.parse(
          (event as MessageEvent).data,
        ) as WebhookRequest;
        setRequests((prev) =>
          [webhook, ...prev.filter((item) => item.id !== webhook.id)].slice(
            0,
            MAX_FEED_ITEMS,
          ),
        );
      } catch {}
    };

    source.addEventListener("ready", handleReady);
    source.addEventListener("webhook", handleWebhook);
    source.onerror = () => setStatus("offline");

    return () => {
      source.removeEventListener("ready", handleReady);
      source.removeEventListener("webhook", handleWebhook);
      source.close();
    };
  }, [sessionId]);

  return { requests, status };
}
