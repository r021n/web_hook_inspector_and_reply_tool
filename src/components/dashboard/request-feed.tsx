"use client";

import { Inbox } from "lucide-react";
import type { WebhookRequest } from "@/types/webhook";
import { formatTime, methodColor } from "@/lib/format";

interface RequestFeedProps {
  requests: WebhookRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RequestFeed({
  requests,
  selectedId,
  onSelect,
}: RequestFeedProps) {
  return (
    <aside>
      <div>
        <h2>Requests</h2>
        <span>{requests.length}</span>
      </div>

      <div>
        {requests.length === 0 ? (
          <div>
            <Inbox />
            <p>Menunggu requests webhook masuk...</p>
          </div>
        ) : (
          requests.map((request) => {
            const isSelected = request.id === selectedId;
            return (
              <button
                key={request.id}
                type="button"
                onClick={() => onSelect(request.id)}
              >
                <div>
                  <span>{request.method}</span>
                  <span>200</span>
                  <span>{formatTime(request.timestamp)}</span>
                </div>
                <p>{request.path}</p>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
