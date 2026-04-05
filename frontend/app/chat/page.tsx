'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import type { Citation, Company, Conversation, ToolCallData, PresentationStatus } from '@/lib/api';
import './chat.css';

interface ChatMsg {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used?: string;
  isStreaming?: boolean;
  agentStatus?: string;
  citations?: Citation[];
  feedback?: 'up' | 'down' | null;
  vizData?: {
    chartData: any;
    chartType: string;
    topic: string;
    vizMessage?: string;
    analysisData?: any;
    playgroundUrl?: string;
  };
  suggestions?: any[];
  followUpQuestions?: string[];
}

interface CanvasArtifact {
  id: string;
  title: string;
  content: string;
  type: 'code' | 'markdown' | 'table';
}

// ── Icons ──
const PlusIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const MicIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>;
const SendIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>;
const StopIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>;
const MenuIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const CopyIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>;
const RefreshIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>;
const DownloadIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>;
const PinIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76z"></path></svg>;
const FolderIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>;
const SlidesIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>;
const ChartBarIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>;

// ── Plotly Chart Component ──
const PlotlyChart = ({ chartData }: { chartData: any }) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || !chartData) return;
    const Plotly = (window as any).Plotly;
    if (!Plotly) {
      console.warn('[PlotlyChart] Plotly.js not loaded yet');
      return;
    }

    // Extract data and layout from the Plotly figure JSON
    const plotData = chartData.data || chartData;
    const plotLayout = {
      ...(chartData.layout || {}),
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#e0e0e0', family: 'Inter, system-ui, sans-serif' },
      margin: { l: 50, r: 30, t: 40, b: 50 },
      autosize: true,
      xaxis: { ...(chartData.layout?.xaxis || {}), gridcolor: 'rgba(255,255,255,0.08)', zerolinecolor: 'rgba(255,255,255,0.12)' },
      yaxis: { ...(chartData.layout?.yaxis || {}), gridcolor: 'rgba(255,255,255,0.08)', zerolinecolor: 'rgba(255,255,255,0.12)' },
    };
    const config = { responsive: true, displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };

    Plotly.newPlot(chartRef.current, plotData, plotLayout, config);

    // Cleanup on unmount
    return () => {
      if (chartRef.current) Plotly.purge(chartRef.current);
    };
  }, [chartData]);

  return <div id="viz-plotly-chart" ref={chartRef} className="viz-chart-container" />;
};

// PRISM-specific suggestion cards
const SUGGESTION_CARDS = [
  { icon: '📊', title: 'Revenue Analysis', prompt: 'What is the revenue of ICICI Bank for FY 2025?' },
  { icon: '⚠️', title: 'Risk Assessment', prompt: 'What are the key risks for Adani Enterprises?' },
  { icon: '⚖️', title: 'Peer Comparison', prompt: 'Compare the revenue of Mahindra and Infosys.' },
  { icon: '💬', title: 'Management Outlook', prompt: 'What did the Infosys management say about AI strategy?' },
];

// Slash Commands
const SLASH_COMMANDS = [
  { id: 'analyze', icon: '⚡', name: 'Analyze Filing', desc: 'Deep dive into annual report data' },
  { id: 'compare', icon: '⚖️', name: 'Compare Companies', desc: 'Generate comparative financial teardown' },
  { id: 'chart', icon: '📊', name: 'Create Chart', desc: 'Visualize data with interactive charts' },
  { id: 'canvas', icon: '📌', name: 'Send to Canvas', desc: 'Push response to artifacts pane' },
];

// ── Utility Functions ──
const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'xlsx' || ext === 'xls') return '📊';
  if (ext === 'csv') return '📋';
  return '📎';
};

