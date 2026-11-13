"use client";

import { useState } from "react";
import { Check, Copy, MousePointerClick } from "lucide-react";
import type { WebhookRequest } from "@/types/webhook";
import { formatBody, formatTime, methodColor } from "@/lib/format";

const TABS = ["headers", "query", "body"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  headers: "Headers",
  query: "Query",
  body: "Body",
};

interface InspectorPanelProps {
  request: WebhookRequest | null;
}

export function InspectorPanel({ request }: InspectorPanelProps) {
  const [tab, setTab] = useState<Tab>("headers");
  const [copied, setCopied] = useState(false);

  if (!request) {
    return (
      <section className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <MousePointerClick className="w-8 h-8 text-slate-600 mb-3" />
        <p className="text-sm text-slate-400">
          Pilih request di feed untuk melihat detailnya.
        </p>
      </section>
    );
  }

  const body = formatBody(request.body);

  async function copyBody() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="flex-1 flex flex-col min-h-0 md:h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-slate-800 bg-slate-900/20 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${methodColor(request.method)}`}>{request.method}</span>
          <span className="text-[10px] font-mono text-emerald-400 border border-emerald-800/70 bg-emerald-950/50 px-1.5 py-0.5 rounded">200 OK</span>
        </div>
        <p className="text-sm font-mono text-slate-200 break-all">{request.url}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
          <span>IP: {request.clientIp}</span>
          <span>Waktu: {formatTime(request.timestamp)}</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-800 px-4 pt-3 shrink-0">
        {TABS.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition cursor-pointer ${
              tab === item
                ? "text-indigo-300 border-indigo-400 bg-indigo-500/10"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}>
            {TAB_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === "headers" && (
          <KeyValueTable data={request.headers} empty="Tidak ada header." />
        )}

        {tab === "query" && (
          <KeyValueTable
            data={request.queryParams}
            empty="Tidak ada query parameter"
          />
        )}

        {tab === "body" &&
          (body ? (
            <div>
              <div className="flex justify-end mb-2">
                <button type="button" onClick={copyBody} className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400"/> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <pre className="text-xs font-mono text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap wrap-break-word">
                {body}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Request ini tidak memiliki body</p>
          ))}
      </div>
    </section>
  );
}

function KeyValueTable({
  data,
  empty,
}: {
  data: Record<string, string>;
  empty: string;
}) {
  const rows = Object.entries(data);

  if (rows.length === 0) {
    return <p>{empty}</p>;
  }

  return (
    <table>
      <tbody>
        {rows.map(([key, value]) => (
          <tr>
            <td>{key}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
