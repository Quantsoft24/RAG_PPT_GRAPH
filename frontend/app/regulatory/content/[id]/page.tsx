'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { isBookmarked, toggleBookmark } from '../../lib/bookmarks';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Document {
  id: number;
  type: string;
  sub_type: string | null;
  title: string;
  date: string;
  summary: string;
  extracted_text: string;
  ai_tags: any;
  sebi_id: string | null;
  sebi_url: string | null;
  sebi_department: string | null;
  sebi_section: string | null;
  sebi_sub_section: string | null;
  sebi_info_for: string | null;
  language: string;
  is_processed: boolean;
  scraped_at: string | null;
  processed_at: string | null;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
function formatType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DocumentDetail() {
  const params = useParams();
  const id = params.id as string;
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullText, setShowFullText] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (doc) setSaved(isBookmarked(doc.id));
  }, [doc]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/v1/sebi/content/${id}`);
        if (res.ok) setDoc(await res.json());
      } catch (e) { console.error('Detail error:', e); }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return (
    <div className="reg-detail">
      <div className="reg-skeleton" style={{ height: 32, width: 200, marginBottom: 12 }} />
      <div className="reg-skeleton" style={{ height: 60, marginBottom: 20 }} />
      <div className="reg-skeleton" style={{ height: 200, marginBottom: 16 }} />
      <div className="reg-skeleton" style={{ height: 150 }} />
    </div>
  );

  if (!doc) return (
    <div className="reg-empty">
      <div className="reg-empty-icon">❌</div>
      <div className="reg-empty-title">Document not found</div>
      <Link href="/regulatory/content" style={{ color: 'var(--reg-primary)', fontSize: 14, fontWeight: 600 }}>← Back to Content Library</Link>
    </div>
  );

  const tags = doc.ai_tags || {};
  const topics: string[] = tags.topics || [];
  const stakeholders: string[] = tags.stakeholders || [];
  const deadlines: string[] = tags.deadlines || [];

  return (
    <div className="reg-detail">
      {/* Back */}
      <Link href="/regulatory/content" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--reg-text-3)', fontSize: 13, marginBottom: 16, textDecoration: 'none' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Content Library
      </Link>

      {/* Header */}
      <div className="reg-detail-header">
        <div className="reg-detail-meta">
          <span className={`reg-type-badge ${doc.type}`}>{formatType(doc.type)}</span>
          {tags.severity && <span className={`reg-severity-badge ${tags.severity}`}><span className={`reg-severity-dot ${tags.severity}`} /> {tags.severity} Severity</span>}
          {tags.intent && <span className="reg-topic-tag" style={{ background: 'var(--reg-primary-glow)', color: 'var(--reg-primary-hover)' }}>{tags.intent}</span>}
          {tags.action_required === true && <span className="reg-topic-tag" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--reg-warning)' }}>⚡ Action Required</span>}
          <span style={{ fontSize: 13, color: 'var(--reg-text-3)' }}>{formatDate(doc.date)}</span>
        </div>
        <h1 className="reg-detail-title">{doc.title}</h1>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            className={`reg-bookmark-btn ${saved ? 'bookmarked' : ''}`}
            onClick={() => {
              const result = toggleBookmark({ id: doc.id, type: doc.type, title: doc.title, date: doc.date, severity: tags.severity });
              setSaved(result);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            {saved ? 'Bookmarked' : 'Bookmark'}
          </button>
          <Link href={`/regulatory/chat?doc=${doc.id}&title=${encodeURIComponent(doc.title)}`} className="reg-bookmark-btn" style={{ textDecoration: 'none', color: 'var(--reg-primary-hover)', borderColor: 'var(--reg-primary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            Chat about this
          </Link>
        </div>
      </div>

      {/* AI Summary */}
      {doc.summary && (
        <div className="reg-detail-section">
          <div className="reg-detail-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            AI Summary
          </div>
          <div className="reg-detail-summary">{doc.summary}</div>
        </div>
      )}

      {/* Impact Analysis */}
      {(topics.length > 0 || stakeholders.length > 0 || deadlines.length > 0) && (
        <div className="reg-detail-section">
          <div className="reg-detail-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            Impact Analysis
          </div>

          {topics.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--reg-text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Topics</div>
              <div className="reg-detail-tags-grid">
                {topics.map((t, i) => <span key={i} className="reg-topic-tag">{t}</span>)}
              </div>
            </div>
          )}

          {stakeholders.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--reg-text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Affected Stakeholders</div>
              <div className="reg-detail-tags-grid">
                {stakeholders.map((s, i) => <span key={i} className="reg-topic-tag" style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc' }}>{s}</span>)}
              </div>
            </div>
          )}

          {deadlines.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--reg-text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compliance Deadlines</div>
              <div className="reg-detail-tags-grid">
                {deadlines.map((d, i) => <span key={i} className="reg-topic-tag" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>📅 {d}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Document Text */}
      {doc.extracted_text && (
        <div className="reg-detail-section">
          <div className="reg-detail-section-title" style={{ cursor: 'pointer' }} onClick={() => setShowFullText(!showFullText)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Full Document Text
            <span style={{ fontSize: 12, color: 'var(--reg-text-3)', fontWeight: 400, marginLeft: 'auto' }}>
              {showFullText ? '▲ Collapse' : '▼ Expand'} ({(doc.extracted_text.length / 1000).toFixed(1)}k chars)
            </span>
          </div>
          {showFullText && <div className="reg-detail-text">{doc.extracted_text}</div>}
        </div>
      )}

      {/* Metadata */}
      <div className="reg-detail-section">
        <div className="reg-detail-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          Metadata
        </div>
        <div className="reg-detail-metadata-grid">
          {doc.sebi_id && <div className="reg-detail-metadata-item"><span className="reg-detail-metadata-label">SEBI ID</span><span className="reg-detail-metadata-value">{doc.sebi_id}</span></div>}
          <div className="reg-detail-metadata-item"><span className="reg-detail-metadata-label">Language</span><span className="reg-detail-metadata-value">{doc.language === 'en' ? 'English' : doc.language === 'hi' ? 'Hindi' : doc.language}</span></div>
          {doc.sebi_department && <div className="reg-detail-metadata-item"><span className="reg-detail-metadata-label">Department</span><span className="reg-detail-metadata-value">{doc.sebi_department}</span></div>}
          {doc.sebi_info_for && <div className="reg-detail-metadata-item"><span className="reg-detail-metadata-label">Addressed To</span><span className="reg-detail-metadata-value">{doc.sebi_info_for}</span></div>}
          {doc.scraped_at && <div className="reg-detail-metadata-item"><span className="reg-detail-metadata-label">Scraped At</span><span className="reg-detail-metadata-value">{formatDate(doc.scraped_at)}</span></div>}
          {doc.processed_at && <div className="reg-detail-metadata-item"><span className="reg-detail-metadata-label">Processed At</span><span className="reg-detail-metadata-value">{formatDate(doc.processed_at)}</span></div>}
        </div>
      </div>

      {/* Source Link */}
      {doc.sebi_url && (
        <div style={{ marginTop: 8, marginBottom: 40 }}>
          <a href={doc.sebi_url} target="_blank" rel="noopener noreferrer" className="reg-source-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            View on SEBI Website
          </a>
        </div>
      )}
    </div>
  );
}
