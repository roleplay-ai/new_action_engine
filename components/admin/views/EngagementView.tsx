"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import { useAdminContext } from "@/components/admin/AdminContext";
import {
  getEngagementLeaderboard,
  type EngagementLeaderboardEntry,
} from "@/app/actions/admin-analytics";

interface UserEngagementRow {
  id: string;
  name: string;
  buddyName: string | null;
  commitmentPoints: number;
  commitmentMaximum: number;
  commitmentPct: number;
  plannedActions: number;
  validatedCount: number;
}

interface EngagementViewProps {
  companyId: string | null;
}

export function EngagementView({ companyId }: EngagementViewProps) {
  const { selectedCohortId } = useAdminContext();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<UserEngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!companyId) {
      setRows([]);
      setError("Select a company");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getEngagementLeaderboard(companyId, selectedCohortId)
      .then(({ entries, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error);
          setRows([]);
          return;
        }
        const mapped: UserEngagementRow[] = (entries ?? []).map(
          (e: EngagementLeaderboardEntry) => ({
            id: e.id,
            name: e.name,
            buddyName: e.buddyName,
            commitmentPoints: e.commitmentPoints,
            commitmentMaximum: e.commitmentMaximum,
            commitmentPct: e.commitmentPct,
            plannedActions: e.plannedActions,
            validatedCount: e.validatedCount,
          })
        );
        setRows(mapped);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, selectedCohortId]);

  const filteredUsers = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.commitmentPoints - a.commitmentPoints);
    return sorted.filter((u) =>
      u.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [rows, search]);

  const commitmentBadgeColor = (pct: number) => {
    if (pct >= 90) return "bg-purple-600 text-white";
    if (pct >= 70) return "bg-[#FFCE00] text-black";
    if (pct >= 40) return "bg-gray-300 text-black";
    if (pct > 0) return "bg-orange-600 text-white";
    return "bg-gray-100 text-gray-400";
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            User Engagement
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Engagement leaderboard &amp; commitment points, ranked by points banked
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            type="text"
            placeholder="Search team members…"
            className="form-input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
        {loading ? (
          <div className="p-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
            Loading engagement leaderboard…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
            {error}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-6 text-center text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
            No users found for this company.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[860px] text-xs">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
                  <th className="px-3 py-3 text-xs font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                    Rank / Name
                  </th>
                  <th className="px-2 py-3 text-xs font-semibold" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                    Buddy
                  </th>
                  <th className="px-2 py-3 text-xs font-semibold text-center">Planned actions</th>
                  <th className="px-2 py-3 text-xs font-semibold text-center">Validated actions</th>
                  <th className="px-2 py-3 text-xs font-semibold text-center">Commitment</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <tr
                    key={user.id}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-3 py-2.5" style={{ borderRight: "1px solid var(--color-border)" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium italic" style={{ color: "var(--color-text-muted)" }}>
                          #{index + 1}
                        </span>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "var(--bright-amber)", color: "var(--shadow-grey)" }}
                        >
                          {user.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5" style={{ borderRight: "1px solid var(--color-border)" }}>
                      <span className="text-xs font-medium truncate block" style={{ color: "var(--color-text-muted)" }}>
                        {user.buddyName ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="text-xs font-semibold text-blue-600">{user.plannedActions}</span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span
                        className={`tag ${user.validatedCount > 0 ? "tag--teal" : ""}`}
                        style={
                          user.validatedCount === 0
                            ? { background: "var(--color-tag-red-bg, rgba(237, 69, 81, 0.12))", color: "var(--color-tag-red-text, #8C1C24)" }
                            : undefined
                        }
                      >
                        {user.validatedCount}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${commitmentBadgeColor(user.commitmentPct)}`}>
                        {user.commitmentMaximum > 0 ? `${user.commitmentPct}%` : "No plan"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
