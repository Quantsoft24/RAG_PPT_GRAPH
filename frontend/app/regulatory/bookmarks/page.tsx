'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBookmarks, clearBookmarks, type BookmarkedDoc } from '../lib/bookmarks';

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
function formatType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000) return 'Just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkedDoc[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setBookmarks(getBookmarks());
    setLoaded(true);
  }, []);

  const remove = (id: number) => {
    const updated = bookmarks.filter(b => b.id !== id);
    localStorage.setItem('prism_reg_bookmarks', JSON.stringify(updated));
    setBookmarks(updated);
  };

  const handleClearAll = () => {
    clearBookmarks();
    setBookmarks([]);
  };

  if (!loaded) return (
    <div>
      <div className="reg-page-header">
        <h1 className="reg-page-title">Bookmarks</h1>
        <p className="reg-page-subtitle">Loading saved documents...</p>
      </div>
      {[1,2,3].map(i => <div key={i} className="reg-skeleton" style={{ height: 60, marginBottom: 8 }} />)}
    </div>
  );

  return (
    <div>
      <div className="reg-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="reg-page-title">Bookmarks</h1>
          <p className="reg-page-subtitle">{bookmarks.length} saved document{bookmarks.length !== 1 ? 's' : ''}</p>
        </div>
        {bookmarks.length > 0 && (
          <button className="chat-clear-btn" onClick={handleClearAll}>Clear All</button>
        )}
      </div>

      {bookmarks.length === 0 ? (
        <div className="reg-empty">
          <div className="reg-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--reg-text-3)" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </div>
          <div className="reg-empty-title">No bookmarks yet</div>
          <div className="reg-empty-desc">Save documents from the Content Library or Document Detail pages for quick access.</div>
          <Link href="/regulatory/content" style={{ marginTop: 16, color: 'var(--reg-primary)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Browse Content Library
          </Link>
        </div>
      ) : (
        <div className="reg-activity-list" style={{ background: 'var(--reg-surface)', borderRadius: 'var(--reg-radius)', border: '1px solid var(--reg-border)', overflow: 'hidden' }}>
          {bookmarks.map(b => (
            <div key={b.id} className="reg-activity-item" style={{ justifyContent: 'space-between', gap: 12 }}>
              <Link href={`/regulatory/content/${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                <span className={`reg-type-badge ${b.type}`}>{formatType(b.type)}</span>
                {b.severity && <span className={`reg-severity-dot ${b.severity}`} />}
                <span className="reg-activity-title">{b.title}</span>
                <span className="reg-activity-date">{formatDate(b.date)}</span>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--reg-text-3)' }}>{timeAgo(b.bookmarkedAt)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(b.id); }}
                  style={{ background: 'none', border: 'none', color: 'var(--reg-text-3)', cursor: 'pointer', padding: 4, fontSize: 14, transition: 'var(--reg-transition)', fontFamily: 'inherit' }}
                  title="Remove bookmark"
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--sev-high)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--reg-text-3)'; }}
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
