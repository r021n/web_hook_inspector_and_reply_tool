"use client";

import { useState } from "react";
import type { WebhookRequest } from "@/types/webhook";
import { useWebhookStream } from "@/hooks/use-webhook-stream";
import { SessionHeader } from "./session-header";
import { RequestFeed } from "./request-feed";
import { InspectorPanel } from "./inspector-panel";

interface DashboardProps {
  sessionId: string;
  initialRequests: WebhookRequest[];
}

export function Dashboard({ sessionId, initialRequests }: DashboardProps) {
  const { requests, status } = useWebhookStream(sessionId, initialRequests);
  const [selectedId, setSelectedId] = useState(initialRequests[0]?.id ?? null);
  const selected =
    requests.find((request) => request.id === selectedId) ??
    requests[0] ??
    null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SessionHeader sessionId={sessionId} status={status} />
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[340px_1fr] min-h-0">
        <RequestFeed
          requests={requests}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        <InspectorPanel request={selected} />
      </main>
    </div>
  );
}
