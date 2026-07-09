"use client";

import { useState } from "react";
import { rotateAutoLoginKey } from "@/app/actions/superadmin";
import { ExternalLink, RefreshCw, ChevronDown, ChevronUp, Copy, Key } from "lucide-react";

type User = {
  id: string;
  email: string;
  full_name: string;
  persistent_login_key: string | null;
};

export default function AutoLoginTestingPanel({ users }: { users: User[] }) {
  const [expanded, setExpanded] = useState(false);
  const [rotating, setRotating] = useState<string | null>(null);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const usersWithKeys = users.filter((u) => u.persistent_login_key);

  async function handleRotate(userId: string) {
    setRotating(userId);
    await rotateAutoLoginKey(userId);
    setRotating(null);
  }

  function copyLink(key: string) {
    const url = `${baseUrl}/api/auto-login?key=${key}`;
    navigator.clipboard.writeText(url);
  }

  return (
    <div className="border-4 border-black rounded-2xl overflow-hidden bg-amber-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left font-black uppercase tracking-tight hover:bg-amber-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Key size={18} />
          Auto-login (internal testing)
        </span>
        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {expanded && (
        <div className="p-4 pt-0 border-t-2 border-black space-y-4">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">
            Use these links to test auto-login (incognito, different browsers).
          </p>

          <div className="space-y-2">
            {usersWithKeys.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No users with keys yet. Run migrations to backfill.</p>
            ) : (
              usersWithKeys.map((u) => {
                const url = `${baseUrl}/api/auto-login?key=${u.persistent_login_key}`;
                return (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center gap-2 p-3 bg-white border-2 border-black rounded-xl"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{u.email}</p>
                      <p className="text-[10px] font-mono text-slate-500 truncate" title={u.persistent_login_key ?? ""}>
                        {u.persistent_login_key}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyLink(u.persistent_login_key!)}
                        className="p-2 border-2 border-black rounded-lg hover:bg-slate-100 font-bold text-[10px] uppercase"
                        title="Copy link"
                      >
                        <Copy size={14} />
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-[#3699FC] text-white border-2 border-black rounded-lg hover:bg-[#2980e0] font-bold text-[10px] uppercase flex items-center gap-1"
                      >
                        <ExternalLink size={14} />
                        Test
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRotate(u.id)}
                        disabled={!!rotating}
                        className="p-2 bg-amber-500 text-white border-2 border-black rounded-lg hover:bg-amber-600 font-bold text-[10px] uppercase disabled:opacity-50 flex items-center gap-1"
                        title="Rotate key (old links stop working)"
                      >
                        <RefreshCw size={14} className={rotating === u.id ? "animate-spin" : ""} />
                        Rotate
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
