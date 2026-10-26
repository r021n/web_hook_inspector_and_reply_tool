import Link from "next/link";
import { ArrowLeft, Radio, Terminal, CheckCircle2 } from "lucide-react";
import { isValidSessionId } from "@/lib/session";

// Route ini memang butuh sessionId dari URL dan harus dirender per-request.
export const instant = false;

interface SessionPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function SessionDashboardPage({
  params,
}: SessionPageProps) {
  const { sessionId } = await params;
  const isValid = isValidSessionId(sessionId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-lg hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Session ID:
            </span>
            <code className="text-xs font-mono bg-slate-800 text-indigo-300 px-2.5 py-1 rounded border border-slate-700">
              {sessionId}
            </code>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Listening (Fase 1 Ready)
          </span>
        </div>
      </header>

      {/* Main Workspace Placeholder */}
      <main className="flex-1 p-6 md:p-8 max-w-5xl mx-auto w-full flex flex-col justify-center items-center text-center">
        {!isValid ? (
          <div className="p-6 rounded-2xl bg-amber-950/40 border border-amber-800 text-amber-200 max-w-md">
            <h2 className="text-lg font-bold mb-2">Session ID Tidak Valid</h2>
            <p className="text-xs text-amber-300/80 mb-4">
              Session ID harus berupa format alfanumerik atau UUID antara 8
              hingga 64 karakter
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium"
            >
              Kembali ke beranda
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 text-left shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  Endpoint Webhook Anda
                </h2>
                <p className="text-xs text-slate-400">
                  Siap menerima payload HTTP di fase 2
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6">
              <p className="text-xs text-slate-400 mb-1 font-mono uppercase tracking-wider">
                Target Ingestion URL:
              </p>
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                <code className="text-xs font-mono text-indigo-300">
                  {`/api/catch/${sessionId}`}
                </code>
              </div>
            </div>
            <div className="border-t border-slate-800 pt-5 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-300">Tahap Berikutnya:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                <li>
                  <strong className="text-slate-300">Fase 2:</strong> Ingestion
                  Route Handler (
                  <code className="text-indigo-300">
                    /api/catch/{sessionId}
                  </code>
                  ) & simpan payload ke Upstash Redis.
                </li>
                <li>
                  <strong className="text-slate-300">Fase 3:</strong> Stream
                  Server-Sent Events (
                  <code className="text-indigo-300">
                    /api/stream/{sessionId}
                  </code>
                  ).
                </li>
                <li>
                  <strong className="text-slate-300">Fase 4:</strong>{" "}
                  Split-screen Dashboard Inspector & realtime activity feed.
                </li>
                <li>
                  <strong className="text-slate-300">Fase 5:</strong> Replay
                  Engine.
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
