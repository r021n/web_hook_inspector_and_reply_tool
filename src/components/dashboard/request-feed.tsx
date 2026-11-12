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
    <aside className="border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/30 flex flex-col min-h-0 md:h-[calc(100vh-4rem)]">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Requests
        </h2>
        <span className="text-xs font-mono text-slate-500">
          {requests.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {requests.length === 0 ? (
          <div className="h-full min-h-48 flex flex-col items-center justify-center text-center p-6">
            <Inbox className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-xs text-slate-400">
              Menunggu requests webhook masuk...
            </p>
          </div>
        ) : (
          requests.map((request) => {
            const isSelected = request.id === selectedId;
            return (
              <button
                key={request.id}
                type="button"
                onClick={() => onSelect(request.id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-800/70 transition cursor-pointer ${
                  isSelected
                    ? "bg-indigo-500/10 border-l-2 border-l-indigo-400"
                    : "hover:bg-slate-800/50 border-l-2 border-l-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${methodColor(request.method)}`}
                  >
                    {request.method}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 border border-emerald-800/70 bg-emerald-950/50 px-1.5 py-0.5 rounded">
                    200
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-slate-500">
                    {formatTime(request.timestamp)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-mono text-slate-300 truncate">
                  {request.path}
                </p>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
