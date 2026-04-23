'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface FeedItem {
  id: number;
  type: string;
  sub_type: string | null;
  title: string;
  date: string;
  summary_excerpt: string;
  ai_tags: any;
  sebi_department: string | null;
  sebi_url: string | null;
  language: string;
}

const TYPES = ['ORDER','CIRCULAR','PRESS_RELEASE','REGULATION','MASTER_CIRCULAR','RULES','BOARD_MEETING','GAZETTE_NOTIFICATION','GUIDELINE','ACT','ADVISORY','GENERAL_ORDER','MUTUAL_FUND'];
const SEVERITIES = ['High', 'Medium', 'Low'];

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
function formatType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function ContentLibraryInner() {
  const searchParams = useSearchParams();
  const initType = searchParams.get('type') || '';
  const initIntent = searchParams.get('intent') || '';

  const [items, setItems] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState(initType);
  const [activeSeverity, setActiveSeverity] = useState('');
  const [activeIntent, setActiveIntent] = useState(initIntent);
  const [actionOnly, setActionOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchFeed = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', '21');
      if (activeType) params.set('type', activeType);
      if (activeSeverity) params.set('severity', activeSeverity);
      if (activeIntent) params.set('intent', activeIntent);
      if (actionOnly) params.set('action_required', 'true');
      if (search) params.set('search', search);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await fetch(`${API}/api/v1/sebi/feed?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch (e) { console.error('Feed error:', e); }
    setLoading(false);
  }, [activeType, activeSeverity, activeIntent, actionOnly, search, dateFrom, dateTo]);

  useEffect(() => { fetchFeed(1); }, [activeType, activeSeverity, activeIntent, actionOnly, dateFrom, dateTo]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchFeed(1); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const clearFilters = () => {
    setActiveType(''); setActiveSeverity(''); setActiveIntent('');
    setActionOnly(false); setSearch(''); setDateFrom(''); setDateTo('');
  };

  const hasFilters = activeType || activeSeverity || activeIntent || actionOnly || search || dateFrom || dateTo;

  return (
    <div>
      <div className="reg-page-header">
        <h1 className="reg-page-title">Content Library</h1>
        <p className="reg-page-subtitle">Browse {total.toLocaleString()} SEBI regulatory documents</p>
      </div>

      {/* Search + Filters */}
      <div className="reg-filters">
        <div className="reg-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Search titles, summaries, tags..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <select className="reg-filter-select" value={activeType} onChange={e => setActiveType(e.target.value)}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
        </select>

        <select className="reg-filter-select" value={activeSeverity} onChange={e => setActiveSeverity(e.target.value)}>
          <option value="">All Severity</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <button className={`reg-filter-pill ${actionOnly ? 'active' : ''}`} onClick={() => setActionOnly(!actionOnly)}>
          ⚡ Action Required
        </button>

        <input type="date" className="reg-filter-select" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ minWidth: 130 }} />
        <span style={{ color: 'var(--reg-text-3)', fontSize: 12 }}>to</span>
        <input type="date" className="reg-filter-select" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ minWidth: 130 }} />

        {hasFilters && (
          <button className="reg-filter-pill" onClick={clearFilters} style={{ borderStyle: 'dashed' }}>✕ Clear</button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="reg-card-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="reg-skeleton reg-skeleton-card" />)}
        </div>
      )}

      {/* Cards */}
      {!loading && items.length > 0 && (
        <div className="reg-card-grid">
          {items.map(item => {
            const tags = item.ai_tags || {};
            const severity = tags.severity;
            const topics: string[] = tags.topics || [];

            return (
              <Link key={item.id} href={`/regulatory/content/${item.id}`} className="reg-card">
                <div className="reg-card-header">
                  <div className="reg-card-badges">
                    <span className={`reg-type-badge ${item.type}`}>{formatType(item.type)}</span>
                    {severity && <span className={`reg-severity-badge ${severity}`}><span className={`reg-severity-dot ${severity}`} /> {severity}</span>}
                  </div>
                  <span className="reg-card-date">{formatDate(item.date)}</span>
                </div>
                <div className="reg-card-title">{item.title}</div>
                {item.summary_excerpt && <div className="reg-card-summary">{item.summary_excerpt}</div>}
                {topics.length > 0 && (
                  <div className="reg-card-tags">
                    {topics.slice(0, 4).map((t, i) => <span key={i} className="reg-topic-tag">{t}</span>)}
                    {topics.length > 4 && <span className="reg-topic-tag">+{topics.length - 4}</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && (
        <div className="reg-empty">
          <div className="reg-empty-icon">📄</div>
          <div className="reg-empty-title">No documents found</div>
          <div className="reg-empty-desc">Try adjusting your search or filters.</div>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="reg-pagination">
          <button className="reg-page-btn" disabled={page <= 1} onClick={() => fetchFeed(page - 1)}>← Prev</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let start = Math.max(1, page - 2);
            if (start + 4 > totalPages) start = Math.max(1, totalPages - 4);
            const p = start + i;
            if (p > totalPages) return null;
            return <button key={p} className={`reg-page-btn ${p === page ? 'active' : ''}`} onClick={() => fetchFeed(p)}>{p}</button>;
          })}
          <div className="reg-page-info">Page {page} of {totalPages}</div>
          <button className="reg-page-btn" disabled={page >= totalPages} onClick={() => fetchFeed(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

export default function ContentLibrary() {
  return (
    <Suspense fallback={
      <div>
        <div className="reg-page-header">
          <h1 className="reg-page-title">Content Library</h1>
          <p className="reg-page-subtitle">Loading SEBI regulatory documents...</p>
        </div>
        <div className="reg-card-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="reg-skeleton reg-skeleton-card" />)}
        </div>
      </div>
    }>
      <ContentLibraryInner />
    </Suspense>
  );
}

