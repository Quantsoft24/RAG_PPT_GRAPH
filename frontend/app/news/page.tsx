'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './news.css';

// ─── Config ───
const NEWS_API = process.env.NEXT_PUBLIC_NEWS_API_URL || 'http://34.47.250.116:8001';
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes — change this to adjust refresh interval
const DEFAULT_LIMIT = 50;

// ─── Types ───
interface Sentiment {
  label: 'positive' | 'negative' | 'neutral';
  score: number;
}

interface Article {
  title: string;
  description: string;
  source: string;
  published_ist: string;
  link: string;
  sentiment?: Sentiment;
}

interface ApiMeta {
  total_results: number;
  returned: number;
  total_pages: number;
  current_page: number;
  response_time_ms: number;
  last_full_fetch_ist: string;
  sentiment_enabled: boolean;
}

interface ApiResponse {
  success: boolean;
  query: { company: string[] | null; hours: number; page: number; limit: number };
  meta: ApiMeta;
  articles: Article[];
}

// ─── Helpers ───
function timeAgo(istDateStr: string): string {
  // Parse IST date string: "2026-04-17 19:50:00 IST"
  const clean = istDateStr.replace(' IST', '');
  const date = new Date(clean + '+05:30');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function timeAgoDate(date: Date): string {
  const diffMs = new Date().getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sentimentColor(label?: string): string {
  if (label === 'positive') return 'var(--mi-positive)';
  if (label === 'negative') return 'var(--mi-negative)';
  return 'var(--mi-neutral)';
}

// ═══════════════════════════════════════════════════════════════
export default function MarketIntelligencePage() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [hours, setHours] = useState(24);
  const [page, setPage] = useState(1);
  const [articles, setArticles] = useState<Article[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');
  const [companySubFilter, setCompanySubFilter] = useState<string[]>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Fetch News ──
  const fetchNews = useCallback(async (opts?: { p?: number; silent?: boolean }) => {
    const targetPage = opts?.p ?? page;
    if (!opts?.silent) setLoading(true);
    setError('');

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const params = new URLSearchParams();
      if (companies.length > 0) params.set('company', companies.join(','));
      params.set('hours', String(hours));
      params.set('page', String(targetPage));
      params.set('limit', String(DEFAULT_LIMIT));

      const res = await fetch(`${NEWS_API}/news?${params}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: ApiResponse = await res.json();

      if (data.success) {
        setArticles(data.articles);
        setMeta(data.meta);
        setPage(targetPage);
        setLastFetch(new Date());
      } else {
        throw new Error('API returned success=false');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setError(e.message || 'Failed to fetch news');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [companies, hours, page]);

  // ── Initial load & auto-refresh ──
  useEffect(() => {
    fetchNews({ p: 1 });

    // Auto-refresh timer
    refreshTimer.current = setInterval(() => {
      fetchNews({ p: 1, silent: true });
    }, AUTO_REFRESH_MS);

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [companies, hours]); // Re-fetch when filters change

  // ── Clock for relative time updates ──
  useEffect(() => {
    const clockTimer = setInterval(() => setNowTick(prev => prev + 1), 60000); // 1 minute
    return () => clearInterval(clockTimer);
  }, []);

  // ── Close Dropdown on click outside ──
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Add company ──
  const addCompany = useCallback(() => {
    const raw = searchInput.trim();
    if (!raw) return;
    const newOnes = raw.split(',').map(s => s.trim()).filter(s => s && !companies.includes(s));
    if (newOnes.length > 0) {
      setCompanies(prev => [...prev, ...newOnes]);
      setPage(1);
    }
    setSearchInput('');
  }, [searchInput, companies]);

  const removeCompany = useCallback((c: string) => {
    setCompanies(prev => prev.filter(x => x !== c));
    setCompanySubFilter(prev => prev.filter(x => x !== c));
    setPage(1);
    setSentimentFilter('all');
  }, []);

  const clearCompanies = useCallback(() => {
    setCompanies([]);
    setCompanySubFilter([]);
    setPage(1);
    setSentimentFilter('all');
  }, []);

  const displayedArticles = React.useMemo(() => {
    let filtered = articles;
    if (sentimentFilter !== 'all') {
      filtered = filtered.filter(a => a.sentiment?.label === sentimentFilter);
    }
    if (companySubFilter.length > 0) {
      filtered = filtered.filter(a => {
        const title = a.title.toLowerCase();
        const desc = a.description ? a.description.toLowerCase() : '';
        return companySubFilter.some(c => {
          const t = c.toLowerCase();
          return title.includes(t) || desc.includes(t);
        });
      });
    }
    return filtered;
  }, [articles, sentimentFilter, companySubFilter]);

  const toggleCompanyFilter = (c: string) => {
    setCompanySubFilter(prev => 
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  // ── Quick picks ──
  const QUICK_PICKS = ['Apple', 'Tesla', 'Google', 'HDFC Bank', 'Infosys', 'Reliance', 'TCS', 'Amazon'];

  return (
    <div className="mi-page">
      {/* ── Top Bar ── */}
      <div className="mi-topbar">
        <div className="mi-topbar-left">
          <a href="/chat" className="mi-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </a>
          <div className="mi-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
          </div>
          <div className="mi-title-group">
            <div className="mi-title">News Sentiment</div>
            <div className="mi-subtitle">Real-time Financial News · FinBERT Sentiment</div>
          </div>
        </div>

        <div className="mi-topbar-center">
          <div className="mi-search-container">
            <svg className="mi-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              className="mi-search-input"
              type="text"
              placeholder="Add company: 'Apple' or 'HDFC Bank, ICICI, TCS'"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCompany()}
            />
          </div>
          <button className="mi-search-btn" onClick={addCompany} disabled={!searchInput.trim()}>
            Track
          </button>
        </div>

        <div className="mi-topbar-right">
          <select className="mi-time-select" value={hours} onChange={e => { setHours(Number(e.target.value)); setPage(1); }}>
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
            <option value={168}>Last 7 days</option>
            <option value={240}>Last 10 days</option>
          </select>

          <div className={`mi-refresh-badge ${lastFetch && (Date.now() - lastFetch.getTime() > AUTO_REFRESH_MS * 1.5) ? 'stale' : ''}`}>
            <div className="mi-live-dot" />
            {lastFetch ? `Updated ${timeAgoDate(lastFetch)}` : 'Loading...'}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mi-main">
        {/* Error */}
        {error && <div className="mi-error">⚠️ {error}</div>}

        {/* Company Chips */}
        {companies.length > 0 && (
          <div className="mi-chips">
            {companies.map(c => (
              <div key={c} className="mi-chip active">
                {c}
                <button className="mi-chip-remove" onClick={() => removeCompany(c)}>×</button>
              </div>
            ))}
            <button className="mi-chip" onClick={clearCompanies} style={{ borderStyle: 'dashed' }}>
              Clear all
            </button>
          </div>
        )}

        {/* Quick Picks (shown when no companies tracked) */}
        {companies.length === 0 && !loading && (
          <div className="mi-chips">
            <span style={{ fontSize: 12, color: 'var(--mi-text-dim)', marginRight: 4 }}>Quick picks:</span>
            {QUICK_PICKS.map(c => (
              <div key={c} className="mi-chip" onClick={() => { setCompanies([c]); setPage(1); }}>
                {c}
              </div>
            ))}
          </div>
        )}

        {/* Sentiment Dashboard (only when companies are tracked) */}
        {companies.length > 0 && meta && !loading && (
          <div className="mi-dashboard">
            {companies.map(company => {
              const term = company.toLowerCase();
              const cArticles = articles.filter(a => {
                const title = a.title.toLowerCase();
                const desc = a.description ? a.description.toLowerCase() : '';
                return title.includes(term) || desc.includes(term);
              });
              
              const withSentiment = cArticles.filter(a => a.sentiment);
              const pos = withSentiment.filter(a => a.sentiment?.label === 'positive').length;
              const neg = withSentiment.filter(a => a.sentiment?.label === 'negative').length;
              const neu = withSentiment.filter(a => a.sentiment?.label === 'neutral').length;
              const total = withSentiment.length || 1;
              const sumPolar = withSentiment.reduce((sum, a) => sum + (a.sentiment?.label === 'positive' ? a.sentiment.score : a.sentiment?.label === 'negative' ? -a.sentiment.score : 0), 0);
              const avgScore = withSentiment.length > 0 ? sumPolar / withSentiment.length : 0;
              const pctPos = (pos / total) * 100;
              const pctNeg = (neg / total) * 100;
              const pctNeu = (neu / total) * 100;
              
              return (
                <div key={company} className="mi-stat-card">
                  <div className="mi-stat-label">{company} Pulse</div>
                  <div className="mi-stat-value" style={{ color: avgScore > 0.15 ? 'var(--mi-positive)' : avgScore < -0.15 ? 'var(--mi-negative)' : 'var(--mi-neutral)' }}>
                    {avgScore > 0.15 ? '↗ Bullish' : avgScore < -0.15 ? '↘ Bearish' : '→ Neutral'}
                  </div>
                  <div className="mi-sentiment-bar">
                    <div className="mi-sentiment-bar-pos" style={{ width: `${pctPos}%` }} />
                    <div className="mi-sentiment-bar-neu" style={{ width: `${pctNeu}%` }} />
                    <div className="mi-sentiment-bar-neg" style={{ width: `${pctNeg}%` }} />
                  </div>
                  <div className="mi-sentiment-legend">
                    <span><div className="mi-legend-dot pos" /> {pos} positive</span>
                    <span><div className="mi-legend-dot neu" /> {neu} neutral</span>
                    <span><div className="mi-legend-dot neg" /> {neg} negative</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* General mode dashboard */}
        {companies.length === 0 && meta && !loading && (
          <div className="mi-dashboard">
            <div className="mi-stat-card">
              <div className="mi-stat-label">Total Articles</div>
              <div className="mi-stat-value">{meta.total_results.toLocaleString()}</div>
              <div className="mi-stat-sub">from 82 RSS feeds · last {hours}h</div>
            </div>
            <div className="mi-stat-card">
              <div className="mi-stat-label">Mode</div>
              <div className="mi-stat-value" style={{ fontSize: 22 }}>📡 General</div>
              <div className="mi-stat-sub">Track a company to enable AI sentiment</div>
            </div>
            <div className="mi-stat-card">
              <div className="mi-stat-label">Response Time</div>
              <div className="mi-stat-value">{meta.response_time_ms}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 2 }}>ms</span></div>
              <div className="mi-stat-sub">Cached results from 82 feeds</div>
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="mi-section-header">
          <div className="mi-section-title">
            📰 {companies.length > 0 ? `News for ${companies.join(', ')}` : 'Financial News Feed'}
            {meta && <span className="mi-section-count">({meta.total_results.toLocaleString()} total)</span>}
          </div>
          {companies.length > 0 && !loading && (
            <div className="mi-filter-group">
              <div className="mi-dropdown-container" ref={dropdownRef}>
                <button className={`mi-filter-pill ${showCompanyDropdown ? 'active' : ''}`} onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  {companySubFilter.length === 0 ? 'All Companies' : `${companySubFilter.length} Selected`} ▾
                </button>
                {showCompanyDropdown && (
                  <div className="mi-dropdown-menu">
                    <button className={`mi-dropdown-item ${companySubFilter.length === 0 ? 'active' : ''}`} onClick={() => setCompanySubFilter([])}>
                      <div className="mi-dropdown-checkbox">{companySubFilter.length === 0 && '✓'}</div>
                      All Companies
                    </button>
                    <div className="mi-divider" />
                    {companies.map(c => (
                      <button key={c} className={`mi-dropdown-item ${companySubFilter.includes(c) ? 'active' : ''}`} onClick={() => toggleCompanyFilter(c)}>
                        <div className="mi-dropdown-checkbox">{companySubFilter.includes(c) && '✓'}</div>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ width: 1, background: 'var(--mi-border)', margin: '0 4px' }} />

              <button className={`mi-filter-pill ${sentimentFilter === 'all' ? 'active' : ''}`} onClick={() => setSentimentFilter('all')}>
                All
              </button>
              <button className={`mi-filter-pill ${sentimentFilter === 'positive' ? 'active pos' : ''}`} onClick={() => setSentimentFilter('positive')}>
                🟢 Positive
              </button>
              <button className={`mi-filter-pill ${sentimentFilter === 'neutral' ? 'active neu' : ''}`} onClick={() => setSentimentFilter('neutral')}>
                ⚪ Neutral
              </button>
              <button className={`mi-filter-pill ${sentimentFilter === 'negative' ? 'active neg' : ''}`} onClick={() => setSentimentFilter('negative')}>
                🔴 Negative
              </button>
            </div>
          )}
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="mi-articles">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="mi-skeleton mi-skeleton-card" />
            ))}
          </div>
        )}

        {/* Articles */}
        {!loading && displayedArticles.length > 0 && (
          <div className="mi-articles">
            {displayedArticles.map((article, i) => (
              <a
                key={i}
                className={`mi-article ${article.sentiment?.label || ''}`}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* Sentiment indicator (only for company queries) */}
                {article.sentiment && (
                  <div className="mi-article-sentiment">
                    <div className={`mi-sentiment-dot ${article.sentiment.label}`} />
                    <div className={`mi-sentiment-score ${article.sentiment.label}`}>
                      {Math.round(article.sentiment.score * 100)}%
                    </div>
                  </div>
                )}

                <div className="mi-article-body">
                  <div className="mi-article-title">{article.title}</div>
                  {article.description && article.description !== article.title && (
                    <div className="mi-article-desc">{article.description}</div>
                  )}
                  <div className="mi-article-meta">
                    <span className="mi-source-badge">{article.source}</span>
                    <span>{timeAgo(article.published_ist)}</span>
                    {article.sentiment && (
                      <span style={{ color: sentimentColor(article.sentiment.label), fontWeight: 600 }}>
                        {article.sentiment.label === 'positive' ? '🟢' : article.sentiment.label === 'negative' ? '🔴' : '⚪'} {article.sentiment.label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mi-article-link-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayedArticles.length === 0 && !error && (
          <div className="mi-empty">
            <div className="mi-empty-icon">📰</div>
            <div className="mi-empty-title">{articles.length > 0 && (sentimentFilter !== 'all' || companySubFilter.length > 0) ? `No matching articles` : 'No articles found'}</div>
            <div className="mi-empty-desc">{articles.length > 0 && (sentimentFilter !== 'all' || companySubFilter.length > 0) ? 'Try adjusting your filters or checking the next page.' : 'Try widening the time window or changing the company search.'}</div>
          </div>
        )}

        {/* Pagination */}
        {!loading && meta && meta.total_pages > 1 && (
          <div className="mi-pagination">
            <button
              className="mi-page-btn"
              disabled={page <= 1}
              onClick={() => fetchNews({ p: page - 1 })}
            >
              ← Prev
            </button>

            {/* Page numbers */}
            {Array.from({ length: Math.min(5, meta.total_pages) }, (_, i) => {
              const totalPages = meta.total_pages;
              let start = Math.max(1, page - 2);
              if (start + 4 > totalPages) start = Math.max(1, totalPages - 4);
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  className={`mi-page-btn ${p === page ? 'active' : ''}`}
                  onClick={() => fetchNews({ p })}
                >
                  {p}
                </button>
              );
            })}

            <div className="mi-page-info">
              Page {page} of {meta.total_pages}
            </div>

            <button
              className="mi-page-btn"
              disabled={page >= meta.total_pages}
              onClick={() => fetchNews({ p: page + 1 })}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
