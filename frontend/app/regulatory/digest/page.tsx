'use client';

import React, { useState, useEffect } from 'react';

const API = '';

interface WeeklySummary {
  id: number;
  week_start_date: string;
  week_end_date: string;
  generated_at: string;
  summary_text: string;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export default function WeeklyDigest() {
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/v1/sebi/weekly-summary?limit=20`);
        if (res.ok) {
          const data = await res.json();
          setSummaries(data.summaries || []);
          if (data.summaries?.length > 0) setExpanded(data.summaries[0].id);
        }
      } catch (e) { console.error('Digest error:', e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div>
      <div className="reg-page-header">
        <h1 className="reg-page-title">Weekly Digest</h1>
        <p className="reg-page-subtitle">AI-generated weekly regulatory summaries</p>
      </div>
      {[1,2,3].map(i => <div key={i} className="reg-skeleton" style={{ height: 120, marginBottom: 16 }} />)}
    </div>
  );

  return (
    <div>
      <div className="reg-page-header">
        <h1 className="reg-page-title">Weekly Digest</h1>
        <p className="reg-page-subtitle">AI-generated weekly regulatory summaries — {summaries.length} weeks available</p>
      </div>

      {summaries.length === 0 ? (
        <div className="reg-empty">
          <div className="reg-empty-icon">📅</div>
          <div className="reg-empty-title">No weekly summaries available</div>
          <div className="reg-empty-desc">Summaries are generated automatically each week.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {summaries.map(s => {
            const isOpen = expanded === s.id;
            return (
              <div key={s.id} className="reg-digest-card" style={{ borderColor: isOpen ? 'var(--reg-primary)' : undefined }}>
                <div className="reg-digest-header" style={{ cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : s.id)}>
                  <div>
                    <div className="reg-digest-week">
                      {formatDate(s.week_start_date)} — {formatDate(s.week_end_date)}
                    </div>
                    <div className="reg-digest-date">Generated: {formatDate(s.generated_at)}</div>
                  </div>
                  <span style={{ color: 'var(--reg-text-3)', fontSize: 18 }}>{isOpen ? '▲' : '▼'}</span>
                </div>
                {isOpen && (
                  <div className="reg-digest-text" style={{ marginTop: 8 }}>
                    {s.summary_text?.split('\n').filter(Boolean).map((line, i) => (
                      <div key={i} style={{ marginBottom: 10, paddingLeft: line.trim().startsWith('•') || line.trim().startsWith('�') ? 0 : 0 }}>{line.trim()}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
