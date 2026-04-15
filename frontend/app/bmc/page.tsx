'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './bmc.css';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

// ─── Constants — Colors matched to vibrant multi-colored mockup nodes ───
const BMC_COLORS: Record<string, string> = {
  customer_segments: '#4FC3F7',
  value_propositions: '#00e5ff',
  channels: '#00E676',
  customer_relationships: '#FF4081',
  revenue_streams: '#FFD740',
  key_resources: '#FF6E40',
  key_activities: '#18FFFF',
  key_partners: '#B388FF',
  cost_structure: '#FF5252',
};

const BMC_ICONS: Record<string, string> = {
  customer_segments: '👥',
  value_propositions: '💎',
  channels: '📡',
  customer_relationships: '🤝',
  revenue_streams: '💰',
  key_resources: '🔑',
  key_activities: '⚙️',
  key_partners: '🤝',
  cost_structure: '📊',
};

const BMC_SHORT: Record<string, string> = {
  customer_segments: 'Cust. Segments',
  value_propositions: 'Value Propositions',
  channels: 'Channels',
  customer_relationships: 'Customer Relationships',
  revenue_streams: 'Revenue Streams',
  key_resources: 'Key Resources',
  key_activities: 'Key Activities',
  key_partners: 'Key Partners',
  cost_structure: 'Cost Structure',
};

// ─── Types ───
interface BMCNode {
  id: string; title: string; summary: string; evidence: string[];
  confidence: number; key_insights: string[]; sources: string[];
  icon?: string; color?: string;
}
interface BMCData {
  id?: string; company: string; generated_at?: string;
  overall_confidence: number; llm_provider: string; nodes: BMCNode[];
}
interface LibraryItem {
  id: string; company_name: string; overall_confidence: number;
  llm_provider: string; created_at: string;
}
interface GNode {
  id: string; name: string; shortLabel: string; desc: string;
  val: number; color: string; icon: string; bmcData?: BMCNode; isCenter?: boolean;
  x?: number; y?: number; z?: number;
}
interface GLink { source: string; target: string; }

// ─── API ───
const API = '/api/v1/bmc';
const apiFetch = async (url: string, opts?: RequestInit) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
};
const apiGenerate = (company: string) => apiFetch(`${API}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company }) });
const apiChat = (company: string, t: string, ctx: string, q: string, history: { role: string; content: string }[] = [], bmc_id?: string) => apiFetch(`${API}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, node_title: t, node_context: ctx, question: q, history, bmc_id }) });
const apiLoadChatHistory = (bmcId: string, nodeId: string) => apiFetch(`${API}/${bmcId}/chat/${encodeURIComponent(nodeId)}`).catch(() => ({ messages: [] }));
const apiLibrary = () => apiFetch(`${API}/library`).catch(() => []);
const apiLoad = (id: string) => apiFetch(`${API}/${id}`).then(d => {
  const inner = d.bmc_data || d;
  // Always ensure the DB id is present on the bmcData object
  if (!inner.id && d.id) inner.id = d.id;
  return inner;
}).catch(() => null);
const apiExport = (id: string, fmt: string) => apiFetch(`${API}/${id}/export?format=${fmt}`);
const apiDelete = (id: string) => fetch(`${API}/${id}`, { method: 'DELETE' });

/**
 * Stream BMC generation via SSE (Server-Sent Events).
 * Uses the Claude Agent SDK streaming endpoint for progressive updates.
 * Falls back to the regular generate endpoint if streaming fails.
 */
