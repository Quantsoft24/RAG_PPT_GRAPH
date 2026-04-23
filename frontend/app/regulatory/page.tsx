'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Stats {
  total_documents: number;
  this_week: number;
  today: number;
  action_required: number;
  high_severity_this_week: number;
  type_counts: { type: string; count: number }[];
  severity_counts: { severity: string; count: number }[];
  intent_counts: { intent: string; count: number }[];
}

interface RecentItem {
  id: number;
  type: string;
  title: string;
  date: string;
  severity: string | null;
  intent: string | null;
}

interface WeeklySummary {
  id: number;
  week_start_date: string;
  week_end_date: string;
  summary_text: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function formatType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function RegulatoryDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sRes, rRes, wRes] = await Promise.all([
          fetch(`${API}/api/v1/sebi/stats`),
          fetch(`${API}/api/v1/sebi/recent?limit=12`),
          fetch(`${API}/api/v1/sebi/weekly-summary?limit=1`),
        ]);
        if (sRes.ok) setStats(await sRes.json());
        if (rRes.ok) { const d = await rRes.json(); setRecent(d.items || []); }
        if (wRes.ok) { const d = await wRes.json(); setWeekly(d.summaries?.[0] || null); }
      } catch (e) { console.error('Dashboard load error:', e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div>
      <div className="reg-page-header">
        <h1 className="reg-page-title">Regulatory Intelligence</h1>
        <p className="reg-page-subtitle">SEBI compliance monitoring & analysis</p>
      </div>
      <div className="reg-stats-grid">
        {[1,2,3,4,5].map(i => <div key={i} className="reg-skeleton reg-skeleton-stat" />)}
      </div>
      <div className="reg-card-grid">
        {[1,2,3,4].map(i => <div key={i} className="reg-skeleton reg-skeleton-card" />)}
      </div>
    </div>
  );

  const sevTotal = stats?.severity_counts?.reduce((s, c) => s + c.count, 0) || 1;
  const getSevCount = (s: string) => stats?.severity_counts?.find(c => c.severity === s)?.count || 0;

  return (
    <div>
      {/* Header */}
      <div className="reg-page-header">
        <h1 className="reg-page-title">Regulatory Intelligence</h1>
        <p className="reg-page-subtitle">SEBI compliance monitoring & analysis — {stats?.total_documents?.toLocaleString()} documents indexed</p>
      </div>

      {/* Stats Bar */}
      <div className="reg-stats-grid">
        <div className="reg-stat-card">
          <div className="reg-stat-label">Total Documents</div>
          <div className="reg-stat-value">{stats?.total_documents?.toLocaleString()}</div>
          <div className="reg-stat-sub">Across all content types</div>
        </div>
        <div className="reg-stat-card">
          <div className="reg-stat-label">This Week</div>
          <div className="reg-stat-value success">{stats?.this_week?.toLocaleString()}</div>
          <div className="reg-stat-sub">{stats?.today} today</div>
        </div>
        <div className="reg-stat-card">
          <div className="reg-stat-label">High Severity</div>
          <div className="reg-stat-value high">{stats?.high_severity_this_week?.toLocaleString()}</div>
          <div className="reg-stat-sub">This week</div>
        </div>
        <div className="reg-stat-card">
          <div className="reg-stat-label">Action Required</div>
          <div className="reg-stat-value warning">{stats?.action_required?.toLocaleString()}</div>
          <div className="reg-stat-sub">Pending compliance items</div>
        </div>
        <div className="reg-stat-card">
          <div className="reg-stat-label">Severity Mix</div>
          <div className="reg-severity-bar-container">
            <div className="reg-severity-bar-segment" style={{ width: `${(getSevCount('High')/sevTotal)*100}%`, background: 'var(--sev-high)' }} />
            <div className="reg-severity-bar-segment" style={{ width: `${(getSevCount('Medium')/sevTotal)*100}%`, background: 'var(--sev-medium)' }} />
            <div className="reg-severity-bar-segment" style={{ width: `${(getSevCount('Low')/sevTotal)*100}%`, background: 'var(--sev-low)' }} />
          </div>
          <div className="reg-severity-legend">
            <span className="reg-severity-legend-item"><span className="reg-severity-dot High" /> {getSevCount('High').toLocaleString()}</span>
            <span className="reg-severity-legend-item"><span className="reg-severity-dot Medium" /> {getSevCount('Medium').toLocaleString()}</span>
            <span className="reg-severity-legend-item"><span className="reg-severity-dot Low" /> {getSevCount('Low').toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* Weekly Summary */}
        {weekly && (
          <div className="reg-detail-section" style={{ gridColumn: '1 / -1' }}>
            <div className="reg-detail-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              Weekly Regulatory Summary
              <span style={{ fontSize: 12, color: 'var(--reg-text-3)', fontWeight: 400, marginLeft: 'auto' }}>
                {formatDate(weekly.week_start_date)} — {formatDate(weekly.week_end_date)}
              </span>
            </div>
            <div className="reg-detail-summary" style={{ whiteSpace: 'pre-wrap' }}>
              {weekly.summary_text?.split('\n').filter(Boolean).map((line, i) => (
                <div key={i} style={{ marginBottom: 8 }}>{line.trim()}</div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <Link href="/regulatory/digest" style={{ fontSize: 13, color: 'var(--reg-primary)', fontWeight: 600 }}>View all weekly digests →</Link>
            </div>
          </div>
        )}

        {/* Content Type Breakdown */}
        <div className="reg-detail-section">
          <div className="reg-detail-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Content Types
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats?.type_counts?.slice(0, 8).map(t => (
              <Link key={t.type} href={`/regulatory/content?type=${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', padding: '6px 0' }}>
                <span className={`reg-type-badge ${t.type}`}>{formatType(t.type)}</span>
                <div style={{ flex: 1, height: 4, background: 'var(--reg-surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (t.count / (stats.type_counts[0]?.count || 1)) * 100)}%`,
                    background: 'var(--reg-primary)',
                    borderRadius: 2,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--reg-text-3)', minWidth: 50, textAlign: 'right' }}>{t.count.toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Top Intents */}
        <div className="reg-detail-section">
          <div className="reg-detail-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            Regulatory Intents
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats?.intent_counts?.slice(0, 8).map(t => (
              <Link key={t.intent} href={`/regulatory/content?intent=${t.intent}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', padding: '6px 0' }}>
                <span style={{ fontSize: 13, color: 'var(--reg-text)', fontWeight: 500, minWidth: 160 }}>{t.intent}</span>
                <div style={{ flex: 1, height: 4, background: 'var(--reg-surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (t.count / (stats.intent_counts[0]?.count || 1)) * 100)}%`,
                    background: 'var(--reg-accent)',
                    borderRadius: 2,
                  }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--reg-text-3)', minWidth: 50, textAlign: 'right' }}>{t.count.toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="reg-section">
        <div className="reg-section-header">
          <div className="reg-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            Recent Activity
          </div>
          <Link href="/regulatory/content" style={{ fontSize: 13, color: 'var(--reg-primary)', fontWeight: 600 }}>View all →</Link>
        </div>
        <div className="reg-activity-list" style={{ background: 'var(--reg-surface)', borderRadius: 'var(--reg-radius)', border: '1px solid var(--reg-border)', overflow: 'hidden' }}>
          {recent.map(item => (
            <Link key={item.id} href={`/regulatory/content/${item.id}`} className="reg-activity-item">
              <span className={`reg-type-badge ${item.type}`}>{formatType(item.type)}</span>
              {item.severity && <span className={`reg-severity-dot ${item.severity}`} />}
              <span className="reg-activity-title">{item.title}</span>
              <span className="reg-activity-date">{formatDate(item.date)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
