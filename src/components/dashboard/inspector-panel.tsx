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
}
