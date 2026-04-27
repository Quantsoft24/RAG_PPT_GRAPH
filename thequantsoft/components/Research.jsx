const { useState: useS1, useEffect: useE1 } = React;

/* ============ FOCUS AREAS ============ */
function Research() {
  const [active, setActive] = useS1(0);
  const items = [
    {
      tag: "01 / WORKFLOWS",
      title: "AI-Native Financial Workflows",
      body: "Replace manual, repetitive research tasks with intelligent automation that understands financial context — not just keywords.",
      bullets: ["Filing-aware parsing", "Structured KPI mapping", "Workflow orchestration", "Human-in-the-loop review"],
      visual: "workflow",
    },
    {
      tag: "02 / INTELLIGENCE",
      title: "Research & Intelligence Systems",
      body: "Give analysts instant access to structured insights from filings, disclosures, market data, and sector intelligence.",
      bullets: ["Sector tracking", "Company timelines", "Cross-document retrieval", "Source-linked answers"],
      visual: "intelligence",
    },
    {
      tag: "03 / AGENTIC",
      title: "Agentic Decision Infrastructure",
      body: "Build systems that don't just surface information — they assist in processing, organizing, and actioning it.",
      bullets: ["Multi-step agents", "Tool-use orchestration", "Auditable reasoning", "Operator oversight"],
      visual: "agentic",
    },
    {
      tag: "04 / MODELING",
      title: "Quantitative & Modeling Systems",
      body: "Develop rigorous computational models for analysis, strategy research, and financial optimization.",
      bullets: ["Factor & risk models", "Backtest infrastructure", "Portfolio optimization", "Computational research"],
      visual: "modeling",
    },
    {
      tag: "05 / DATA",
      title: "Financial Data Intelligence",
      body: "Transform fragmented, noisy data into clean, structured, decision-ready intelligence.",
      bullets: ["Document ingestion", "Entity resolution", "Schema normalization", "Real-time updates"],
      visual: "data",
    },
  ];

  return (
    <section id="focus" style={{ borderTop: "1px solid var(--rule)", background: "var(--paper)" }}>
      <div className="container">
        <div className="section-head reveal">
          <div><span className="eyebrow">What we work on</span></div>
          <h2>Five focus areas.<br/>One coherent stack.</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 48, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 0, borderTop: "1px solid var(--rule)" }}>
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                style={{
                  textAlign: "left", padding: "20px 0",
                  borderBottom: "1px solid var(--rule)",
                  display: "grid", gap: 6, cursor: "pointer",
                  opacity: active === i ? 1 : 0.55,
                  transition: "opacity .25s",
                }}
              >
                <span className="eyebrow">{it.tag}</span>
                <div className="display" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{it.title}</div>
                {active === i && (<div style={{ height: 2, background: "var(--accent)", width: "60%", marginTop: 4 }}/>)}
              </button>
            ))}
          </div>

          <div key={active} className="reveal in" style={{ display: "grid", gap: 24 }}>
            <ResearchVisual kind={items[active].visual} />
            <p style={{ fontSize: 18, color: "var(--ink-2)", lineHeight: 1.55, margin: 0, maxWidth: 620 }}>
              {items[active].body}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {items[active].bullets.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--rule)" }}>
                  <span className="mono" style={{ color: "var(--accent)", fontSize: 11 }}>→</span>
                  <span style={{ fontSize: 14 }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const VISUAL_LABEL = {
  workflow:     "quantsoft / workflow-orchestrator",
  intelligence: "quantsoft / sector-intel",
  agentic:      "quantsoft / agent-runtime",
  modeling:     "quantsoft / quant-lab",
  data:         "quantsoft / data-pipeline",
};

function ResearchVisual({ kind }) {
  return (
    <div style={{ border: "1px solid var(--rule)", borderRadius: 14, background: "var(--paper)", overflow: "hidden", height: 340, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--rule)", background: "var(--ivory)" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#D9D4C7" }}/>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#D9D4C7" }}/>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#D9D4C7" }}/>
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: 10 }}>{VISUAL_LABEL[kind] || "quantsoft"} · live</div>
        <div style={{ marginLeft: "auto" }}><span className="chip green"><span className="dot"></span>running</span></div>
      </div>
      <div style={{ position: "absolute", inset: "42px 0 0 0" }}>
        {kind === "workflow"     && <WorkflowViz />}
        {kind === "intelligence" && <IntelligenceViz />}
        {kind === "agentic"      && <AgenticViz />}
        {kind === "modeling"     && <ModelingViz />}
        {kind === "data"         && <DataViz />}
      </div>
    </div>
  );
}

