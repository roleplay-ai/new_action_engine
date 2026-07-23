"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CheckSquare,
  KeyRound,
  Loader2,
  Mail,
  Search,
  Send,
  ShieldAlert,
  Square,
  X,
} from "lucide-react";
import {
  sendWelcomeEmails,
  type SendEmailResult,
} from "@/app/actions/email-campaign";

export type WelcomeEmailUser = {
  id: string;
  email: string;
  full_name: string;
  company_id: string | null;
  company_name: string | null;
  role: string;
  persistent_login_key: string | null;
  has_stored_credentials: boolean;
  welcome_email_sent_at: string | null;
};

function isWelcomeReady(user: WelcomeEmailUser) {
  return (
    user.role !== "superadmin" &&
    !!user.persistent_login_key &&
    user.has_stored_credentials
  );
}

function readinessLabel(user: WelcomeEmailUser) {
  if (user.role === "superadmin") return "Superadmin excluded";
  if (!user.persistent_login_key) return "Login key missing";
  if (!user.has_stored_credentials) return "Credentials unavailable";
  return user.welcome_email_sent_at ? "Ready to resend" : "Ready to send";
}

function formatIstDate(value: string | null) {
  if (!value) return "Never sent";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export default function WelcomeEmailPanel({
  users,
}: {
  users: WelcomeEmailUser[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SendEmailResult[] | null>(null);

  const participantUsers = useMemo(
    () => users.filter((user) => user.role !== "superadmin"),
    [users]
  );
  const readyUsers = useMemo(
    () => participantUsers.filter(isWelcomeReady),
    [participantUsers]
  );
  const companies = useMemo(() => {
    const companyMap = new Map<string, string>();
    for (const user of participantUsers) {
      if (user.company_id && user.company_name) {
        companyMap.set(user.company_id, user.company_name);
      }
    }
    return Array.from(companyMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [participantUsers]);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return participantUsers.filter((user) => {
      const matchesCompany =
        companyId === "all" ||
        (companyId === "unassigned"
          ? !user.company_id
          : user.company_id === companyId);
      const matchesQuery =
        !normalizedQuery ||
        user.email.toLowerCase().includes(normalizedQuery) ||
        user.full_name.toLowerCase().includes(normalizedQuery) ||
        (user.company_name ?? "").toLowerCase().includes(normalizedQuery);
      return matchesCompany && matchesQuery;
    });
  }, [companyId, participantUsers, query]);

  const visibleReadyIds = visibleUsers
    .filter(isWelcomeReady)
    .map((user) => user.id);
  const allVisibleReadySelected =
    visibleReadyIds.length > 0 &&
    visibleReadyIds.every((id) => selectedIds.has(id));

  function toggleUser(userId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleVisibleReady() {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const id of visibleReadyIds) {
        if (allVisibleReadySelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function sendSelected() {
    if (selectedIds.size === 0) return;
    setSending(true);
    setError(null);
    setResults(null);
    try {
      const response = await sendWelcomeEmails(Array.from(selectedIds));
      if (response.error) {
        setError(response.error);
        return;
      }
      setResults(response.results);
      const failedIds = new Set(
        response.results
          .filter((result) => !result.success)
          .map((result) => result.userId)
      );
      setSelectedIds(failedIds);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const sentCount = results?.filter((result) => result.success).length ?? 0;
  const failedCount = results?.filter((result) => !result.success).length ?? 0;

  return (
    <section className="superadmin-surface">
      <div className="superadmin-section-heading">
        <div>
          <h2 className="flex items-center gap-2">
            <Mail size={16} className="text-[#8c7000]" />
            Welcome email delivery
          </h2>
          <p>
            Send the branded welcome email with magic link, login ID, and
            password.
          </p>
        </div>
        <span>{readyUsers.length} ready</span>
      </div>

      <div className="grid gap-3 border-b border-[#ebe8eb] bg-[#faf9fa] p-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e4e0e4] bg-white p-3">
          <small className="text-[8px] font-black uppercase tracking-[.08em] text-[#8f888f]">
            Eligible recipients
          </small>
          <p className="mt-1 text-xl font-black text-[#29252b]">
            {readyUsers.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#e4e0e4] bg-white p-3">
          <small className="text-[8px] font-black uppercase tracking-[.08em] text-[#8f888f]">
            Already welcomed
          </small>
          <p className="mt-1 text-xl font-black text-[#29252b]">
            {participantUsers.filter((user) => !!user.welcome_email_sent_at).length}
          </p>
        </div>
        <div className="rounded-xl border border-[#ead79c] bg-[#fff9e8] p-3">
          <small className="text-[8px] font-black uppercase tracking-[.08em] text-[#8c7000]">
            Needs preparation
          </small>
          <p className="mt-1 text-xl font-black text-[#705b13]">
            {participantUsers.length - readyUsers.length}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#ebe8eb] p-4">
        <label className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#958e96]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, or company"
            className="w-full !pl-9"
          />
        </label>
        <select
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          aria-label="Filter by company"
          className="min-w-[170px]"
        >
          <option value="all">All companies</option>
          <option value="unassigned">Unassigned</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={toggleVisibleReady}
          disabled={visibleReadyIds.length === 0 || sending}
          className="superadmin-secondary-action"
        >
          {allVisibleReadySelected ? (
            <CheckSquare size={14} />
          ) : (
            <Square size={14} />
          )}
          {allVisibleReadySelected ? "Clear visible" : "Select ready"}
        </button>
        <button
          type="button"
          onClick={sendSelected}
          disabled={selectedIds.size === 0 || sending}
          className="superadmin-submit"
        >
          {sending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {sending
            ? "Sending"
            : `Send welcome email${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
        </button>
      </div>

      {(error || results) && (
        <div
          className={`mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border p-3 ${
            error || failedCount
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <div>
            <strong className="text-[11px]">
              {error
                ? "Welcome emails could not be sent"
                : `${sentCount} welcome email${sentCount === 1 ? "" : "s"} sent${
                    failedCount ? ` · ${failedCount} failed` : ""
                  }`}
            </strong>
            {error && <p className="mt-1 text-[10px]">{error}</p>}
            {results && failedCount > 0 && (
              <p className="mt-1 text-[10px]">
                {results
                  .filter((result) => !result.success)
                  .map((result) => `${result.email}: ${result.error}`)
                  .join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setResults(null);
            }}
            aria-label="Dismiss result"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-h-[460px] overflow-auto">
        {visibleUsers.length === 0 ? (
          <div className="superadmin-empty">
            <Search size={24} />
            <strong>No matching recipients</strong>
            <p>Change the search or company filter to see more users.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#eeecef]">
            {visibleUsers.map((user) => {
              const ready = isWelcomeReady(user);
              const selected = selectedIds.has(user.id);
              const initials = (user.full_name || user.email)
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase();

              return (
                <li
                  key={user.id}
                  className={`grid min-h-[72px] grid-cols-[32px_36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${
                    selected ? "bg-[#fffaf0]" : "bg-white hover:bg-[#fffdf8]"
                  }`}
                >
                  <label
                    className={ready ? "cursor-pointer" : "cursor-not-allowed"}
                    title={readinessLabel(user)}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!ready || sending}
                      onChange={() => toggleUser(user.id)}
                      className="h-4 w-4 accent-[#29252b]"
                      aria-label={`Select ${user.full_name || user.email}`}
                    />
                  </label>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f3f1f3] text-[9px] font-black text-[#514b53]">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <strong className="block truncate text-[11px] text-[#302b31]">
                      {user.full_name || user.email}
                    </strong>
                    <span className="mt-0.5 block truncate text-[9px] text-[#8d858e]">
                      {user.email}
                      {user.company_name ? ` · ${user.company_name}` : " · Unassigned"}
                    </span>
                    <span className="mt-1 block text-[8px] text-[#a19aa2]">
                      Last welcome: {formatIstDate(user.welcome_email_sent_at)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-black uppercase ${
                        ready
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {ready ? (
                        <CheckCircle2 size={11} />
                      ) : user.persistent_login_key ? (
                        <ShieldAlert size={11} />
                      ) : (
                        <KeyRound size={11} />
                      )}
                      {readinessLabel(user)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[#ebe8eb] bg-[#faf9fa] px-4 py-3 text-[9px] leading-relaxed text-[#817a82]">
        Welcome emails are sent immediately. Resending keeps the same secure
        login key and stored credentials; it does not create a new password.
      </div>
    </section>
  );
}
