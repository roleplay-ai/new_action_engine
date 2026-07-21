"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEngine } from '@/lib/store';
import { Map, NotebookPen, Sparkles, ListChecks, Bell, ShieldCheck } from 'lucide-react';
import { LogoutButton } from '@/app/(app)/logout-button';
import GenerationStatus from '@/components/GenerationStatus';

interface LayoutProps {
  children: React.ReactNode;
  role: string;
}

const Layout: React.FC<LayoutProps> = ({ children, role }) => {
  const { profile, generationJob } = useEngine();
  const pathname = usePathname();

  const navItems = useMemo(() => {
    const items = [
      { href: '/journey', label: 'Journey', icon: Map },
      { href: '/notes', label: 'Notes', icon: NotebookPen },
      { href: '/plan', label: 'Plan', icon: Sparkles },
      { href: '/actions', label: 'Actions', icon: ListChecks },
    ];
    if (role !== 'user') {
      items.push({ href: '/admin', label: 'Admin', icon: ShieldCheck });
    }
    return items;
  }, [role]);

  const isActive = (href: string) => pathname?.startsWith(href);

  return (
    <div className="participant-shell">
      <aside className="participant-sidebar">
        <div>
          <Link
            href="/journey"
            className="participant-brand"
          >
            <img src="/icon.png" alt="Nudgeable logo" style={{ height: 36, width: 'auto', display: 'block' }} />
            <span><strong>Nudgeable</strong><small>Action Engine</small></span>
          </Link>
          <div className="participant-progress-card">
            <small>Your learning journey</small>
            <strong>Keep turning insight into action.</strong>
            <div className="participant-progress-track"><span style={{ width: `${Math.min(100, Math.max(8, profile.weeklyGoal * 10))}%` }} /></div>
            <p>{profile.streak > 0 ? `${profile.streak} day streak` : 'Your progress appears here'}</p>
          </div>
          <nav className="participant-nav" aria-label="Participant navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? 'active' : ''}
              >
                <span className="participant-nav-icon"><item.icon size={17} strokeWidth={2.3} /></span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="participant-sidebar-user">
          <div className="participant-avatar">{profile.name.substring(0, 2).toUpperCase()}</div>
          <div><strong>{profile.name}</strong><small>Participant</small></div>
          <div className="participant-logout"><LogoutButton /></div>
        </div>
      </aside>

      <section className="participant-main">
        <header className="participant-topbar">
          <Link href="/journey" className="participant-mobile-brand">
            <img src="/icon.png" alt="" /> <strong>Nudgeable</strong>
          </Link>
          <div className="participant-topbar-actions">
            <span className="tag tag--featured">🔥 {profile.streak}</span>
            <div style={{ position: 'relative' }}>
              <button className="btn btn--icon" aria-label="Notifications"><Bell size={16} />{generationJob && <span className="bell-badge" />}</button>
              {generationJob && <div className="bell-status-popover"><GenerationStatus job={generationJob} /></div>}
            </div>
            <div className="participant-avatar">{profile.name.substring(0, 2).toUpperCase()}</div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </section>

      <nav className="participant-bottom-nav" aria-label="Mobile participant navigation">
        {navItems.slice(0, 4).map((item) => (
          <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : ''}>
            <item.icon size={20} /><span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