/* ---------- 01 WORKFLOWS — pipeline of steps with progress checkmarks ---------- */
function WorkflowViz() {
  const steps = [
    { code: "FETCH",    name: "Annual report · PDF",      ms: "240ms", done: true },
    { code: "PARSE",    name: "Section extraction",       ms: "1.4s",  done: true },
    { code: "MAP",      name: "KPI → schema mapping",     ms: "820ms", done: true },
    { code: "REVIEW",   name: "Analyst review queue",     ms: "—",     done: false, active: true },
    { code: "PUBLISH",  name: "Push to research deck",    ms: "queued",done: false },
  ];
  return (
    <svg viewBox="0 0 900 300" style={{ width: "100%", height: "100%" }}>
      <text x="24" y="22" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">FILING WORKFLOW · RUN #4821 · TCS Q4 FY26</text>
      <text x="876" y="22" textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">3 / 5 STAGES · HUMAN-IN-THE-LOOP</text>

      {/* horizontal connector line */}
      <line x1="60" x2="840" y1="160" y2="160" stroke="var(--rule)" strokeWidth="1"/>

      {steps.map((s, i) => {
        const x = 60 + i * 180 + 70;
        const fill = s.done ? "var(--green)" : s.active ? "var(--accent)" : "var(--paper)";
        const stroke = s.done ? "var(--green)" : s.active ? "var(--accent)" : "var(--rule)";
        return (
          <g key={i}>
            <circle cx={x} cy={160} r="14" fill={fill} stroke={stroke} strokeWidth="1.5"/>
            {s.done && <path d={`M ${x-5} ${160} L ${x-1} ${164} L ${x+5} ${156}`} stroke="#fff" strokeWidth="2" fill="none"/>}
            {s.active && <circle cx={x} cy={160} r="20" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.4">
              <animate attributeName="r" values="14;28;14" dur="1.6s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite"/>
            </circle>}
            <text x={x} y={120} textAnchor="middle" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">{s.code}</text>
            <text x={x} y={196} textAnchor="middle" fontSize="11" fontFamily="var(--f-sans)" fill="var(--ink)" fontWeight="600">{s.name}</text>
            <text x={x} y={213} textAnchor="middle" fontSize="10" fontFamily="var(--f-mono)" fill={s.active ? "var(--accent)" : "var(--muted)"}>{s.ms}</text>
          </g>
        );
      })}

      {/* footer KPIs */}
      <g fontFamily="var(--f-mono)" fontSize="10" fill="var(--ink-2)">
        <text x="40" y="270">DOCS PROCESSED <tspan fill="var(--ink)" fontWeight="600">1,284</tspan></text>
        <text x="220" y="270">AVG RUN <tspan fill="var(--ink)" fontWeight="600">3.8s</tspan></text>
        <text x="350" y="270">AUTO-APPROVED <tspan fill="var(--green)" fontWeight="600">87%</tspan></text>
        <text x="540" y="270">NEEDS REVIEW <tspan fill="var(--accent)" fontWeight="600">13%</tspan></text>
        <text x="710" y="270">FAILURES <tspan fill="var(--ink)" fontWeight="600">0.4%</tspan></text>
      </g>
    </svg>
  );
}

