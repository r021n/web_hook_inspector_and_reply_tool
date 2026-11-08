const METHOD_COLORS: Record<string, string> = {
  GET: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  POST: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PUT: "bg-amber-300/15 text-amber-300 border-amber-500/30",
  PATCH: "bg-violet-300/15 text-violet-300 border-violet-500/30",
  DELETE: "bg-rose-300/15 text-rose-300 border-rose-500/30",
};

export function methodColor(method: string): string {
  return (
    METHOD_COLORS[method.toUpperCase()] ??
    "bg-slate-300/15 text-slate-300 border-slate-500/30"
  );
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(11, 19);
}

export function formatBody(body: string | null): string {
  if (!body) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
