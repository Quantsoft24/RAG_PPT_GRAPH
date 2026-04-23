'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface DeadlineItem {
  id: number;
  type: string;
  title: string;
  date: string;
  deadlines: string[];
  severity: string | null;
  intent: string | null;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}
function formatType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function ComplianceCalendar() {
  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/v1/sebi/deadlines?limit=100`);
        if (res.ok) { const d = await res.json(); setItems(d.items || []); }
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  // Build a map: dateStr -> items[]
  const deadlineMap = useMemo(() => {
    const map: Record<string, DeadlineItem[]> = {};
    items.forEach(item => {
      const ds = item.date?.split('T')[0];
      if (ds) {
        if (!map[ds]) map[ds] = [];
        map[ds].push(item);
      }
    });
    return map;
  }, [items]);

  const days = getMonthDays(viewYear, viewMonth);
  const firstDayOfWeek = days[0]?.getDay() || 0;
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectedItems = selectedDate ? (deadlineMap[selectedDate] || []) : [];

  if (loading) return (
    <div>
      <div className="reg-page-header">
        <h1 className="reg-page-title">Compliance Calendar</h1>
        <p className="reg-page-subtitle">Loading deadline data...</p>
      </div>
      <div className="reg-skeleton" style={{ height: 400 }} />
    </div>
  );

  return (
    <div>
      <div className="reg-page-header">
        <h1 className="reg-page-title">Compliance Calendar</h1>
        <p className="reg-page-subtitle">{items.length} documents with compliance deadlines</p>
      </div>

      {/* Calendar Header */}
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={prevMonth}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button className="cal-nav-btn" onClick={nextMonth}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="cal-grid">
        {DAY_NAMES.map(d => <div key={d} className="cal-day-name">{d}</div>)}
        {blanks.map(i => <div key={`b-${i}`} className="cal-cell cal-blank" />)}
        {days.map(day => {
          const ds = day.toISOString().split('T')[0];
          const hasDeadlines = !!deadlineMap[ds];
          const count = deadlineMap[ds]?.length || 0;
          const isToday = ds === new Date().toISOString().split('T')[0];
          const isSelected = ds === selectedDate;

          return (
            <div
              key={ds}
              className={`cal-cell ${hasDeadlines ? 'cal-has-deadline' : ''} ${isToday ? 'cal-today' : ''} ${isSelected ? 'cal-selected' : ''}`}
              onClick={() => hasDeadlines && setSelectedDate(isSelected ? null : ds)}
            >
              <span className="cal-date-num">{day.getDate()}</span>
              {hasDeadlines && (
                <div className="cal-dot-row">
                  <span className="cal-deadline-count">{count}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected date detail */}
      {selectedDate && selectedItems.length > 0 && (
        <div className="cal-detail-panel">
          <div className="cal-detail-date">{formatDate(selectedDate)} - {selectedItems.length} deadline{selectedItems.length > 1 ? 's' : ''}</div>
          <div className="reg-activity-list">
            {selectedItems.map(item => (
              <Link key={item.id} href={`/regulatory/content/${item.id}`} className="reg-activity-item">
                <span className={`reg-type-badge ${item.type}`}>{formatType(item.type)}</span>
                {item.severity && <span className={`reg-severity-dot ${item.severity}`} />}
                <span className="reg-activity-title">{item.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming list */}
      <div className="reg-section" style={{ marginTop: 24 }}>
        <div className="reg-section-header">
          <div className="reg-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
            Recent Deadline Documents
          </div>
        </div>
        <div className="reg-activity-list" style={{ background: 'var(--reg-surface)', borderRadius: 'var(--reg-radius)', border: '1px solid var(--reg-border)', overflow: 'hidden' }}>
          {items.slice(0, 15).map(item => (
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
