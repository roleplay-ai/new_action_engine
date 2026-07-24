"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  GraduationCap,
  Library,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LogoutButton } from "../logout-button";

const NAV_ITEMS = [
  { href: "/superadmin", label: "Companies", description: "Organisation directory", icon: Building2, exact: true },
  { href: "/superadmin/users", label: "Users", description: "Access and roles", icon: Users },
  { href: "/superadmin/content-library", label: "Content", description: "Learning library", icon: Library },
  { href: "/superadmin/emails", label: "Emails & reminders", description: "Queue and delivery", icon: Mail },
  { href: "/superadmin/cohorts", label: "Cohorts", description: "Cohort management", icon: GraduationCap },
];

export default function SuperadminShell({
  children,
  displayName,
  email,
}: {
  children: React.ReactNode;
  displayName: string;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  const current = NAV_ITEMS.find((item) => item.exact ? pathname === item.href : pathname.startsWith(item.href));
  const busy = navigating || refreshing;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  return (
    <div className="superadmin-shell">
      <aside className="superadmin-sidebar">
        <Link href="/superadmin" className="superadmin-brand" onClick={() => pathname !== "/superadmin" && setNavigating(true)}>
          <span><ShieldCheck size={20} /></span>
          <div><strong>Nudgeable</strong><small>Superadmin console</small></div>
        </Link>

        <div className="superadmin-nav-label">Workspace</div>
        <nav className="superadmin-nav" aria-label="Superadmin navigation">
          {NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return <Link
              href={item.href}
              key={item.href}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => !active && setNavigating(true)}
            >
              <span><Icon size={17} /></span>
              <div><strong>{item.label}</strong><small>{item.description}</small></div>
            </Link>;
          })}
        </nav>

        <div className="superadmin-account">
          <div className="superadmin-account-avatar">{displayName.slice(0, 2).toUpperCase()}</div>
          <div><strong>{displayName}</strong><small>{email}</small></div>
          <LogoutButton variant="icon" />
        </div>
      </aside>

      <section className="superadmin-main">
        {busy && <div className="superadmin-progress" aria-label="Loading"><span /></div>}
        <header className="superadmin-topbar">
          <div>
            <span>Administration</span>
            <strong>{current?.label ?? "Superadmin"}</strong>
          </div>
          <button type="button" onClick={refresh} disabled={busy} className="superadmin-refresh">
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            <span>{refreshing ? "Refreshing" : "Refresh data"}</span>
          </button>
        </header>
        <main className="superadmin-content" aria-busy={busy}>{children}</main>
      </section>
    </div>
  );
}
