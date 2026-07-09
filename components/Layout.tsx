"use client";

import React, { useMemo } from 'react';
import { useEngine } from '@/lib/store';
import { LayoutDashboard, Bookmark, PieChart, Bell } from 'lucide-react';
import { LogoutButton } from '@/app/(app)/logout-button';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'home' | 'challenges' | 'progress';
  setActiveTab: (tab: 'home' | 'challenges' | 'progress') => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const { profile, userActions } = useEngine();

  const counts = useMemo(() => ({
    toValidate: userActions.filter(a => a.status === 'scheduled').length,
  }), [userActions]);

  const navItems = [
    { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'challenges', label: 'Library', icon: Bookmark },
    { id: 'progress', label: 'Analytics', icon: PieChart },
  ];

  return (
    <>
      {/* ── Sticky Navbar ── */}
      <nav className="navbar">
        {/* Left: brand + nav tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {/* Brand */}
          <button
            onClick={() => setActiveTab('home')}
            className="navbar__brand"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <img src="/icon.png" alt="Nudgeable logo" style={{ height: 36, width: 'auto', display: 'block' }} />
            <span style={{ color: 'var(--bright-amber)', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>Action Engine</span>
          </button>

          {/* Navigation tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as 'home' | 'challenges' | 'progress')}
                className={`btn btn--sm ${activeTab === item.id ? 'btn--primary' : 'btn--decline'}`}
              >
                <item.icon size={13} strokeWidth={2.5} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: status + user */}
        <div className="navbar__right">
          {/* Streak */}
          <span className="tag tag--featured">
            🔥 {profile.streak}
          </span>

          {/* Validate badge */}
          {/* {counts.toValidate > 0 && (
            <span className="tag tag--blue">
              {counts.toValidate} to verify
            </span>
          )} */}

          {/* Bell */}
          <button
            className="btn btn--icon"
            onClick={() => setActiveTab('home')}
            aria-label="Notifications"
          >
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
