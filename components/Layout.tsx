"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEngine } from '@/lib/store';
import { ClipboardList, ListChecks, PieChart, Bell, ShieldCheck } from 'lucide-react';
import { LogoutButton } from '@/app/(app)/logout-button';

interface LayoutProps {
  children: React.ReactNode;
  role: string;
}

const Layout: React.FC<LayoutProps> = ({ children, role }) => {
  const { profile } = useEngine();
  const pathname = usePathname();

  const navItems = useMemo(() => {
    const items = [
      { href: '/prepare', label: 'Prepare', icon: ClipboardList },
      { href: '/action-plan', label: 'Action Plan', icon: ListChecks },
      { href: '/progress', label: 'Progress', icon: PieChart },
    ];
    if (role !== 'user') {
      items.push({ href: '/admin', label: 'Admin', icon: ShieldCheck });
    }
    return items;
  }, [role]);

  const isActive = (href: string) => pathname?.startsWith(href);

  return (
    <>
      {/* ── Sticky Navbar ── */}
      <nav className="navbar">
        {/* Left: brand + nav tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {/* Brand */}
          <Link
            href="/action-plan"
            className="navbar__brand"
            style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <img src="/icon.png" alt="Nudgeable logo" style={{ height: 36, width: 'auto', display: 'block' }} />
            <span style={{ color: 'var(--bright-amber)', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>Action Engine</span>
          </Link>

          {/* Navigation tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`btn btn--sm ${isActive(item.href) ? 'btn--primary' : 'btn--decline'}`}
              >
                <item.icon size={13} strokeWidth={2.5} />
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: status + user */}
        <div className="navbar__right">
          {/* Streak */}
          <span className="tag tag--featured">
            🔥 {profile.streak}
          </span>

          {/* Bell */}
          <button className="btn btn--icon" aria-label="Notifications">
            <Bell size={16} strokeWidth={2} />
          </button>

          {/* Avatar */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--bright-amber)',
              color: 'var(--shadow-grey)',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {profile.name.substring(0, 2).toUpperCase()}
          </div>

          <LogoutButton />
        </div>
      </nav>

      {/* ── Page content — top padding accounts for sticky navbar ── */}
      <main className="page-content">
        {children}
      </main>
    </>
  );
};

export default Layout;
