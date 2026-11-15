"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Copy, Radio, WifiOff } from "lucide-react";
import type { StreamStatus } from "@/hooks/use-webhook-stream";

interface SessionHeaderProps {
  sessionId: string;
  status: StreamStatus;
}

const STATUS_STYLES: Record<
  StreamStatus,
  { label: string; className: string; icon: typeof Radio }
> = {
  connecting: {
    label: "Connecting",
    className: "text-amber-300 bg-amber-950/60 border-amber-800/80",
    icon: Radio,
  },
  live: {
    label: "Live",
    className: "text-emerald-300 bg-emerald-950/60 border-emerald-800/80",
    icon: Radio,
  },
  offline: {
    label: "Reconnecting",
    className: "text-rose-300 bg-rose-950/60 border-rose-800/80",
    icon: WifiOff,
  },
};

export function SessionHeader({ sessionId, status }: SessionHeaderProps) {
  const [copied, setCopied] = useState(false);
  const endpoint = `/api/catch/${sessionId}`;
  const statusStyle = STATUS_STYLES[status];
  const StatusIcon = statusStyle.icon;

  async function copyEndpoint() {
    await navigator.clipboard.writeText(`${window.location.origin}${endpoint}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <header className="h-16 shrink-0 border-b border-slate-800 px-4 md:px-6 flex items-center justify-between gap-3 bg-slate-900/40 backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-lg hover:bg-slate-800 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Kembali</span>
        </Link>
        <div className="h-4 w-px bg-slate-800 shrink-0" />
        <div className="flex items-center gap-2 min-2">
          <StatusIcon
            className={`w-4 h-4 shrink-0 ${
              status === "live" ? "text-emerald-400 animate-pulse" : ""
            }`}
          />
          <code className="text-xs font-mono bg-slate-800 text-indigo-300 px-2.5 py-1 rounded border border-slate-700 truncate max-w-35 md:max-w-none">
            {sessionId}
          </code>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
          <code className="text-xs font-mono text-slate-300">{endpoint}</code>
          <button
            type="button"
            onClick={copyEndpoint}
            className="flex items-center gap-1 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <span
          className={`flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full ${statusStyle.className}`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {statusStyle.label}
        </span>
      </div>
    </header>
  );
}
