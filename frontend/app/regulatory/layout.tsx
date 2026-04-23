'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './regulatory.css';

const NAV_ITEMS = [
  {
    href: '/regulatory',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    exact: true,
  },
  {
    href: '/regulatory/content',
    label: 'Content Library',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    href: '/regulatory/calendar',
    label: 'Compliance Calendar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/regulatory/digest',
    label: 'Weekly Digest',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    href: '/regulatory/bookmarks',
    label: 'Bookmarks',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

const CHAT_NAV = {
  href: '/regulatory/chat',
  label: 'AI Assistant',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

export default function RegulatoryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="reg-hub">
      {/* Mobile overlay */}
      <div className={`reg-mobile-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />

      {/* Sidebar */}
      <aside className={`reg-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="reg-sidebar-header">
          <Link href="/regulatory" className="reg-sidebar-logo">
            <div className="reg-sidebar-logo-mark">P</div>
            <div>
              <div className="reg-sidebar-logo-text">PRISM Regulatory</div>
              <div className="reg-sidebar-subtitle">SEBI Intelligence Hub</div>
            </div>
          </Link>
        </div>

        <nav className="reg-sidebar-nav">
          {NAV_ITEMS.map(item => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href) && !(item.href === '/regulatory/content' && pathname.startsWith('/regulatory/calendar'));
            return (
              <Link key={item.href} href={item.href} className={`reg-nav-item ${isActive ? 'active' : ''}`}>
                {item.icon}
                {item.label}
              </Link>
            );
          })}

          <div className="reg-nav-divider" />

          {/* AI Chat - Special styling */}
          <Link
            href={CHAT_NAV.href}
            className={`reg-nav-item ${pathname.startsWith(CHAT_NAV.href) ? 'active' : ''}`}
            style={pathname.startsWith(CHAT_NAV.href) ? {} : { color: 'var(--reg-primary-hover)' }}
          >
            {CHAT_NAV.icon}
            {CHAT_NAV.label}
          </Link>
        </nav>

        <div className="reg-sidebar-footer">
          <Link href="/chat" className="reg-back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to SIGMA Chat
          </Link>
        </div>
      </aside>

      {/* Mobile toggle */}
      <button className="reg-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
        {mobileOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        )}
      </button>

      {/* Main Content */}
      <main className="reg-main">
        {children}
      </main>
    </div>
  );
}