const groupConversationsByDate = (convs: Conversation[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Older', items: [] },
  ];

  convs.forEach(conv => {
    const d = new Date(conv.updated_at);
    if (d >= today) groups[0].items.push(conv);
    else if (d >= yesterday) groups[1].items.push(conv);
    else if (d >= sevenDaysAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  });

  return groups.filter(g => g.items.length > 0);
};

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // UI States
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Context & Commands
  const [activeContext, setActiveContext] = useState<string | null>(null);
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [contextInput, setContextInput] = useState('');
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-modal States
  const [attachments, setAttachments] = useState<{ id: string; filename: string; file: File }[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Canvas State (Multi-Tab)
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [canvasArtifacts, setCanvasArtifacts] = useState<CanvasArtifact[]>([]);
  const [activeCanvasTabId, setActiveCanvasTabId] = useState<string | null>(null);

  // Agent Panel State
  const [agentPanel, setAgentPanel] = useState<{
    type: 'presentation' | 'visualizer' | null;
    status: 'generating' | 'ready' | 'error';
    taskId?: string;
    presentationId?: string;
    editUrl?: string;
    downloadUrl?: string;
    topic?: string;
    error?: string;
    progress?: string;
    // Visualizer fields
    chartData?: any;
    chartType?: string;
    vizMessage?: string;
    analysisData?: any;
    playgroundUrl?: string;
  } | null>(null);
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);

  // Companies from DB
  const [companies, setCompanies] = useState<Company[]>([]);

  // Conversation edit
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Focus Mode
  const [focusMode, setFocusMode] = useState(false);

  // Hover states
  const [hoveredMsgIdx, setHoveredMsgIdx] = useState<number | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);

  // Web Search State
  const [useWebSearch, setUseWebSearch] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load initial
  useEffect(() => {
    loadConversations();
    loadCompanies();
    document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
    
    // Auto-load previously active conversation to preserve localStorage session history
    const savedActiveId = localStorage.getItem('prism_active_conv');
    if (savedActiveId) {
      selectConversation(savedActiveId);
    }
  }, [theme]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  // Keyboard shortcut: Ctrl+K for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchQuery('');
        setShowModelMenu(false);
        setShowProfileMenu(false);
        setShowContextSelector(false);
        setSlashMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const loadCompanies = async () => {
    try {
      const list = await api.listCompanies();
      setCompanies(list);
    } catch (err) {
      console.error('Failed to load companies', err);
    }
  };

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  const createNewChat = async () => {
    const conv = await api.createConversation({ title: 'New chat' });
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
    setMessages([]);
    setAttachments([]);
    setCanvasArtifacts([]);
    setIsCanvasOpen(false);
    localStorage.setItem('prism_active_conv', conv.id);
  };

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    localStorage.setItem('prism_active_conv', convId);
    try {
      const detail = await api.getConversation(convId);
      setMessages((detail.messages || []).map(m => ({ ...m })));
      setCanvasArtifacts([]);
      setIsCanvasOpen(false);
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.deleteConversation(convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const startRenaming = (convId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(convId);
    setEditingTitle(currentTitle);
  };

  const saveRename = async (convId: string) => {
    if (!editingTitle.trim()) return;
    await api.updateConversation(convId, { title: editingTitle.trim() });
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: editingTitle.trim() } : c));
    setEditingConvId(null);
  };

  // ── File Handlers ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    const newAttachments = files.map(f => ({
      id: Math.random().toString(36).substring(7),
      filename: f.name,
      file: f
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget.contains(e.relatedTarget as Node)) return; setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (!e.dataTransfer.files?.length) return;
    const files = Array.from(e.dataTransfer.files);
    setAttachments(prev => [...prev, ...files.map(f => ({ id: Math.random().toString(36).substring(7), filename: f.name, file: f }))]);
  };

  const removeAttachment = (id: string) => { setAttachments(prev => prev.filter(a => a.id !== id)); };

  // ── Send Message ──
  const sendMessage = async (overrideMessage?: string) => {
    const userMessage = (overrideMessage || input).trim();
    if (!userMessage || isStreaming) return;

    const isCanvasCommand = userMessage.startsWith('/canvas ');
    const strippedMessage = isCanvasCommand ? userMessage.replace('/canvas ', '') : userMessage;

    setInput('');
    setAttachments([]);
    setSlashMenuOpen(false);

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    let convId = activeConvId;
    if (!convId) {
      const conv = await api.createConversation({ title: userMessage.slice(0, 50) });
      convId = conv.id;
      setActiveConvId(conv.id);
      setConversations(prev => [conv, ...prev]);
    } else if (messages.length === 0) {
      // Auto-rename 'New chat' based on the first real message sent
      const newTitle = userMessage.slice(0, 50);
      api.updateConversation(convId, { title: newTitle }).catch(console.error);
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: newTitle } : c));
    }

    setIsStreaming(true);
    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: '', 
      isStreaming: true,
      agentStatus: 'Analyzing query & searching knowledge base...' 
    }]);

    let completeResponse = '';
    let receivedCitations: Citation[] = [];

    // Pass useWebSearch as the last argument
    abortRef.current = api.streamChatMessage(
      convId!, 
      strippedMessage, 
      [], 
      activeContext || undefined, 
      'default', 
      {
        onToken: (token) => {
          completeResponse += token;
          setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + token };
          }
          return updated;
        });
      },
      onSources: (citations) => {
        receivedCitations = citations;
      },
      onStatus: (status) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            updated[updated.length - 1] = { ...lastMsg, agentStatus: status };
          }
          return updated;
        });
      },
      onToolCall: (toolData) => {
        if (toolData.tool === 'visualizer') {
          // ── Data Visualizer Tool (two-phase: generating → ready) ──
          const status = (toolData as any).status;

          if (status === 'generating') {
            // Phase 1: Open panel in generating state
            setIsStreaming(false);
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && !updated[updated.length - 1].content) {
                updated.pop();
              }
              updated.push({
                role: 'assistant',
                content: `📊 **Creating visualization${toolData.topic ? `: "${toolData.topic}"` : ''}...**\n\n_PRISM Agent is generating your chart. Watch the progress in the panel._`,
                model_used: 'PRISM Agent',
                isStreaming: true,
              });
              return updated;
            });
            setAgentPanel({
              type: 'visualizer',
              status: 'generating',
              topic: toolData.topic || 'Data Visualization',
              progress: 'Analyzing chart request...',
            });
            setIsAgentPanelOpen(true);
            setIsCanvasOpen(false);
          } else if (status === 'ready') {
            // Phase 2: Chart is ready — update panel and message
            const chartType = toolData.chart_type || toolData.chart_type_hint || 'chart';
            const hasChart = toolData.chart && toolData.viz_intent === 'chart';
            const vizDataPayload = hasChart ? {
              chartData: toolData.chart,
              chartType: chartType,
              topic: toolData.topic || 'Data Visualization',
              vizMessage: toolData.viz_message,
              analysisData: toolData.analysis,
              playgroundUrl: toolData.playground_url,
            } : undefined;

            setMessages(prev => {
              const updated = [...prev];
              // Replace the "generating" message with the final one
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && updated[updated.length - 1].isStreaming) {
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: hasChart
                    ? `📊 **${chartType.charAt(0).toUpperCase() + chartType.slice(1)} chart created${toolData.topic ? `: "${toolData.topic}"` : ''}**\n\n${toolData.viz_message || '_Chart is ready in the panel on the right._'}`
                    : `📊 ${toolData.viz_message || 'Data analysis complete. Check the panel for details.'}`,
                  model_used: 'PRISM Agent',
                  vizData: vizDataPayload,
                };
              }
              api.saveMessages(convId!, updated.filter(m => !m.isStreaming));
              return updated;
            });

            if (hasChart) {
              setAgentPanel({
                type: 'visualizer',
                status: 'ready',
                topic: toolData.topic || 'Data Visualization',
                chartData: toolData.chart,
                chartType: chartType,
                vizMessage: toolData.viz_message,
                analysisData: toolData.analysis,
                playgroundUrl: toolData.playground_url,
              });
            }
          } else if (status === 'error') {
            // Error/clarification — show as regular message
            setIsStreaming(false);
            const errorMsg = (toolData as any).error || 'Visualization failed.';
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && (!updated[updated.length - 1].content || updated[updated.length - 1].isStreaming)) {
                updated.pop();
              }
              updated.push({
                role: 'assistant',
                content: errorMsg,
                model_used: 'PRISM Agent',
              });
              api.saveMessages(convId!, updated.filter(m => !m.isStreaming));
              return updated;
            });
            setAgentPanel(null);
            setIsAgentPanelOpen(false);
          }
        } else {
          // ── Presentation Tool (existing) ──
          setIsStreaming(false);
          setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && !updated[updated.length - 1].content) {
              updated.pop();
            }
            updated.push({
              role: 'assistant',
              content: `🔧 **Creating presentation${toolData.topic ? `: "${toolData.topic}"` : ' from this conversation'}...**\n\n_PRISM Agent is generating ${toolData.n_slides} slides. The presentation editor will open in the panel._`,
              model_used: 'PRISM Agent',
            });
            api.saveMessages(convId!, updated.filter(m => !m.isStreaming));
            return updated;
          });
          handlePresentationGeneration(toolData, convId!);
        }
      },
      onVizStatus: (step) => {
        // Update the visualizer panel progress step
        setAgentPanel(prev => {
          if (prev && prev.type === 'visualizer' && prev.status === 'generating') {
            return { ...prev, progress: step };
          }
          return prev;
        });
      },
      onClarification: (data) => {
        setIsStreaming(false);
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            updated[updated.length - 1] = {
              ...lastMsg,
              isStreaming: false,
              content: data.message,
              suggestions: data.suggestions,
              followUpQuestions: data.follow_up_questions,
            };
          }
          api.saveMessages(convId!, updated.filter(m => !m.isStreaming));
          return updated;
        });
      },
      onDone: (data) => {
        setIsStreaming(false);
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            updated[updated.length - 1] = {
              ...lastMsg,
              isStreaming: false,
              model_used: data.model_used,
              citations: receivedCitations,
            };
          }
          // Save to localStorage
          api.saveMessages(convId!, updated.filter(m => !m.isStreaming));
          return updated;
        });

        if (isCanvasCommand) {
          pinToCanvas(completeResponse, `Artifact ${canvasArtifacts.length + 1}`);
        }
        loadConversations();
      },
      onError: (error) => {
        setIsStreaming(false);
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            updated[updated.length - 1] = { ...lastMsg, isStreaming: false, content: lastMsg.content || `⚠️ Error: ${error}` };
          }
          return updated;
        });
      }
    }, useWebSearch);
  };

  const copyMessage = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgIdx(idx);
    setTimeout(() => setCopiedMsgIdx(null), 2000);
  };

  const regenerateMessage = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      setMessages(prev => prev.slice(0, -1));
      sendMessage(lastUserMsg.content);
    }
  };

  const pinToCanvas = (content: string, requestedTitle?: string) => {
    const newId = Math.random().toString(36).substring(7);
    const newTitle = requestedTitle || `Insight ${canvasArtifacts.length + 1}`;
    const isTable = content.includes('|---|');
    const isCodeBlock = content.includes('```');
    const type = isTable ? 'table' : (isCodeBlock ? 'code' : 'markdown');
    setCanvasArtifacts(prev => [...prev, { id: newId, title: newTitle, content, type }]);
    setActiveCanvasTabId(newId);
    setIsCanvasOpen(true);
  };

  const openCitation = (citation: Citation) => {
    if (citation.url && citation.url.startsWith('http')) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    pinToCanvas(citation.preview, `Source: ${citation.nse_code} (P${citation.page})`);
  };

  const closeCanvasTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCanvasArtifacts(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (filtered.length === 0) setIsCanvasOpen(false);
      if (activeCanvasTabId === id && filtered.length > 0) setActiveCanvasTabId(filtered[0].id);
      return filtered;
    });
  };

  // ── Presentation Generation Handler ──
  const handlePresentationGeneration = async (toolData: ToolCallData, convId: string) => {
    const progressSteps = [
      'Analyzing topic...',
      'Generating outlines...',
      'Creating slide content...',
      'Fetching images & icons...',
      'Finalizing presentation...'
    ];

    setAgentPanel({
      type: 'presentation',
      status: 'generating',
      topic: toolData.topic || 'Conversation Summary',
      progress: progressSteps[0],
    });
    setIsAgentPanelOpen(true);
    setIsCanvasOpen(false);

    try {
      // Build params
      const params: any = {
        n_slides: toolData.n_slides,
      };

      if (toolData.use_chat_context || !toolData.topic) {
        // Send entire chat history
        params.chat_messages = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content }));
        if (toolData.topic) {
          params.topic = toolData.topic;
        }
      } else {
        params.topic = toolData.topic;
      }

      // Start generation
      const result = await api.generatePresentation(params);
      const taskId = result.task_id;

      setAgentPanel(prev => prev ? { ...prev, taskId } : null);

      // Start polling
      let stepIndex = 0;
      pollingRef.current = setInterval(async () => {
        try {
          const status = await api.pollPresentationStatus(taskId);

          // Cycle through progress steps for visual feedback
          stepIndex = Math.min(stepIndex + 1, progressSteps.length - 1);
          setAgentPanel(prev => prev ? { ...prev, progress: progressSteps[stepIndex] } : null);

          if (status.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setAgentPanel({
              type: 'presentation',
              status: 'ready',
              taskId,
              presentationId: status.presentation_id,
              editUrl: status.edit_url,
              downloadUrl: status.download_url,
              topic: toolData.topic || 'Conversation Summary',
            });
            // Update the tool-call message
            setMessages(prev => {
              const updated = [...prev];
              const toolMsg = updated.findIndex(m => m.content.startsWith('🔧'));
              if (toolMsg >= 0) {
                updated[toolMsg] = {
                  ...updated[toolMsg],
                  content: `✅ **Presentation created: "${toolData.topic || 'Conversation Summary'}"**\n\n_${toolData.n_slides} slides generated. Open the panel on the right to view and edit._`,
                };
              }
              api.saveMessages(convId, updated.filter(m => !m.isStreaming));
              return updated;
            });
          } else if (status.status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setAgentPanel({
              type: 'presentation',
              status: 'error',
              error: status.error || 'Generation failed',
              topic: toolData.topic || 'Conversation Summary',
            });
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 3000);
    } catch (err: any) {
      setAgentPanel({
        type: 'presentation',
        status: 'error',
        error: err.message || 'Failed to start generation',
        topic: toolData.topic || 'Conversation Summary',
      });
    }
  };

  const handleManualPresentation = (content: string) => {
    const toolData: ToolCallData = {
      tool: 'presentation',
      topic: content.slice(0, 200),
      use_chat_context: false,
      n_slides: 6,
    };
    handlePresentationGeneration(toolData, activeConvId || '');
  };

  const closeAgentPanel = () => {
    setIsAgentPanelOpen(false);
  };

  const exportChat = () => {
    const md = messages.map(m => `### ${m.role === 'user' ? '👤 User' : '▲ PRISM'}\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `prism-chat-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  // Input & Command Logic
  const handleInputTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    if (val === '/' || val.endsWith('\n/')) { setSlashMenuOpen(true); setSlashIndex(0); }
    else if (slashMenuOpen && !val.includes('/')) { setSlashMenuOpen(false); }
  };

  const handleKeyDownInput = (e: React.KeyboardEvent) => {
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(prev => (prev + 1) % SLASH_COMMANDS.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(prev => (prev === 0 ? SLASH_COMMANDS.length - 1 : prev - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); insertCommand(SLASH_COMMANDS[slashIndex].id); }
      else if (e.key === 'Escape') { setSlashMenuOpen(false); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const insertCommand = (cmdId: string) => {
    const lastSlashIdx = input.lastIndexOf('/');
    const prefix = input.substring(0, lastSlashIdx);
    setInput(prefix + `/${cmdId} `);
    setSlashMenuOpen(false);
    inputRef.current?.focus();
  };

  const setGlobalContext = (ticker: string) => {
    setActiveContext(ticker || null);
    setShowContextSelector(false);
    setContextInput('');
  };

  // ── Computed Values ──
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const filteredConversations = searchQuery
    ? conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  const groupedConversations = groupConversationsByDate(filteredConversations);
  const filteredCompanies = contextInput
    ? companies.filter(c => c.nse_code.toLowerCase().includes(contextInput.toLowerCase()) || c.company_name.toLowerCase().includes(contextInput.toLowerCase()))
    : companies.slice(0, 6);

  return (
    <div
      className={`chat-layout ${theme === 'dark' ? 'theme-dark' : 'theme-light'} ${focusMode ? 'focus-mode' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => { setSlashMenuOpen(false); setShowContextSelector(false); setShowModelMenu(false); setShowProfileMenu(false); }}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <div className="drag-icon">📄</div>
            <h2>Drop files to attach to PRISM</h2>
            <p>PDFs, Excel, CSVs, Images, and Documents</p>
          </div>
        </div>
      )}

      {/* ── Left Sidebar ── */}
      <div className={`chat-sidebar ${!isSidebarOpen ? 'closed' : ''}`}>
        <div className="sidebar-content">
          <button className="new-chat-btn" onClick={createNewChat}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', background: 'var(--text-primary)', color: 'var(--bg-main)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"></path></svg>
              </div>
              New chat
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(false); }}>
              <title>Close Sidebar</title>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>

          <button className="new-chat-btn" onClick={() => window.open('http://34.47.137.44:5000/dashboard', '_blank')} style={{ marginTop: '8px', background: 'var(--accent-blue)', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              </div>
              Create Presentation
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>

          <button className="new-chat-btn" onClick={() => window.open('http://34.47.137.44:8080/api/playground', '_blank')} style={{ marginTop: '8px', background: '#10b981', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path></svg>
              </div>
              Data Visualizer
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>

          {/* Search Bar */}
          <div className="sidebar-search">
            <SearchIcon />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button className="search-clear" onClick={() => setSearchQuery('')}>✕</button>}
          </div>

          {/* Conversation List */}
          <div className="conversation-list">
            {groupedConversations.map((group) => (
              <div key={group.label} className="history-group">
                <div className="history-label">{group.label}</div>
                {group.items.map(conv => (
                  <div key={conv.id} className={`conversation-item ${activeConvId === conv.id ? 'active' : ''}`} onClick={() => selectConversation(conv.id)}>
                    {editingConvId === conv.id ? (
                      <input
                        className="rename-input"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => saveRename(conv.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRename(conv.id); if (e.key === 'Escape') setEditingConvId(null); }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span className="conv-title">{conv.title}</span>
                        <div className="conv-actions">
                          <button onClick={(e) => startRenaming(conv.id, conv.title, e)} title="Rename">✏️</button>
                          <button onClick={(e) => deleteConversation(conv.id, e)} title="Delete"><TrashIcon /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Profile Section */}
          <div style={{ position: 'relative', marginTop: 'auto' }}>
            <div className="sidebar-profile" onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); }}>
              <div className="profile-avatar">▲</div>
              <div className="profile-name">PRISM Analyst</div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
            </div>
            {showProfileMenu && (
              <div className="profile-popover" onClick={e => e.stopPropagation()}>
                <div className="popover-item" onClick={() => { toggleTheme(); setShowProfileMenu(false); }}>
                  {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
                </div>
                <div className="popover-item" onClick={() => { setFocusMode(!focusMode); setShowProfileMenu(false); }}>
                  {focusMode ? '🔓 Exit Focus Mode' : '🎯 Focus Mode'}
                </div>
                <div className="popover-item" style={{ borderTop: '1px solid var(--border-color)', marginTop: '4px', paddingTop: '8px' }}>⚙️ Settings</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <main className="chat-main">
        {/* Top Header */}
        <div className="chat-top-bar">
          {!isSidebarOpen && (
            <button className="input-tool-btn" onClick={() => setIsSidebarOpen(true)} title="Open Sidebar">
              <MenuIcon />
            </button>
          )}

          {/* Model Indicator */}
          <div style={{ position: 'relative' }}>
            <button className="model-selector" onClick={(e) => { e.stopPropagation(); setShowModelMenu(!showModelMenu); setShowContextSelector(false); }}>
              <span className="model-dot" style={{ background: '#10b981' }}></span>
              PRISM RAG
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            {showModelMenu && (
              <div className="popover-menu" onClick={(e) => e.stopPropagation()}>
                <div className="popover-item" style={{ opacity: 0.5, cursor: 'default' }}>
                  <span className="model-dot" style={{ background: '#3b82f6' }}></span>Gemini 2.0 Flash
                </div>
                <div className="popover-item" style={{ opacity: 0.5, cursor: 'default' }}>
                  <span className="model-dot" style={{ background: '#f59e0b' }}></span>OpenRouter (Gemma 27B)
                </div>
                <div className="popover-item" style={{ opacity: 0.5, cursor: 'default' }}>
                  <span className="model-dot" style={{ background: '#10b981' }}></span>Ollama (Local)
                </div>
                <div style={{ padding: '8px 14px', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
                  Auto-selects the best available model
                </div>
              </div>
            )}
          </div>

          <div style={{ width: '8px' }} />

          {/* Global Context Selector */}
          <div style={{ position: 'relative' }}>
            <button className="context-selector-btn" onClick={(e) => { e.stopPropagation(); setShowContextSelector(!showContextSelector); setShowModelMenu(false); }}>
              <FolderIcon />
              {activeContext ? `Context: ${activeContext}` : 'All Companies'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            {showContextSelector && (
              <div className="popover-menu context-popover" onClick={e => e.stopPropagation()}>
                <div className="context-searchRow">
                  <SearchIcon />
                  <input
                    autoFocus
                    placeholder="Search companies..."
                    value={contextInput}
                    onChange={(e) => setContextInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && contextInput) setGlobalContext(contextInput.toUpperCase()); }}
                  />
                </div>
                <div className="context-quickList">
                  {filteredCompanies.map(c => (
                    <div key={c.nse_code} className="popover-item" onClick={() => setGlobalContext(c.nse_code)}>
                      🏢 {c.nse_code} ({c.company_name})
                    </div>
                  ))}
                  {activeContext && (
                    <div className="popover-item" style={{ borderTop: '1px solid var(--border-color)', color: 'var(--accent-red)' }} onClick={() => setGlobalContext('')}>
                      ✕ Clear Context (All Companies)
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}></div>

          {/* Top bar right actions */}
          <div className="topbar-actions">
            <button className="topbar-btn" onClick={exportChat} title="Export chat as Markdown">
              <DownloadIcon />
            </button>
            <button className={`topbar-btn ${isCanvasOpen ? 'active' : ''}`} onClick={() => setIsCanvasOpen(!isCanvasOpen)} title={isCanvasOpen ? 'Close Canvas' : 'Open Canvas'}>
              <PinIcon />
            </button>
            {agentPanel && (
              <button className={`topbar-btn ${isAgentPanelOpen ? 'active' : ''}`} onClick={() => setIsAgentPanelOpen(!isAgentPanelOpen)} title="Toggle Agent Panel" style={{ color: '#10b981' }}>
                <SlidesIcon />
              </button>
            )}
          </div>
        </div>

        {/* Message Thread + Canvas Split */}
        <div className="chat-content-split">
          <div className="chat-messages">
            <div className="messages-center">
              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <div className="welcome-logo">▲</div>
                  <h1>{activeContext ? `${activeContext} Intelligence` : 'PRISM Financial Analyst'}</h1>
                  <p className="welcome-subtitle">AI-powered financial research agent. Ask any question about annual reports, risk factors, revenue, management commentary, and more.</p>

                  <div className="suggestion-grid">
                    {SUGGESTION_CARDS.map((card, i) => (
                      <button key={i} className="suggestion-card" onClick={() => { setInput(card.prompt); setTimeout(() => sendMessage(card.prompt), 50); }}>
                        <span className="suggestion-icon">{card.icon}</span>
                        <span className="suggestion-title">{card.title}</span>
                        <span className="suggestion-prompt">{card.prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`message-row ${msg.role}`}
                    onMouseEnter={() => setHoveredMsgIdx(idx)}
                    onMouseLeave={() => setHoveredMsgIdx(null)}
                  >
                    <div className="message-bubble">
                      {msg.role === 'assistant' && <div className="assistant-avatar">▲</div>}
                      <div className="message-content">
                        <div className="markdown-prose">
                          {msg.content ? (
                            <>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                              
                              {msg.suggestions && msg.suggestions.length > 0 && (
                                <div className="clarification-suggestions">
                                  <div className="suggestions-label">Suggestions:</div>
                                  <ul className="suggestions-list">
                                    {msg.suggestions.map((s, sIdx) => {
                                      const label = typeof s === 'string' ? s : (s.label || s.company_name || 'Unknown Company');
                                      return <li key={sIdx}>{label}</li>;
                                    })}
                                  </ul>
                                </div>
                              )}

                              {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                                <div className="follow-up-questions">
                                  {msg.followUpQuestions.map((q, qIdx) => {
                                    const qText = typeof q === 'string' ? q : (q as any).text;
                                    return (
                                      <button 
                                        key={qIdx}
                                        className="follow-up-tag"
                                        onClick={() => { setInput(qText); setTimeout(() => sendMessage(qText), 50); }}
                                      >
                                        {qText}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            msg.isStreaming ? (
                              msg.agentStatus && (
                                <div className="agent-status-indicator">
                                  <div className="status-loader">
                                    <div className="status-orb"></div>
                                    <div className="status-orb"></div>
                                    <div className="status-orb"></div>
                                  </div>
                                  <span className="status-text">{msg.agentStatus}</span>
                                </div>
                              )
                            ) : (
                              msg.role === 'assistant' && <span className="status-text" style={{ color: 'var(--accent-red)' }}>⚠️ Generation aborted or failed.</span>
                            )
                          )}
                        </div>
                        {msg.isStreaming && msg.content && <span className="streaming-cursor" />}

                        {/* Citations */}
                        {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && !msg.isStreaming && (
                          <div style={{ marginTop: '12px', padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Sources referenced:</div>
                             {msg.citations.map((c, ci) => (
                               <div 
                                 key={ci} 
                                 className="citation-item"
                                 onClick={() => openCitation(c)}
                               >
                                 <span className="citation-badge">{ci + 1}</span>
                                 <span className="citation-text">
                                   {c.nse_code} — Page {c.page} - {c.chunk_type === 'table' ? '📊' : '📄'} {c.chunk_type}
                                 </span>
                               </div>
                             ))}
                          </div>
                        )}

                        {/* Model badge */}
                        {msg.role === 'assistant' && msg.model_used && !msg.isStreaming && (
                          <div className="model-badge">{msg.model_used} • {activeContext || 'Global'} Context</div>
                        )}
                      </div>

                      {/* Message Actions */}
                      {msg.role === 'assistant' && !msg.isStreaming && hoveredMsgIdx === idx && (
                        <div className="message-actions">
                          <button onClick={() => copyMessage(msg.content, idx)} title="Copy">
                            {copiedMsgIdx === idx ? '✓' : <CopyIcon />}
                          </button>
                          <button onClick={regenerateMessage} title="Regenerate"><RefreshIcon /></button>
                          <button onClick={() => pinToCanvas(msg.content)} title="Pin to Canvas"><PinIcon /></button>
                          <button onClick={() => handleManualPresentation(msg.content)} title="Create Presentation"><SlidesIcon /></button>
                          {msg.vizData && (
                            <button onClick={() => {
                              setAgentPanel({
                                type: 'visualizer',
                                status: 'ready',
                                topic: msg.vizData!.topic,
                                chartData: msg.vizData!.chartData,
                                chartType: msg.vizData!.chartType,
                                vizMessage: msg.vizData!.vizMessage,
                                analysisData: msg.vizData!.analysisData,
                                playgroundUrl: msg.vizData!.playgroundUrl,
                              });
                              setIsAgentPanelOpen(true);
                              setIsCanvasOpen(false);
                            }} title="View Chart" className="viz-view-btn">
                              <ChartBarIcon /> View Chart
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} style={{ height: '40px' }} />
            </div>
          </div>

          {/* Multi-Tab Canvas Pane / Agent Panel */}
          {(isCanvasOpen || (agentPanel && isAgentPanelOpen)) && (
            <div className="canvas-pane agent-panel">
              <div className="canvas-headerTabs">
                <div className="canvas-tabs-scroll">
                  {/* Agent Panel Tab */}
                  {agentPanel && (
                    <div className={`canvas-tab ${!isCanvasOpen || agentPanel ? 'active' : ''}`} onClick={() => { setIsCanvasOpen(false); }}>
                      <span className="tab-icon">{agentPanel.type === 'visualizer' ? '📊' : '🔧'}</span>
                      {agentPanel.type === 'presentation' ? 'Presentation' : agentPanel.type === 'visualizer' ? 'Visualizer' : 'Tool'}
                      {agentPanel.status === 'generating' && <span className="agent-pulse"></span>}
                    </div>
                  )}
                  {/* Canvas Tabs */}
                  {canvasArtifacts.map(art => (
                    <div key={art.id} className={`canvas-tab ${!agentPanel && activeCanvasTabId === art.id ? 'active' : ''}`} onClick={() => { setActiveCanvasTabId(art.id); setIsCanvasOpen(true); }}>
                      <span className="tab-icon">{art.type === 'code' ? '</>' : art.type === 'table' ? '📊' : '📝'}</span>
                      {art.title}
                      <button className="tab-close" onClick={(e) => closeCanvasTab(art.id, e)}>✕</button>
                    </div>
                  ))}
                  {!agentPanel && canvasArtifacts.length === 0 && <div className="canvas-tab active">Analyzer</div>}
                </div>
                <button className="input-tool-btn" onClick={() => { setIsCanvasOpen(false); closeAgentPanel(); }} style={{ width: '28px', height: '28px', flexShrink: 0 }}>✕</button>
              </div>
              <div className="canvas-body">
                {/* Agent Panel Content */}
                {agentPanel ? (
                  <div className="agent-panel-content">
                    {agentPanel.status === 'generating' && agentPanel.type === 'presentation' && (
                      <div className="agent-progress">
                        <div className="agent-progress-icon">
                          <SlidesIcon />
                        </div>
                        <h3>Creating Presentation</h3>
                        <p className="agent-topic">"{agentPanel.topic}"</p>
                        <div className="agent-steps">
                          {['Analyzing topic', 'Generating outlines', 'Creating slides', 'Fetching images', 'Finalizing'].map((step, i) => {
                            const currentIdx = ['Analyzing topic...', 'Generating outlines...', 'Creating slide content...', 'Fetching images & icons...', 'Finalizing presentation...'].indexOf(agentPanel.progress || '');
                            const isComplete = i < currentIdx;
                            const isCurrent = i === currentIdx;
                            return (
                              <div key={step} className={`agent-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}>
                                <span className="step-indicator">{isComplete ? '✓' : isCurrent ? '⟳' : '○'}</span>
                                {step}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {agentPanel.status === 'generating' && agentPanel.type === 'visualizer' && (
                      <div className="agent-progress">
                        <div className="agent-progress-icon viz-progress-icon">
                          <ChartBarIcon />
                        </div>
                        <h3>Creating Visualization</h3>
                        <p className="agent-topic">"{agentPanel.topic}"</p>
                        <div className="agent-steps">
                          {['Analyzing chart request', 'Searching for datasets', 'Matching data columns', 'Generating chart', 'Rendering visualization'].map((step, i) => {
                            const stepMap = [
                              'Analyzing chart request...',
                              'Searching for matching datasets...',
                              'Datasets matched successfully',
                              'Generating chart from data...',
                              'Rendering visualization...',
                            ];
                            const currentIdx = stepMap.indexOf(agentPanel.progress || '');
                            const isComplete = i < currentIdx;
                            const isCurrent = i === currentIdx;
                            return (
                              <div key={step} className={`agent-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}>
                                <span className="step-indicator">{isComplete ? '✓' : isCurrent ? '⟳' : '○'}</span>
                                {step}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {agentPanel.status === 'ready' && agentPanel.editUrl && (
                      <div className="agent-iframe-container">
                        <div className="agent-iframe-toolbar">
                          <span className="agent-toolbar-title">📊 {agentPanel.topic}</span>
                          <div className="agent-toolbar-actions">
                            {agentPanel.downloadUrl && (
                              <a href={agentPanel.downloadUrl} target="_blank" rel="noopener noreferrer" className="agent-toolbar-btn">
                                <DownloadIcon /> PPTX
                              </a>
                            )}
                            <a href={agentPanel.editUrl} target="_blank" rel="noopener noreferrer" className="agent-toolbar-btn">
                              ↗ Open Full Editor
                            </a>
                          </div>
                        </div>
                        <iframe
                          src={agentPanel.editUrl}
                          className="agent-iframe"
                          title="Presenton Editor"
                          allow="clipboard-write"
                        />
                      </div>
                    )}
                    {/* ── Data Visualizer Panel ── */}
                    {agentPanel.status === 'ready' && agentPanel.type === 'visualizer' && agentPanel.chartData && (
                      <div className="viz-panel-container">
                        <div className="agent-iframe-toolbar">
                          <span className="agent-toolbar-title">📊 {agentPanel.chartType?.charAt(0).toUpperCase()}{agentPanel.chartType?.slice(1)} Chart — {agentPanel.topic}</span>
                          <div className="agent-toolbar-actions">
                            <button className="agent-toolbar-btn" onClick={() => {
                              const chartEl = document.getElementById('viz-plotly-chart');
                              if (chartEl && (window as any).Plotly) {
                                (window as any).Plotly.downloadImage(chartEl, { format: 'png', width: 1200, height: 800, filename: agentPanel.topic || 'chart' });
                              }
                            }}>
                              <DownloadIcon /> PNG
                            </button>
                            {agentPanel.playgroundUrl && (
                              <a href={agentPanel.playgroundUrl} target="_blank" rel="noopener noreferrer" className="agent-toolbar-btn">
                                ↗ Open Playground
                              </a>
                            )}
                          </div>
                        </div>
                        <PlotlyChart chartData={agentPanel.chartData} />
                        {agentPanel.vizMessage && (
                          <div className="viz-explanation">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{agentPanel.vizMessage}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    )}
                    {agentPanel.status === 'error' && (
                      <div className="agent-error">
                        <div className="agent-error-icon">⚠️</div>
                        <h3>Generation Failed</h3>
                        <p>{agentPanel.error}</p>
                        <button className="agent-retry-btn" onClick={closeAgentPanel}>Close Panel</button>
                      </div>
                    )}
                  </div>
                ) : canvasArtifacts.length > 0 && activeCanvasTabId ? (
                  <div className="markdown-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {canvasArtifacts.find(a => a.id === activeCanvasTabId)?.content || ''}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="canvas-empty">
                    <PinIcon />
                    <p>Pin any AI response here for side-by-side analysis</p>
                    <p className="canvas-hint">Support for multiple tabs (Code, Tables, Notes)</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="input-container-wrapper">
          <div className="input-container-center">

            {/* Slash Menu */}
            {slashMenuOpen && (
              <div className="slash-menu">
                <div className="slash-header">Analyst Commands</div>
                {SLASH_COMMANDS.map((cmd, idx) => (
                  <div key={cmd.id} className={`slash-item ${slashIndex === idx ? 'active' : ''}`} onClick={() => insertCommand(cmd.id)} onMouseEnter={() => setSlashIndex(idx)}>
                    <span className="slash-icon">{cmd.icon}</span>
                    <div className="slash-text">
                      <div className="slash-title">/{cmd.id}</div>
                      <div className="slash-desc">{cmd.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="input-box">
              {/* Attachments Preview */}
              {attachments.length > 0 && (
                <div className="attachment-previews">
                  {attachments.map(f => (
                    <div key={f.id} className="attachment-chip">
                      {getFileIcon(f.filename)} {f.filename}
                      <span className="attachment-remove" onClick={() => removeAttachment(f.id)}>✕</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="input-row">
                <label className="input-tool-btn" title="Attach files">
                  <PlusIcon />
                  <input type="file" hidden multiple onChange={handleFileUpload} />
                </label>

                <textarea
                  ref={inputRef}
                  className="chat-textarea"
                  placeholder={activeContext ? `Ask about ${activeContext}... or type '/' for commands` : "Ask about any company... or type '/' for commands"}
                  value={input}
                  onChange={handleInputTextChange}
                  onKeyDown={handleKeyDownInput}
                  rows={1}
                />

                <button 
                  className={`web-search-toggle ${useWebSearch ? 'active' : ''}`}
                  onClick={() => setUseWebSearch(!useWebSearch)}
                  title={useWebSearch ? "Web Search is ON (Tavily Augmented RAG)" : "Turn ON Web Search"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  <span>{useWebSearch ? 'Web ON' : 'Web'}</span>
                </button>

                <button
                  className="send-btn"
                  onClick={() => isStreaming ? abortRef.current?.abort() : sendMessage()}
                  disabled={!input.trim() && !isStreaming}
                  style={{
                    background: (input.trim() || isStreaming) ? 'var(--text-primary)' : 'var(--border-color)',
                    color: (input.trim() || isStreaming) ? 'var(--bg-main)' : 'var(--text-secondary)'
                  }}
                >
                  {isStreaming ? <StopIcon /> : <SendIcon />}
                </button>
              </div>
            </div>

            <div className="footer-text">
              PRISM can make mistakes. All answers are grounded in source annual reports. Click citations to verify.
              {activeContext && <span style={{ color: 'var(--accent-blue)', marginLeft: '4px' }}>Context: {activeContext}</span>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