const apiGenerateStream = async (
  company: string,
  onStatus: (msg: string) => void,
  onResult: (data: any) => void,
  onError: (msg: string) => void,
) => {
  const resp = await fetch(`${API}/generate/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company }),
  });
  if (!resp.ok || !resp.body) throw new Error(resp.statusText);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // Parse SSE lines (data: {...})
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'status') onStatus(evt.message);
        else if (evt.type === 'text') onStatus('Agent is analyzing...');
        else if (evt.type === 'tool') onStatus(`Using tool: ${evt.name}`);
        else if (evt.type === 'cost') onStatus(`Analysis cost: $${evt.usd?.toFixed(4)}`);
        else if (evt.type === 'result') onResult(evt.data);
        else if (evt.type === 'error') onError(evt.message);
      } catch { /* skip malformed lines */ }
    }
  }
};

// ─── Graph Build ───
function buildCenterOnly(company: string): { nodes: GNode[]; links: GLink[] } {
  return {
    nodes: [{ id: 'center', name: company, shortLabel: company.toUpperCase(), desc: 'Click to explore Business Model Canvas', val: 50, color: '#00bcd4', icon: '🏢', isCenter: true }],
    links: [],
  };
}

function buildFullGraph(bmcData: BMCData): { nodes: GNode[]; links: GLink[] } {
  const center: GNode = { id: 'center', name: bmcData.company, shortLabel: bmcData.company.toUpperCase(), desc: '', val: 50, color: '#00bcd4', icon: '🏢', isCenter: true };
  const bmcNodes: GNode[] = bmcData.nodes.map(n => ({
    id: n.id, name: n.title, shortLabel: BMC_SHORT[n.id] || n.title,
    desc: n.summary ? n.summary.substring(0, 80) + (n.summary.length > 80 ? '...' : '') : '',
    val: 22, color: BMC_COLORS[n.id] || '#7C4DFF', icon: BMC_ICONS[n.id] || '📋', bmcData: n,
  }));
  const links: GLink[] = bmcData.nodes.map(n => ({ source: 'center', target: n.id }));
  return { nodes: [center, ...bmcNodes], links };
}

// ═══════════════════════════════════════════════════════════════
export default function BMCPage() {
  const router = useRouter();
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<'home' | 'library'>('home');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bmcData, setBmcData] = useState<BMCData | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [selected, setSelected] = useState<BMCNode | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // Progressive reveal
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [streamStatus, setStreamStatus] = useState(''); // SSE progress messages

  const [chatQ, setChatQ] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // ── Resize ──
  useEffect(() => {
    const upd = () => { if (containerRef.current) { const r = containerRef.current.getBoundingClientRect(); setDims({ w: r.width || 800, h: r.height || 600 }); } };
    upd(); window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, [panelOpen]);

  // ── Library ──
  useEffect(() => { if (tab === 'library') { setLibLoading(true); apiLibrary().then(setLibrary).finally(() => setLibLoading(false)); } }, [tab]);

  // ── Error auto-clear ──
  useEffect(() => { if (error) { const t = setTimeout(() => setError(''), 5000); return () => clearTimeout(t); } }, [error]);

  // ── Generate (with SSE streaming support) ──
  const handleGenerate = useCallback(async () => {
    const company = search.trim();
    if (!company) return;
    setLoading(true); setError(''); setBmcData(null); setGraphData({ nodes: [], links: [] });
    setSelected(null); setPanelOpen(false); setChatHistory([]); setExpanded(false);
    setStreamStatus('Connecting to AI agent...');
    try {
      // Try streaming endpoint first (Claude Agent SDK SSE)
      await apiGenerateStream(
        company,
        (msg) => setStreamStatus(msg),           // onStatus
        (data) => {                                // onResult
          setBmcData(data);
          setGraphData(buildCenterOnly(company));
          setExpanded(false);
          setStreamStatus('');
        },
        (msg) => setError(msg),                    // onError
      );
    } catch {
      // Fallback to non-streaming endpoint (e.g., Gemini path)
      setStreamStatus('Falling back to standard generation...');
      try {
        const data = await apiGenerate(company);
        setBmcData(data);
        setGraphData(buildCenterOnly(company));
        setExpanded(false);
      } catch (e: any) { setError(e.message || 'Failed'); }
    }
    finally { setLoading(false); setStreamStatus(''); }
  }, [search]);

  // ── Center node click → expand ──
  const handleCenterClick = useCallback(() => {
    if (!bmcData || expanded) return;
    setExpanded(true);
    setGraphData(buildFullGraph(bmcData));

    // Zoom in on the newly expanded full canvas
    setTimeout(() => {
      if (graphRef.current) {
        graphRef.current.cameraPosition(
          { x: 0, y: -10, z: 150 }, // y: -15 shifts camera down, moving graph UP to visually center hanging text
          { x: 0, y: -10, z: 0 },
          1200
        );
      }
    }, 50);
  }, [bmcData, expanded]);

  // ── BMC node click → open panel + highlight ──
  const handleNodeClick = useCallback((node: any) => {
    if (node.isCenter) { handleCenterClick(); return; }
    if (!node.bmcData) return;
    setSelected(node.bmcData);
    setPanelOpen(true);
    setChatHistory([]); setChatQ('');
    // Load saved chat history from DB
    console.log('[BMC] Node clicked, bmcData.id =', bmcData?.id, 'node.title =', node.bmcData?.title);
    if (bmcData?.id && node.bmcData?.title) {
      apiLoadChatHistory(bmcData.id, node.bmcData.title).then((res: any) => {
        console.log('[BMC] Loaded chat history:', res);
        if (res?.messages?.length) setChatHistory(res.messages);
      });
    }
    // Camera focus (Orbital pan to move node to the right without hiding center)
    if (graphRef.current) {
      const nx = node.x || 0;
      const nz = node.z || 0;
      // 45-degree orbital vector to throw the node to the right of the screen
      let cx = nx - nz;
      let cz = nx + nz;
      const len = Math.hypot(cx, cz) || 1;
      const dist = 150; // Orbital zoom distance

      graphRef.current.cameraPosition(
        { x: (cx / len) * dist, y: (node.y || 0) * 0.4 - 15, z: (cz / len) * dist }, // Pan camera to the side
        { x: 0, y: -10, z: 0 }, // Look fiercely at the central root node, not the clicked node
        1200
      );
    }
  }, [handleCenterClick]);

  // ── Chat ──
  const handleChat = useCallback(async () => {
    if (!chatQ.trim() || !selected || !bmcData) return;
    const q = chatQ.trim();
    setChatLoading(true); setChatQ('');
    setChatHistory(prev => [...prev, { role: 'user', content: q }]);

    try {
      const r = await apiChat(bmcData.company, selected.title, selected.summary, q, chatHistory, bmcData.id);
      setChatHistory(prev => [...prev, { role: 'model', content: r.answer }]);
    }
    catch {
      setChatHistory(prev => [...prev, { role: 'model', content: 'Failed. Try again.' }]);
    }
    finally { setChatLoading(false); }
  }, [chatQ, selected, bmcData, chatHistory]);

  // ── Load from library ──
  const handleLoadLib = useCallback(async (item: LibraryItem) => {
    setLoading(true); setTab('home'); setError('');
    try {
      const data = await apiLoad(item.id);
      if (data) { setBmcData(data); setGraphData(buildCenterOnly(item.company_name)); setSearch(item.company_name); setExpanded(false); }
    } catch { setError('Load failed'); }
    finally { setLoading(false); }
  }, []);

  // ── Delete from library ──
  const handleDeleteLib = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await apiDelete(id);
    setLibrary(prev => prev.filter(i => i.id !== id));
  }, []);

  // ── Export ──
  const handleExport = useCallback(async (fmt: string) => {
    if (!bmcData?.id) return;
    try {
      if (fmt === 'json') {
        const d = await apiExport(bmcData.id, 'json');
        const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `bmc_${bmcData.company}.json`; a.click();
      } else if (fmt === 'pdf') {
        const d = await apiExport(bmcData.id, 'pdf');
        const bin = atob(d.pdf_base64); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const b = new Blob([bytes], { type: 'application/pdf' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = d.filename || `bmc_${bmcData.company}.pdf`; a.click();
      } else if (fmt === 'png') {
        const c = containerRef.current?.querySelector('canvas');
        if (c) { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `bmc_${bmcData.company}.png`; a.click(); }
      }
    } catch { setError('Export failed'); }
  }, [bmcData]);

  // ── Link color — highlight selected node's link ──
  const linkColor = useCallback((link: any) => {
    if (!selected) return 'rgba(0, 188, 212, 0.25)';
    const targetId = typeof link.target === 'string' ? link.target : link.target?.id;
    if (targetId === selected.id) return 'rgba(0, 230, 255, 0.8)';
    return 'rgba(0, 188, 212, 0.08)';
  }, [selected]);

  const linkWidth = useCallback((link: any) => {
    if (!selected) return 1.5;
    const targetId = typeof link.target === 'string' ? link.target : link.target?.id;
    return targetId === selected.id ? 3.5 : 0.8;
  }, [selected]);

  // ── Hover tooltip (HTML overlay) ──
  // const hoveredNode = useMemo(() => {
  //   if (!hovered || !bmcData) return null;
  //   const n = bmcData.nodes.find(n => n.id === hovered);
  //   return n || null;
  // }, [hovered, bmcData]);

  // ── Custom node rendering ──
  const nodeThreeObject = useCallback((node: any) => {
    if (typeof window === 'undefined') return null;
    const THREE = require('three');
    const group = new THREE.Group();
    const isSel = selected?.id === node.id;
    const isDimmed = selected && !isSel && !node.isCenter;

    if (node.isCenter) {
      // ── CENTER: Brilliant Cyan Energy Core ──
      const inner = new THREE.SphereGeometry(6, 32, 32);
      const innerMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      group.add(new THREE.Mesh(inner, innerMat));

      const coreGlow = new THREE.SphereGeometry(9, 32, 32);
      const coreMat = new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
      group.add(new THREE.Mesh(coreGlow, coreMat));

      // 2D Glowing Halo (Mockup style)
      const haloCanvas = document.createElement('canvas');
      haloCanvas.width = 128; haloCanvas.height = 128;
      const ctx = haloCanvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(64, 64, 30, 64, 64, 60);
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.8)');
        grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(64, 64, 64, 0, Math.PI * 2); ctx.fill();
        const haloTex = new THREE.CanvasTexture(haloCanvas); haloTex.needsUpdate = true;
        const haloSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        haloSp.scale.set(40, 40, 1);
        group.add(haloSp);
      }

      // Orbital Rings
      const r1 = new THREE.TorusGeometry(12, 0.2, 16, 100);
      group.add(new THREE.Mesh(r1, new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })));

      const r2 = new THREE.TorusGeometry(16, 0.1, 16, 100);
      const r2Mesh = new THREE.Mesh(r2, new THREE.MeshBasicMaterial({ color: '#00bcd4', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }));
      r2Mesh.rotation.x = Math.PI / 6;
      group.add(r2Mesh);

      if (!expanded) {
        const pulse = new THREE.TorusGeometry(20, 0.2, 16, 100);
        group.add(new THREE.Mesh(pulse, new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })));
      }

      // Label
      const c = document.createElement('canvas');
      const cCtx = c.getContext('2d');
      if (cCtx) {
        c.width = 512; c.height = 100;
        cCtx.clearRect(0, 0, 512, 100);
        cCtx.font = 'bold 30px Inter, system-ui, sans-serif';
        cCtx.fillStyle = '#ffffff';
        cCtx.textAlign = 'center'; cCtx.textBaseline = 'middle';
        cCtx.fillText(node.shortLabel.substring(0, 28), 256, expanded ? 40 : 35);
        if (!expanded) {
          cCtx.font = '18px Inter, system-ui, sans-serif';
          cCtx.fillStyle = 'rgba(0, 230, 255, 0.7)';
          cCtx.fillText('Click to explore →', 256, 68);
        }
        const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        sp.scale.set(36, 7, 1); sp.position.set(0, -25, 0);
        group.add(sp);
      }
    } else {
      // ── BMC NODE: Luminous Glass Bubble ──
      const col = new THREE.Color(node.color);
      const dimFactor = isDimmed ? 0.75 : 1;
      const alpha = (isSel ? 1 : 0.65) * dimFactor;

      // Draw beautiful 2D glowing glass bubble with an edge stroke using Canvas
      const bubbleCnv = document.createElement('canvas');
      bubbleCnv.width = 128; bubbleCnv.height = 128;
      const bCtx = bubbleCnv.getContext('2d');
      if (bCtx) {
        const r = 60;
        // Inner fill
        const bgGrad = bCtx.createRadialGradient(64, 64, 0, 64, 64, r);
        bgGrad.addColorStop(0, `rgba(${col.r * 255}, ${col.g * 255}, ${col.b * 255}, 0.1)`);
        bgGrad.addColorStop(0.8, `rgba(${col.r * 255}, ${col.g * 255}, ${col.b * 255}, 0.3)`);
        bgGrad.addColorStop(1, `rgba(${col.r * 255}, ${col.g * 255}, ${col.b * 255}, 0.8)`);
        bCtx.fillStyle = bgGrad;
        bCtx.beginPath(); bCtx.arc(64, 64, r, 0, Math.PI * 2); bCtx.fill();

        // Edge stroke
        bCtx.strokeStyle = `rgba(${col.r * 255}, ${col.g * 255}, ${col.b * 255}, 1)`;
        bCtx.lineWidth = 4;
        bCtx.stroke();

        const bTex = new THREE.CanvasTexture(bubbleCnv); bTex.needsUpdate = true;
        const bMat = new THREE.SpriteMaterial({ map: bTex, transparent: true, opacity: alpha, depthWrite: false, blending: THREE.AdditiveBlending });
        const bSp = new THREE.Sprite(bMat);
        bSp.scale.set(16, 16, 1);
        group.add(bSp);
      }

      // Icon (centered inside the bubble)
      const ic = document.createElement('canvas');
      const ictx = ic.getContext('2d');
      if (ictx) {
        ic.width = 128; ic.height = 128;
        ictx.clearRect(0, 0, 128, 128);
        // Make icon huge, filling the bubble
        ictx.font = '80px serif'; ictx.textAlign = 'center'; ictx.textBaseline = 'middle';
        ictx.globalAlpha = isDimmed ? 0.75 : 1;
        // Basic emoji drop shadow for depth
        ictx.shadowColor = `rgba(${col.r * 255}, ${col.g * 255}, ${col.b * 255}, 0.8)`;
        ictx.shadowBlur = 10;
        ictx.fillText(node.icon || '📋', 64, 64);
        const itex = new THREE.CanvasTexture(ic); itex.needsUpdate = true;
        const isp = new THREE.Sprite(new THREE.SpriteMaterial({ map: itex, transparent: true, depthWrite: false }));
        isp.scale.set(11, 11, 1); isp.position.set(0, 0, 0.1);
        group.add(isp);
      }

      // Title + description label
      const lc = document.createElement('canvas');
      const lctx = lc.getContext('2d');
      if (lctx) {
        lc.width = 420; lc.height = 110;
        lctx.clearRect(0, 0, 420, 110);
        lctx.globalAlpha = dimFactor;

        // Title
        lctx.font = `bold ${isSel ? '24px' : '20px'} Inter, system-ui, sans-serif`;
        lctx.fillStyle = isSel ? '#ffffff' : '#c8d0e8';
        lctx.textAlign = 'center'; lctx.textBaseline = 'top';
        lctx.fillText(node.shortLabel.substring(0, 24), 210, 6);

        // Description (1 line truncated for clean look)
        lctx.font = '14px Inter, system-ui, sans-serif';
        lctx.fillStyle = isSel ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.6)';
        const str = (node.desc || '').substring(0, 50) + '...';
        lctx.fillText(str, 210, 36);

        const ltex = new THREE.CanvasTexture(lc); ltex.needsUpdate = true;
        const lsp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, depthWrite: false }));
        lsp.scale.set(34, 9, 1); lsp.position.set(0, -9, 0); // Position directly below bubble
        group.add(lsp);
      }

      // Selected massive ambient glow only
      if (isSel) {
        const halo = new THREE.SphereGeometry(14, 32, 32);
        group.add(new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending })));
      }
    }
    return group;
  }, [selected, expanded]);

  // ── Node hover handler — project 3D coords to screen for tooltip ──
  const handleNodeHover = useCallback((node: any) => {
    if (node && !node.isCenter && node.x !== undefined) {
      setHovered(node.id);
      // Project 3D position to 2D screen coords
      if (graphRef.current) {
        const coords = graphRef.current.graph2ScreenCoords(node.x, node.y, node.z);
        // Offset to the right of the node
        setTooltipPos({ x: coords.x + 25, y: coords.y - 20 });
      }
    } else {
      setHovered(null);
      setTooltipPos(null);
    }
    if (typeof document !== 'undefined') {
      document.body.style.cursor = node ? 'pointer' : 'default';
    }
  }, []);

  // ── Compute hovered node data for tooltip ──
  const hoveredNode = useMemo(() => {
    if (!hovered || !bmcData) return null;
    return bmcData.nodes.find(n => n.id === hovered) || null;
  }, [hovered, bmcData]);

  // ═══ RENDER ═══
  const fmtDate = bmcData?.generated_at
    ? new Date(bmcData.generated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  // handleOnLibraryClick
  const handleOnLibraryClick = () => {
    setTab('library');
    setSearch('');
  }

  // handleOnHomeClick
  const handleOnHomeClick = () => {
    setTab('home');
    setBmcData(null)
    setSearch('');
  }

  return (
    <div className="bmc-page">
      {/* ── Top Bar ── */}
      <div className="bmc-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div className="bmc-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <a href="/chat" title="Back to PRISM Chat" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                color: 'rgba(255,255,255,0.5)', transition: 'color 0.2s ease', cursor: 'pointer', textDecoration: 'none'
              }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Back</span>
              </a>
              <div className="bmc-logo-icon" style={{ opacity: 0.9 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                  <line x1="12" y1="22" x2="12" y2="15.5" />
                  <polyline points="22 8.5 12 15.5 2 8.5" />
                </svg>
              </div>
            </div>

            <div className="bmc-search-container" style={{ marginLeft: '8px' }}>
              <svg className="bmc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input className="bmc-search-input" type="text" placeholder="Search: 'Tesla, Inc.'" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div className="bmc-topbar-center">
            <button className={`bmc-tab ${tab === 'home' ? 'active' : ''}`} onClick={handleOnHomeClick}>Home</button>
            <button className={`bmc-tab ${tab === 'library' ? 'active' : ''}`} onClick={handleOnLibraryClick}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              Library
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
        </div>
      </div>

      {/* ── Info Bar ── */}
      {tab === 'home' && bmcData && (
        <div className="bmc-info-bar">
          <div className="bmc-info-left">
            <span className="bmc-info-subtitle">AI-powered Business Model Canvas (BMC) explorer</span>
            <div className="bmc-info-company"><div className="bmc-info-company-dot" />{bmcData.company}</div>
          </div>
          <div className="bmc-info-right">
            {fmtDate && (
              <div className="bmc-info-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                Data updated: {fmtDate}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main ── */}
      {tab === 'home' ? (
        <div className="bmc-main">
          {/* Left toolbar */}
          <div className="bmc-left-toolbar">
            <button
              className="bmc-tool-btn"
              title="Reset View"
              onClick={() => {
                if (expanded) {
                  graphRef.current?.cameraPosition({ x: 0, y: -15, z: 150 }, { x: 0, y: -10, z: 0 }, 1000);
                } else {
                  graphRef.current?.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);
                }
              }}
              disabled={!bmcData}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></svg>
            </button>
            <button
              className="bmc-tool-btn"
              title="Zoom In"
              disabled={!bmcData}
              onClick={() => { if (graphRef.current) { const c = graphRef.current.camera(); graphRef.current.cameraPosition({ x: c.position.x * 0.8, y: c.position.y * 0.8, z: c.position.z * 0.8 }, undefined, 500); } }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
            <button
              className="bmc-tool-btn"
              title="Zoom Out"
              disabled={!bmcData}
              onClick={() => { if (graphRef.current) { const c = graphRef.current.camera(); graphRef.current.cameraPosition({ x: c.position.x * 1.3, y: c.position.y * 1.3, z: c.position.z * 1.3 }, undefined, 500); } }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
            <div className="bmc-tool-divider" />
            <button
              className="bmc-tool-btn"
              title={bmcData?.id ? 'Export JSON' : 'Load a company first to export'}
              disabled={!bmcData?.id}
              onClick={() => handleExport('json')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z" /><polyline points="14 2 14 8 20 8" /></svg>
            </button>
            <button
              className="bmc-tool-btn"
              title={bmcData ? 'Export PNG (screenshot)' : 'Load a company first to export'}
              disabled={!bmcData}
              onClick={() => handleExport('png')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            </button>
            <button
              className="bmc-tool-btn"
              title={bmcData?.id ? 'Export PDF' : 'Load a company first to export'}
              disabled={!bmcData?.id}
              onClick={() => handleExport('pdf')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
          </div>

          {/* Graph */}
          <div className="bmc-graph-container" ref={containerRef}>
            {loading && (
              <div className="bmc-loading" style={{ position: 'fixed', left: '50vw', top: '50vh', transform: 'translate(-50%, -50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div className="bmc-loading-orb"><div className="bmc-loading-ring" /><div className="bmc-loading-ring bmc-loading-ring-2" /><div className="bmc-loading-dot" /></div>
                <div className="bmc-loading-text">{streamStatus || "Analyzing business model with AI..."}</div>
                <div className="bmc-loading-subtext">{streamStatus ? `` : `Generating 9 BMC blocks for ${search}`}</div>
              </div>
            )}
            {!loading && !bmcData && (
              <div className="bmc-empty" style={{ position: 'fixed', left: '50vw', top: '50vh', transform: 'translate(-50%, -50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div className="bmc-empty-orb"><div className="bmc-empty-ring" /><div className="bmc-empty-ring bmc-empty-ring-2" />
                  <svg className="bmc-empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" /><line x1="12" y1="22" x2="12" y2="15.5" /><polyline points="22 8.5 12 15.5 2 8.5" /></svg>
                </div>
                <div className="bmc-empty-title">3D Business Model Canvas</div>
                <div className="bmc-empty-subtitle">Search for any company above to generate an AI-powered<br />interactive Business Model Canvas visualization</div>
              </div>
            )}
            {!loading && bmcData && graphData.nodes.length > 0 && (
              <>
                <ForceGraph3D
                  ref={graphRef} graphData={graphData}
                  width={panelOpen ? dims.w - 360 : dims.w} height={dims.h}
                  backgroundColor="#0a0e1a"
                  nodeThreeObject={nodeThreeObject} nodeThreeObjectExtend={false}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  linkColor={(link: any) => {
                    const tid = typeof link.target === 'string' ? link.target : link.target?.id;
                    const tNode = graphData.nodes.find(n => n.id === tid);
                    const col = tNode ? tNode.color : '#00bcd4';
                    return selected && selected.id !== tid ? `${col}44` : `${col}aa`; // translucent when not selected, solid glowing gradient otherwise
                  }}
                  linkWidth={(link: any) => {
                    if (!selected) return 1.5;
                    const tid = typeof link.target === 'string' ? link.target : link.target?.id;
                    return tid === selected.id ? 4.5 : 1.5;
                  }}
                  linkResolution={36}
                  linkOpacity={0.9}
                  linkCurvature={0.25}
                  linkCurveRotation={(link: any) => {
                    let hash = 0;
                    const str = (typeof link.target === 'string' ? link.target : link.target?.id) || '';
                    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                    return (Math.abs(hash) % 100) / 100 * Math.PI * 2;
                  }}
                  linkDirectionalParticles={(link: any) => { if (!selected) return 3; const tid = typeof link.target === 'string' ? link.target : link.target?.id; return tid === selected.id ? 6 : 1; }}
                  linkDirectionalParticleWidth={(link: any) => { if (!selected) return 3; const tid = typeof link.target === 'string' ? link.target : link.target?.id; return tid === selected.id ? 4.5 : 1; }}
                  linkDirectionalParticleSpeed={0.0035}
                  linkDirectionalParticleColor={(link: any) => {
                    const tid = typeof link.target === 'string' ? link.target : link.target?.id;
                    const tNode = graphData.nodes.find(n => n.id === tid);
                    return tNode ? tNode.color : '#ffffff';
                  }}
                  enableNodeDrag={true} enableNavigationControls={true} showNavInfo={false}
                  cooldownTime={3000} d3AlphaDecay={0.02} d3VelocityDecay={0.3}
                />

                {/* Hover tooltip — positioned beside the node */}
                {hoveredNode && tooltipPos && (
                  <div className="bmc-hover-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
                    <div className="bmc-hover-title">{hoveredNode.icon} {hoveredNode.title}</div>
                    <div className="bmc-hover-desc" style={{ whiteSpace: 'pre-wrap' }}>{hoveredNode.summary?.substring(0, 300)}{(hoveredNode.summary?.length || 0) > 300 ? '...' : ''}</div>
                  </div>
                )}

                {/* Bottom controls — shift left when panel is open */}
                <div className="bmc-graph-controls" style={{ right: panelOpen ? 380 : 20, transition: 'right 0.3s ease' }}>
                  <button className="bmc-control-btn" title="Reset" onClick={() => graphRef.current?.cameraPosition({ x: 0, y: -15, z: 150 }, { x: 0, y: -15, z: 0 }, 1000)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></svg>
                  </button>
                  <button className="bmc-control-btn" title="Zoom In" onClick={() => { if (graphRef.current) { const c = graphRef.current.camera(); graphRef.current.cameraPosition({ x: c.position.x * 0.8, y: c.position.y * 0.8, z: c.position.z * 0.8 }, undefined, 500); } }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                  </button>
                  <button className="bmc-control-btn" title="Zoom Out" onClick={() => { if (graphRef.current) { const c = graphRef.current.camera(); graphRef.current.cameraPosition({ x: c.position.x * 1.3, y: c.position.y * 1.3, z: c.position.z * 1.3 }, undefined, 500); } }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Panel */}
          <div className={`bmc-panel ${panelOpen ? 'open' : ''}`} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 20 }}>
            {selected && (
              <>
                <div className="bmc-panel-header">
                  <div className="bmc-panel-title">
                    <div className="node-icon" style={{ background: `${selected.color || '#7C4DFF'}22`, color: selected.color }}>{selected.icon || '📋'}</div>
                    {selected.title}
                  </div>
                  <button className="bmc-panel-close" onClick={() => { setPanelOpen(false); setSelected(null); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div className="bmc-panel-scrollable" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div className="bmc-panel-body" style={{ flex: 'none', overflowY: 'visible', paddingBottom: '16px' }}>
                    <div className="bmc-panel-section"><div className="bmc-panel-field-label">Title:</div><div className="bmc-panel-field-value">{selected.title} — {bmcData?.company}</div></div>
                    <div className="bmc-panel-section"><div className="bmc-panel-field-label">AI Summary:</div><p className="bmc-panel-summary" style={{ whiteSpace: 'pre-wrap' }}>{selected.summary}</p></div>
                    {selected.evidence?.length > 0 && <div className="bmc-panel-section"><div className="bmc-panel-field-label">Evidence:</div>
                      <ul className="bmc-panel-summary" style={{ paddingLeft: '20px', margin: '4px 0 0 0' }}>{selected.evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
                    </div>}
                    {selected.key_insights?.length > 0 && <div className="bmc-panel-section"><div className="bmc-panel-field-label">Key Insights:</div>
                      <ul className="bmc-panel-summary" style={{ paddingLeft: '20px', margin: '4px 0 0 0' }}>{selected.key_insights.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
                    </div>}
                  </div>

                  <div className="bmc-chat-section" style={{ flex: 'none', display: 'flex', flexDirection: 'column' }}>
                    <div className="bmc-chat-header" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        Analyst AI Chat
                      </div>
                      {chatHistory.length > 0 && (
                        <button className="bmc-chat-close" title="Clear Chat History" onClick={() => setChatHistory([])} style={{ opacity: 0.6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      )}
                    </div>

                    <div className="bmc-chat-messages" style={{ overflowY: 'visible', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '16px' }}>
                      {chatHistory.length > 0 && chatHistory.map((msg, i) => (
                        <div key={i} style={{
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          background: msg.role === 'user' ? 'rgba(0, 188, 212, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${msg.role === 'user' ? 'rgba(0, 188, 212, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                          padding: '10px 14px', borderRadius: '12px',
                          borderTopRightRadius: msg.role === 'user' ? '4px' : '12px',
                          borderTopLeftRadius: msg.role === 'model' ? '4px' : '12px',
                          maxWidth: '90%', fontSize: '14px', lineHeight: '1.5',
                          color: msg.role === 'user' ? '#e2f6ff' : '#cbd5e1'
                        }}>
                          {msg.role === 'user' ? (
                            msg.content
                          ) : (
                            <div className="bmc-ai-markdown">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      ))
                      }
                      {chatLoading && (
                        <div style={{ alignSelf: 'flex-start', background: 'rgba(255, 255, 255, 0.05)', padding: '10px 14px', borderRadius: '12px', borderTopLeftRadius: '4px' }}>
                          <div className="bmc-chat-send-spinner" style={{ borderColor: 'rgba(255, 255, 255, 0.3)', borderTopColor: '#fff' }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bmc-chat-input-row" style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#0a0e1a', zIndex: 10 }}>
                  <input className="bmc-chat-input" placeholder={`Ask about ${selected.title}...`} value={chatQ} onChange={e => setChatQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChat()} />
                  <button className="bmc-chat-send" onClick={handleChat} disabled={chatLoading || !chatQ.trim()}>
                    {chatLoading ? <div className="bmc-chat-send-spinner" /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bmc-library">
          {libLoading ? (
            <div className="bmc-library-empty"><div className="bmc-loading-spinner" /><p style={{ marginTop: 16 }}>Loading library...</p></div>
          ) : library.length === 0 ? (
            <div className="bmc-library-empty"><div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📚</div><p>No saved analyses yet.</p></div>
          ) : (
            <div className="bmc-library-grid">
              {library.map(item => (
                <div key={item.id} className="bmc-library-card" onClick={() => handleLoadLib(item)}>
                  <div className="bmc-library-card-top">
                    <h3>🏢 {item.company_name}</h3>
                    <button className="bmc-library-delete" onClick={(e) => handleDeleteLib(item.id, e)} title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                  <div className="bmc-library-card-meta">
                    <span>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className="bmc-library-card-score" style={{
                      background: `rgba(${item.overall_confidence > 0.8 ? '16,185,129' : item.overall_confidence > 0.6 ? '245,158,11' : '239,68,68'}, 0.15)`,
                      color: item.overall_confidence > 0.8 ? '#10b981' : item.overall_confidence > 0.6 ? '#f59e0b' : '#ef4444',
                    }}>{Math.round((item.overall_confidence || 0) * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <div className="bmc-error-toast">{error}</div>}
    </div>
  );
}
