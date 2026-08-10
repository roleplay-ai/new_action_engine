"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LayoutDashboard, MessageSquareText, Megaphone, UserRound, Users, LogOut } from "lucide-react";

const navItems = [
  { href: "/trainer", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/trainer/conversation", label: "Conversation", icon: MessageSquareText },
  { href: "/trainer/notices", label: "Notice board", icon: Megaphone },
  { href: "/trainer/facilitators", label: "Facilitators", icon: UserRound },
  { href: "/trainer/members", label: "Members & tags", icon: Users },
];

export function TrainerSidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <aside
      className="w-64 flex flex-col h-full shrink-0 overflow-y-auto"
      style={{ background: "var(--color-bg-dark)", borderRight: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="p-6 flex flex-col gap-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/trainer" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img src="/NudgeableBlack.png" alt="Nudgeable" style={{ height: 40, width: "auto", filter: "brightness(0) invert(1)" }} />
        </Link>
        <span className="text-xs font-semibold uppercase tracking-widest mt-2" style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em" }}>
          Trainer
        </span>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={active ? { background: "var(--bright-amber)", color: "var(--shadow-grey)" } : { color: "rgba(255,255,255,0.5)", background: "transparent" }}
            >
              <Icon size={16} strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "var(--bright-amber)", color: "var(--shadow-grey)" }}
          >
            {displayName.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--white)" }}>{displayName}</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Trainer</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
