"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Send, Trophy, X } from "lucide-react";
import { BatchSelector } from "@/components/admin/BatchSelector";
import {
  getTeamLeaderboardPreview,
  sendTeamLeaderboardEmail,
  type TeamLeaderboardPreview,
} from "@/app/actions/team-leaderboard-email";

type Company = { id: string; name: string; slug: string | null };

export default function TeamLeaderboardEmailPanel({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState<string | null>(companies[0]?.id ?? null);
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [preview, setPreview] = useState<TeamLeaderboardPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // A batch picked under one company is meaningless once the company
  // changes — force a fresh pick instead of silently sending to the wrong
  // company's batch.
  useEffect(() => {
    setCohortId(null);
    setPreview(null);
  }, [companyId]);

  useEffect(() => {
    setResult(null);
    setError(null);
    if (!cohortId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTeamLeaderboardPreview(cohortId)
      .then((response) => {
        if (cancelled) return;
        if (response.error) {
          setError(response.error);
          setPreview(null);
          return;
        }
        setPreview(response.preview ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cohortId]);

  const previewSrcDoc = useMemo(() => preview?.html ?? "", [preview]);

  async function handleSend() {
    if (!cohortId || !preview) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await sendTeamLeaderboardEmail(cohortId);
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(
        `Sent to ${response.sent} recipient${response.sent === 1 ? "" : "s"}${response.failed ? ` · ${response.failed} failed` : ""}.`
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border-4 border-black bg-amber-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex w-full items-center justify-between p-4 text-left font-black uppercase tracking-tight">
        <span className="flex items-center gap-2">
          <Trophy size={18} />
          Team commitment leaderboard
        </span>
      </div>

      <div className="border-t-2 border-black">
        <div className="border-b border-amber-200 bg-amber-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Manual send only — never on a schedule
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Pick a batch and module, review the standings and the email exactly as it&apos;ll be sent, then send it to
            every member of that batch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          {companies.length > 0 && (
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
              <Building2 size={15} className="text-slate-500" />
              <select
                value={companyId ?? ""}
                onChange={(event) => setCompanyId(event.target.value || null)}
                className="cursor-pointer bg-transparent text-sm font-semibold text-slate-800 outline-none"
                aria-label="Company"
              >
                <option value="">Select company…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {companyId && <BatchSelector companyId={companyId} value={cohortId} onChange={setCohortId} />}
        </div>

        {result && (
          <div className="mx-4 mb-3 flex items-start justify-between gap-2 rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs font-semibold text-emerald-800">{result}</p>
            <button type="button" onClick={() => setResult(null)} className="flex-shrink-0 text-emerald-600" aria-label="Dismiss result">
              <X size={14} />
            </button>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-3 rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs font-bold text-red-700">{error}</p>
          </div>
        )}

        {!cohortId ? (
          <p className="px-4 pb-4 text-sm italic text-slate-500">Select a company and batch to load its leaderboard.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 px-4 pb-4 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Loading team standings…
          </div>
        ) : preview ? (
          <div className="grid gap-4 px-4 pb-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                Standings · {preview.recipientCount} recipient{preview.recipientCount === 1 ? "" : "s"}
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {preview.teams.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">No teams have a finalised plan yet.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {preview.teams.map((team) => (
                        <tr key={team.teamName} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-bold text-slate-500">#{team.rank}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{team.teamName}</td>
                          <td className="px-3 py-2 text-right font-black text-slate-900">
                            {team.averageScore === null ? "—" : `${Math.round(team.averageScore)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || preview.recipientCount === 0}
                className="mt-3 flex items-center gap-1.5 rounded-lg border-2 border-black bg-black px-3 py-2 text-xs font-bold uppercase text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send to {preview.recipientCount} recipient{preview.recipientCount === 1 ? "" : "s"}
              </button>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">Email preview</p>
              <p className="mb-2 text-xs text-slate-500">Subject: {preview.subject}</p>
              <iframe
                title="Team leaderboard email preview"
                srcDoc={previewSrcDoc}
                sandbox=""
                className="h-[420px] w-full rounded-xl border border-slate-200 bg-white"
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
