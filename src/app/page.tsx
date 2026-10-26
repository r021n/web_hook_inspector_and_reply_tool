import { redirect } from "next/navigation";
import { generateSessionId } from "@/lib/session";
import { isRedisConfigured } from "@/lib/redis";
import {
  Radio,
  ArrowRight,
  Zap,
  Shield,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function HomePage() {
  async function createSessionAction() {
    "use server";
    const newSessionId = generateSessionId();
    redirect(`/${newSessionId}`);
  }

  async function openManualSessionAction(formData: FormData) {
    "use server";
    const session = formData.get("sessionId")?.toString().trim();
    if (session) {
      redirect(`/${encodeURIComponent(session)}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 md:p-12 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="flex items-center justify-between max-w-5xl w-full mx-auto pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              Webhook Relay & Inspector
            </h1>
            <p className="text-xs text-slate-400">
              Real-time HTTP devtool powered by Next.js & Upstash
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {isRedisConfigured ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800 rounded-full font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Redis Configured
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/60 text-amber-400 border border-amber-800 rounded-full font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Redis Unconfigured (.env.local)
            </span>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-3xl w-full mx-auto my-auto py-12 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/70 text-indigo-300 border border-indigo-700/50 text-xs font-medium mb-6">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          Fase 1: Setup & Upstash Integration Ready
        </div>

        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
          Tangkap, Inspeksi, dan Replay Webhook Secara Real-Time
        </h2>

        <p className="text-slate-400 text-base md:text-lg max-w-xl mb-8 leading-relaxed">
          Alternatif ringan untuk Webhook.site & RequestBin. Dilengkapi endpoint
          Edge runtime, stream Server-Sent Events, dan integrasi Upstash Redis.
        </p>

        {/* Action Button */}
        <form action={createSessionAction} className="w-full max-w-md">
          <button
            type="submit"
            className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition duration-150 cursor-pointer text-base"
          >
            <span>Mulai Buat Sesi Webhook Baru</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        {/* Manual Sesi Input */}
        <div className="mt-8 pt-8 border-t border-slate-800/80 w-full max-w-md text-left">
          <label
            htmlFor="manual-session"
            className="block text-xs font-medium text-slate-400 mb-2"
          >
            Atau buka sesi yang sudah ada:
          </label>
          <form action={openManualSessionAction} className="flex gap-2">
            <input
              id="manual-session"
              name="sessionId"
              type="text"
              placeholder="Masukkan Session ID..."
              required
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition"
            >
              Buka
            </button>
          </form>
        </div>

        {/* Features preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 w-full text-left">
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <Shield className="w-5 h-5 text-indigo-400 mb-2" />
            <h3 className="text-sm font-semibold text-slate-200">
              Modern Architecture
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Next.js App Router dengan kecepatan komputasi tinggi.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <Radio className="w-5 h-5 text-indigo-400 mb-2" />
            <h3 className="text-sm font-semibold text-slate-200">
              Server-Sent Events
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Streaming real-time instan ke browser tanpa socket berat.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <Zap className="w-5 h-5 text-indigo-400 mb-2" />
            <h3 className="text-sm font-semibold text-slate-200">
              Upstash Redis REST
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Penyimpanan serverless & pub-sub berkecepatan tinggi.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
        <p>
          Webhook Relay & Inspector DevTool &bull; Fase 1: Setup & Upstash
          Integration
        </p>
      </footer>
    </div>
  );
}
