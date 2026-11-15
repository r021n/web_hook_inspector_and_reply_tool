import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { isValidSessionId } from "@/lib/session";
import { connection } from "next/server";
import { getWebhookRequests } from "@/lib/webhook";
import { Dashboard } from "@/components/dashboard/dashboard";

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

  await connection();

  if (!isValidSessionId(sessionId)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="p-6 rounded-2xl bg-amber-950/40 border border-amber-800 text-amber-200 max-w-md">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5" />
            <h2 className="text-lg font-bold">Session ID Tidak Valid</h2>
          </div>
          <p className="text-xs text-amber-300/80 mb-4">
            Session ID harus berupa format alfanumerik atau UUID antara 8 hingga
            64 karakter.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke beranda
          </Link>
        </div>
      </div>
    );
  }

  const initialRequests = await getWebhookRequests(sessionId);

  return <Dashboard sessionId={sessionId} initialRequests={initialRequests} />;
}