/* ---------- 02 INTELLIGENCE — sector tracker grid + company timeline ---------- */
function IntelligenceViz() {
  const sectors = [
    { name: "Banking",   delta: 1.4,  events: 3 },
    { name: "Tech",      delta: -0.8, events: 5 },
    { name: "Auto",      delta: 0.6,  events: 2 },
    { name: "Pharma",    delta: 2.1,  events: 4 },
    { name: "FMCG",      delta: -0.3, events: 1 },
    { name: "Energy",    delta: 0.9,  events: 6 },
  ];
  const events = [
    { t: "09:14", co: "HDFC Bank",  ev: "Q4 results · NII beat",        src: "BSE Filing" },
    { t: "10:02", co: "Infosys",    ev: "FY27 guidance revised",        src: "Press release" },
    { t: "11:30", co: "Reliance",   ev: "Capex update · Jio AI",        src: "Concall" },
    { t: "12:48", co: "Sun Pharma", ev: "USFDA approval · oncology",    src: "SEC 6-K" },
  ];
  return (
    <svg viewBox="0 0 900 300" style={{ width: "100%", height: "100%" }}>
      <text x="24" y="22" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">SECTOR INTEL · 24H DELTA &amp; EVENTS</text>
      <text x="876" y="22" textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">SOURCE-LINKED · CROSS-DOC</text>

      {/* Left: sector tiles */}
      <g>
        {sectors.map((s, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x = 24 + col * 165, y = 40 + row * 76;
          const pos = s.delta >= 0;
          return (
            <g key={i}>
              <rect x={x} y={y} width="155" height="66" rx="8" fill="var(--paper)" stroke="var(--rule)"/>
              <text x={x + 12} y={y + 22} fontSize="11" fontFamily="var(--f-mono)" fill="var(--muted)">{s.name.toUpperCase()}</text>
              <text x={x + 12} y={y + 48} fontSize="20" fontFamily="var(--f-sans)" fontWeight="600" fill={pos ? "var(--green)" : "var(--red)"}>
                {pos ? "+" : ""}{s.delta.toFixed(2)}%
              </text>
              <text x={x + 143} y={y + 22} textAnchor="end" fontSize="10" fontFamily="var(--f-mono)" fill="var(--accent)">{s.events} EV</text>
              <rect x={x + 12} y={y + 56} width={120 * Math.min(1, Math.abs(s.delta) / 2.5)} height="3" fill={pos ? "var(--green)" : "var(--red)"} rx="1.5"/>
              <rect x={x + 12} y={y + 56} width="120" height="3" fill="var(--rule)" rx="1.5" opacity="0.4"/>
            </g>
          );
        })}
      </g>

      {/* Right: timeline of company events */}
      <g>
        <text x="370" y="48" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">COMPANY TIMELINE · TODAY</text>
        <line x1="382" x2="382" y1="58" y2="278" stroke="var(--rule)" strokeWidth="1"/>
        {events.map((e, i) => {
          const y = 70 + i * 50;
          return (
            <g key={i}>
              <circle cx="382" cy={y} r="4" fill="var(--accent)"/>
              <text x="396" y={y - 4} fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">{e.t}  ·  {e.src.toUpperCase()}</text>
              <text x="396" y={y + 12} fontSize="13" fontFamily="var(--f-sans)" fontWeight="600" fill="var(--ink)">{e.co}</text>
              <text x="396" y={y + 28} fontSize="12" fontFamily="var(--f-sans)" fill="var(--ink-2)">{e.ev}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ---------- 03 AGENTIC — multi-step agent flow with tool calls ---------- */
function AgenticViz() {
  return (
    <svg viewBox="0 0 900 300" style={{ width: "100%", height: "100%" }}>
      <text x="24" y="22" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">AGENT ORCHESTRATION · DECISION FLOW</text>
      <g fontFamily="var(--f-mono)" fontSize="11">
        <g>
          <rect x="40" y="110" width="160" height="70" rx="10" fill="var(--paper)" stroke="var(--rule)"/>
          <text x="120" y="135" textAnchor="middle" fill="var(--muted)" fontSize="10">INPUT</text>
          <text x="120" y="155" textAnchor="middle" fill="var(--ink)" fontWeight="600">FILINGS · NEWS · DATA</text>
        </g>
        <g>
          <rect x="270" y="110" width="180" height="70" rx="10" fill="var(--ink)" stroke="var(--ink)"/>
          <text x="360" y="135" textAnchor="middle" fill="var(--muted-2)" fontSize="10">PRISM AGENT LAYER</text>
          <text x="360" y="158" textAnchor="middle" fill="var(--ivory)" fontWeight="600">REASONING ✓</text>
        </g>
        <g>
          <rect x="520" y="60" width="150" height="50" rx="10" fill="var(--paper)" stroke="var(--rule)"/>
          <text x="595" y="79" textAnchor="middle" fill="var(--muted)" fontSize="10">EXTRACTOR</text>
          <text x="595" y="96" textAnchor="middle" fill="var(--ink)" fontWeight="600">KPIs</text>
        </g>
        <g>
          <rect x="520" y="128" width="150" height="50" rx="10" fill="var(--paper)" stroke="var(--rule)"/>
          <text x="595" y="147" textAnchor="middle" fill="var(--muted)" fontSize="10">RETRIEVER</text>
          <text x="595" y="164" textAnchor="middle" fill="var(--ink)" fontWeight="600">CONTEXT</text>
        </g>
        <g>
          <rect x="520" y="196" width="150" height="50" rx="10" fill="var(--paper)" stroke="var(--rule)"/>
          <text x="595" y="215" textAnchor="middle" fill="var(--muted)" fontSize="10">SUMMARIZER</text>
          <text x="595" y="232" textAnchor="middle" fill="var(--ink)" fontWeight="600">NOTES</text>
        </g>
        <g>
          <rect x="730" y="110" width="140" height="70" rx="10" fill="var(--paper)" stroke="var(--rule)"/>
          <text x="800" y="135" textAnchor="middle" fill="var(--muted)" fontSize="10">OUTPUT</text>
          <text x="800" y="155" textAnchor="middle" fill="var(--ink)" fontWeight="600">DECISIONS</text>
        </g>
      </g>
      <g fill="none" stroke="var(--indigo)" strokeWidth="1.5">
        <path d="M 200 145 L 270 145" className="flow"/>
        <path d="M 450 145 C 480 145, 490 85, 520 85" className="flow"/>
        <path d="M 450 145 L 520 153" className="flow"/>
        <path d="M 450 145 C 480 145, 490 221, 520 221" className="flow"/>
        <path d="M 670 85 C 700 85, 710 145, 730 145" className="flow"/>
        <path d="M 670 153 L 730 149" className="flow"/>
        <path d="M 670 221 C 700 221, 710 145, 730 145" className="flow"/>
      </g>
      <style>{`.flow { stroke-dasharray: 4 4; animation: dash 1.5s linear infinite; } @keyframes dash { to { stroke-dashoffset: -16; } }`}</style>
    </svg>
  );
}

/* ---------- 04 MODELING — backtest curve + factor weights ---------- */
function ModelingViz() {
  const rng = mulberry32(7);
  const pts = Array.from({ length: 60 }, (_, i) => 100 + i * 0.6 + Math.sin(i / 4) * 8 + (rng() - 0.5) * 6);
  const bench = Array.from({ length: 60 }, (_, i) => 100 + i * 0.35 + Math.sin(i / 6) * 4 + (rng() - 0.5) * 4);
  const all = [...pts, ...bench];
  const minP = Math.min(...all), maxP = Math.max(...all);
  const W = 580, H = 220, padL = 40, padR = 16, padT = 30, padB = 30;
  const x = i => padL + (i / 59) * (W - padL - padR);
  const y = p => padT + (H - padT - padB) - ((p - minP) / (maxP - minP)) * (H - padT - padB);
  const path = (arr) => arr.map((p, i) => (i === 0 ? "M" : "L") + x(i) + "," + y(p)).join(" ");

  const factors = [
    { name: "VALUE",     w: 0.32 },
    { name: "QUALITY",   w: 0.24 },
    { name: "MOMENTUM",  w: 0.18 },
    { name: "LOW VOL",   w: 0.14 },
    { name: "SIZE",      w: 0.12 },
  ];

  return (
    <svg viewBox="0 0 900 300" style={{ width: "100%", height: "100%" }}>
      <text x="24" y="22" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">QUANT LAB · MULTI-FACTOR BACKTEST</text>
      <text x="876" y="22" textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">DAILY · WALK-FORWARD</text>

      {/* Equity curve */}
      <g>
        {[0, 0.33, 0.66, 1].map((t, i) => (
          <line key={i} x1={padL} x2={W-padR} y1={padT + t * (H - padT - padB)} y2={padT + t * (H - padT - padB)} stroke="var(--rule)" strokeDasharray="2 4"/>
        ))}
        <path d={path(bench)} fill="none" stroke="var(--muted-2)" strokeWidth="1.5" strokeDasharray="3 4"/>
        <path d={path(pts)} fill="none" stroke="var(--indigo)" strokeWidth="2" className="bt-line" pathLength="1"/>
        <circle cx={x(59)} cy={y(pts[59])} r="4" fill="var(--accent)"/>
        <text x={padL} y={H + padT - 4} fontSize="10" fontFamily="var(--f-mono)" fill="var(--ink-2)">SHARPE <tspan fill="var(--ink)" fontWeight="600">1.87</tspan></text>
        <text x={padL + 110} y={H + padT - 4} fontSize="10" fontFamily="var(--f-mono)" fill="var(--ink-2)">α <tspan fill="var(--green)" fontWeight="600">+11.2%</tspan></text>
        <text x={padL + 200} y={H + padT - 4} fontSize="10" fontFamily="var(--f-mono)" fill="var(--ink-2)">DD <tspan fill="var(--red)" fontWeight="600">-8.4%</tspan></text>
        <text x={padL + 290} y={H + padT - 4} fontSize="10" fontFamily="var(--f-mono)" fill="var(--ink-2)">VAR <tspan fill="var(--ink)" fontWeight="600">-2.1%</tspan></text>
      </g>

      {/* Factor weights */}
      <g transform="translate(640, 40)">
        <text x="0" y="0" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">FACTOR WEIGHTS</text>
        {factors.map((f, i) => {
          const yy = 22 + i * 36;
          const bw = 200 * f.w / 0.35;
          return (
            <g key={i}>
              <text x="0" y={yy + 4} fontSize="11" fontFamily="var(--f-mono)" fill="var(--ink-2)">{f.name}</text>
              <rect x="80" y={yy - 8} width="200" height="14" rx="2" fill="var(--ivory)" stroke="var(--rule)"/>
              <rect x="80" y={yy - 8} width={bw} height="14" rx="2" fill="var(--accent)" opacity={0.85 - i * 0.1}/>
              <text x="290" y={yy + 4} textAnchor="end" fontSize="10" fontFamily="var(--f-mono)" fill="var(--ink)" fontWeight="600">{(f.w * 100).toFixed(0)}%</text>
            </g>
          );
        })}
      </g>

      <style>{`.bt-line { stroke-dasharray:1; stroke-dashoffset:1; animation: draw 2.2s ease-out forwards; } @keyframes draw { to { stroke-dashoffset:0; } }`}</style>
    </svg>
  );
}

/* ---------- 05 DATA — ingestion pipeline, raw rows → normalized table ---------- */
function DataViz() {
  const sources = [
    { code: "BSE",   label: "Filings",       n: "2.4k/d" },
    { code: "NSE",   label: "Disclosures",   n: "1.1k/d" },
    { code: "SEBI",  label: "Circulars",     n: "120/d"  },
    { code: "RSS",   label: "News wire",     n: "18k/d"  },
  ];

  const rows = [
    { co: "RELIANCE", k: "Revenue Q4",   v: "₹2.41 L Cr", ok: true },
    { co: "TCS",      k: "Op. Margin",   v: "25.8%",      ok: true },
    { co: "INFY",     k: "Headcount",    v: "317,420",    ok: true },
    { co: "HDFCBANK", k: "NII YoY",      v: "+10.4%",     ok: true },
  ];

  return (
    <svg viewBox="0 0 900 300" style={{ width: "100%", height: "100%" }}>
      <text x="24" y="22" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">DATA PIPELINE · INGEST → RESOLVE → NORMALIZE</text>
      <text x="876" y="22" textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">UPDATED 14s AGO</text>

      {/* Sources column */}
      <g>
        <text x="40" y="50" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">SOURCES</text>
        {sources.map((s, i) => {
          const yy = 64 + i * 46;
          return (
            <g key={i}>
              <rect x="24" y={yy} width="170" height="36" rx="6" fill="var(--paper)" stroke="var(--rule)"/>
              <rect x="24" y={yy} width="4" height="36" rx="2" fill="var(--accent)"/>
              <text x="40" y={yy + 16} fontSize="11" fontFamily="var(--f-mono)" fontWeight="600" fill="var(--ink)">{s.code}</text>
              <text x="40" y={yy + 30} fontSize="10" fontFamily="var(--f-sans)" fill="var(--muted)">{s.label}</text>
              <text x="180" y={yy + 22} textAnchor="end" fontSize="10" fontFamily="var(--f-mono)" fill="var(--ink-2)">{s.n}</text>
            </g>
          );
        })}
      </g>

      {/* Resolver in middle */}
      <g>
        <rect x="246" y="100" width="180" height="100" rx="10" fill="var(--ink)"/>
        <text x="336" y="124" textAnchor="middle" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted-2)">ENTITY RESOLVER</text>
        <text x="336" y="148" textAnchor="middle" fontSize="13" fontFamily="var(--f-sans)" fontWeight="600" fill="var(--ivory)">RELIANCE INDUSTRIES</text>
        <text x="336" y="166" textAnchor="middle" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted-2)">RIL · 500325 · INE002A01018</text>
        <text x="336" y="186" textAnchor="middle" fontSize="10" fontFamily="var(--f-mono)" fill="var(--accent)">12 ALIASES MATCHED</text>
      </g>

      {/* Flow lines from sources to resolver */}
      <g fill="none" stroke="var(--indigo)" strokeWidth="1.2">
        {sources.map((_, i) => {
          const yy = 64 + i * 46 + 18;
          return <path key={i} d={`M 194 ${yy} C 220 ${yy}, 226 150, 246 150`} className="flow"/>;
        })}
        <path d="M 426 150 L 472 150" className="flow"/>
      </g>

      {/* Normalized table */}
      <g>
        <text x="490" y="50" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">NORMALIZED · DECISION-READY</text>
        <rect x="472" y="62" width="404" height="216" rx="8" fill="var(--ivory)" stroke="var(--rule)"/>
        <line x1="472" x2="876" y1="92" y2="92" stroke="var(--rule)"/>
        <text x="488" y="82" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">TICKER</text>
        <text x="600" y="82" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">METRIC</text>
        <text x="860" y="82" textAnchor="end" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">VALUE</text>
        {rows.map((r, i) => {
          const yy = 110 + i * 38;
          return (
            <g key={i}>
              <line x1="472" x2="876" y1={yy + 18} y2={yy + 18} stroke="var(--rule)" strokeDasharray="2 3"/>
              <circle cx="488" cy={yy} r="3" fill="var(--green)"/>
              <text x="500" y={yy + 4} fontSize="11" fontFamily="var(--f-mono)" fontWeight="600" fill="var(--ink)">{r.co}</text>
              <text x="600" y={yy + 4} fontSize="11" fontFamily="var(--f-sans)" fill="var(--ink-2)">{r.k}</text>
              <text x="860" y={yy + 4} textAnchor="end" fontSize="11" fontFamily="var(--f-mono)" fontWeight="600" fill="var(--ink)">{r.v}</text>
            </g>
          );
        })}
      </g>

      <style>{`.flow { stroke-dasharray: 4 4; animation: dash 1.5s linear infinite; } @keyframes dash { to { stroke-dashoffset: -16; } }`}</style>
    </svg>
  );
}

/* legacy aliases (kept harmless in case anything imports old names) */
const BacktestViz = ModelingViz;
const HeatmapViz = IntelligenceViz;
const AlgoViz = AgenticViz;

Object.assign(window, { Research, ResearchVisual, WorkflowViz, IntelligenceViz, AgenticViz, ModelingViz, DataViz, BacktestViz, HeatmapViz, AlgoViz });
