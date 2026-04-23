'use client';

import React, { useState, useRef, useEffect } from 'react';

const API = '';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { id: number; title: string; type: string }[];
  timestamp: number;
}

const SUGGESTED_QUESTIONS = [
  'What are the latest SEBI circulars on mutual funds?',
  'Explain recent enforcement orders against market manipulation',
  'What compliance deadlines are upcoming for stock brokers?',
  'Summarize SEBI regulations on insider trading',
  'What are the key changes in AIF regulations?',
];

const TYPE_FILTERS = ['All', 'Circulars', 'Orders', 'Regulations', 'Press Releases', 'Board Meetings'];

export default function RegulatoryChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages]);

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('prism_reg_chat_history');
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  // Save chat history
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem('prism_reg_chat_history', JSON.stringify(messages.slice(-50)));
      } catch {}
    }
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const query = (text || input).trim();
    if (!query || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: query, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Search the SEBI database for relevant documents
      const typeMap: Record<string, string> = {
        'Circulars': 'CIRCULAR', 'Orders': 'ORDER', 'Regulations': 'REGULATION',
        'Press Releases': 'PRESS_RELEASE', 'Board Meetings': 'BOARD_MEETING',
      };
      const params = new URLSearchParams({ q: query, limit: '5' });
      if (activeFilter !== 'All' && typeMap[activeFilter]) {
        params.set('type', typeMap[activeFilter]);
      }

      const res = await fetch(`${API}/api/v1/sebi/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        const sources = (data.items || []).map((item: any) => ({
          id: item.id, title: item.title, type: item.type,
        }));

        // Build AI-style response from search results
        let response = '';
        if (data.items?.length > 0) {
          response = `Based on my analysis of ${data.total.toLocaleString()} matching SEBI documents, here are the most relevant findings:\n\n`;
          data.items.forEach((item: any, i: number) => {
            const sev = item.severity ? ` [${item.severity} Severity]` : '';
            response += `**${i + 1}. ${item.title}**${sev}\n`;
            response += `${item.summary_excerpt || 'No summary available.'}\n\n`;
          });
          if (mode === 'advanced' && data.items[0]?.ai_tags) {
            const tags = data.items[0].ai_tags;
            response += `\n---\n**Impact Analysis:**\n`;
            if (tags.intent) response += `- **Intent:** ${tags.intent}\n`;
            if (tags.topics?.length) response += `- **Topics:** ${tags.topics.join(', ')}\n`;
            if (tags.stakeholders?.length) response += `- **Affected Parties:** ${tags.stakeholders.join(', ')}\n`;
            if (tags.deadlines?.length) response += `- **Deadlines:** ${tags.deadlines.join(', ')}\n`;
          }
        } else {
          response = `I searched the SEBI regulatory database but found no documents matching "${query}". Try adjusting your search terms or filters.`;
        }

        const assistantMsg: Message = {
          role: 'assistant', content: response, sources, timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant', content: 'Sorry, I encountered an error while searching. Please try again.',
          timestamp: Date.now(),
        }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant', content: 'Connection error. Please check your network and try again.',
        timestamp: Date.now(),
      }]);
    }
    setLoading(false);
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem('prism_reg_chat_history');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      {/* Chat Header */}
      <div className="chat-header-bar">
        <div>
          <h1 className="chat-title">AI Regulatory Assistant</h1>
          <p className="chat-subtitle">Ask questions about SEBI regulations, circulars, and compliance</p>
        </div>
        {messages.length > 0 && (
          <button className="chat-clear-btn" onClick={clearHistory}>Clear History</button>
        )}
      </div>

      {/* Mode + Filters */}
      <div className="chat-controls">
        <div className="chat-mode-toggle">
          <button className={`chat-mode-btn ${mode === 'basic' ? 'active' : ''}`} onClick={() => setMode('basic')}>Basic</button>
          <button className={`chat-mode-btn ${mode === 'advanced' ? 'active' : ''}`} onClick={() => setMode('advanced')}>Advanced</button>
        </div>
        <div className="chat-type-filters">
          {TYPE_FILTERS.map(f => (
            <button key={f} className={`reg-filter-pill ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--reg-primary)" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h2 className="chat-welcome-title">PRISM Regulatory Assistant</h2>
            <p className="chat-welcome-desc">Search across 39,000+ SEBI documents. Ask about regulations, compliance requirements, enforcement actions, and more.</p>
            <div className="chat-suggestions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} className="chat-suggestion-btn" onClick={() => sendMessage(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-message-avatar">
              {msg.role === 'user' ? 'U' : 'P'}
            </div>
            <div className="chat-message-content">
              <div className="chat-message-text">
                {msg.content.split('\n').map((line, j) => {
                  // Bold rendering
                  const parts = line.split(/\*\*(.*?)\*\*/g);
                  return (
                    <div key={j} style={{ marginBottom: line ? 4 : 8, minHeight: line ? undefined : 4 }}>
                      {parts.map((part, k) =>
                        k % 2 === 1 ? <strong key={k}>{part}</strong> : <span key={k}>{part}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="chat-sources">
                  <div className="chat-sources-label">Sources:</div>
                  {msg.sources.map((s, j) => (
                    <a key={j} href={`/regulatory/content/${s.id}`} className="chat-source-link" target="_blank">
                      <span className={`reg-type-badge ${s.type}`} style={{ fontSize: 9 }}>{s.type.replace(/_/g, ' ')}</span>
                      {s.title.slice(0, 60)}{s.title.length > 60 ? '...' : ''}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="chat-message-avatar">P</div>
            <div className="chat-message-content">
              <div className="chat-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Ask about SEBI regulations, circulars, or compliance..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button className="chat-send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Send
        </button>
      </div>
      <div className="chat-footer-hint">Press Enter to send, Shift+Enter for new line</div>
    </div>
  );
}
