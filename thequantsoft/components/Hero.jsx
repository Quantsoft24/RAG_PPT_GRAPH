const { useEffect, useRef, useState } = React;

/* ============ HERO ============ */
function Hero() {
  return (
    <section style={{ padding: "0", position: "relative", overflow: "hidden", background: "var(--ivory)" }}>
      <HeroBackground />
      <div className="container qs-hero-inner" style={{ position: "relative", zIndex: 2 }}>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 40, alignItems: "start" }}>
          <div>
            <div className="eyebrow" style={{ borderTop: "1px solid var(--ink)", paddingTop: 10, display: "inline-block" }}>
              Quantsoft · 2026
            </div>
          </div>
          <div style={{ maxWidth: 980 }}>
            <h1 className="display" style={{ fontSize: "clamp(40px, 6.6vw, 100px)", margin: "0 0 28px", letterSpacing: "-0.03em" }}>
              Intelligent infrastructure<br/>
              for <em style={{ fontStyle: "italic", color: "var(--indigo)" }}>financial</em> systems.
            </h1>
            <p style={{ fontSize: 20, lineHeight: 1.5, color: "var(--ink-2)", maxWidth: 720, margin: "0 0 40px" }}>
              Quantsoft builds AI-powered infrastructure that helps financial teams work faster, think deeper, and operate at institutional scale — without the institutional overhead.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="btn btn-primary" href="Prism.html">
                Explore PRISM <span className="arr">→</span>
              </a>
              <a className="btn btn-ghost" href="#focus">
                What we work on
              </a>
            </div>

            <div className="hero-stats-grid" style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28, maxWidth: 900 }}>
              {[
                ["AI-native", "Workflows, not chatbots"],
                ["Agentic", "Decision systems"],
                ["Quantitative", "Modeling infrastructure"],
                ["Quantum-ready", "Long-term research"],
              ].map(([n, l], i) => (
                <div key={i} style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em" }}>{n}</div>
                  <div className="eyebrow" style={{ marginTop: 6 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroBackground() {
  const ref = useRef(null);
  const [w, setW] = useState(1400);
  const [h, setH] = useState(760);

  useEffect(() => {
    const onResize = () => {
      if (ref.current) { setW(ref.current.clientWidth); setH(ref.current.clientHeight); }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const rng = mulberry32(42);
  const candles = [];
  let price = 100;
  const count = 80;
  for (let i = 0; i < count; i++) {
    const open = price;
    const vol = (rng() - 0.5) * 4;
    const close = open + vol;
    const high = Math.max(open, close) + rng() * 1.5;
    const low = Math.min(open, close) - rng() * 1.5;
    candles.push({ open, close, high, low });
    price = close;
  }
  const minP = Math.min(...candles.map(c => c.low));
  const maxP = Math.max(...candles.map(c => c.high));
  const padL = 16;
  const padR = 56;
  const pad = padL;
  const plotW = w - padL - padR;
  const plotH = h * 0.42;
  const plotY = h * 0.55;
  const x = i => pad + (i / (count - 1)) * plotW;
  const y = p => plotY + plotH - ((p - minP) / (maxP - minP)) * plotH;
  let d = "";
  candles.forEach((c, i) => { d += (i === 0 ? "M" : "L") + x(i) + "," + y(c.close) + " "; });

  return (
    <div ref={ref} style={{
      position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
      maskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, #000 75%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, #000 75%, transparent 100%)",
    }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--rule-2)" strokeWidth="1"/>
          </pattern>
          <pattern id="grid-lg" width="160" height="160" patternUnits="userSpaceOnUse">
            <path d="M 160 0 L 0 0 0 160" fill="none" stroke="var(--rule)" strokeWidth="1"/>
          </pattern>
          <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--indigo)" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="var(--indigo)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)"/>
        <rect width="100%" height="100%" fill="url(#grid-lg)"/>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const yy = plotY + t * plotH;
          const val = (maxP - t * (maxP - minP)).toFixed(2);
          return (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={yy} y2={yy} stroke="var(--rule)" strokeDasharray="2 6"/>
              <text x={w - padR + 6} y={yy + 3} fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted-2)">{val}</text>
            </g>
          );
        })}
        {candles.map((c, i) => {
          const cx = x(i);
          const up = c.close >= c.open;
          const col = up ? "var(--green)" : "var(--red)";
          const bw = Math.max(2, plotW / count * 0.5);
          return (
            <g key={i} opacity="0.55">
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth="1"/>
              <rect x={cx - bw/2} y={y(Math.max(c.open, c.close))} width={bw} height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={col}/>
            </g>
          );
        })}
        <path d={`${d} L ${x(count-1)} ${plotY + plotH} L ${x(0)} ${plotY + plotH} Z`} fill="url(#lineFill)"/>
        <path d={d} fill="none" stroke="var(--indigo)" strokeWidth="2" className="hero-line" pathLength="1"/>
        <circle cx={x(count-1)} cy={y(candles[count-1].close)} r="5" fill="var(--accent)"/>
        <circle cx={x(count-1)} cy={y(candles[count-1].close)} r="11" fill="none" stroke="var(--accent)" strokeOpacity="0.3" className="hero-pulse"/>
        {(() => {
          const lastX = x(count-1);
          const lastY = y(candles[count-1].close);
          const tagW = 100;
          const tagH = 38;
          // Flip tag to the LEFT of the dot when it would overflow the right edge
          const overflowsRight = lastX + 12 + tagW > w - padR;
          const tx = overflowsRight ? lastX - tagW - 12 : lastX + 10;
          const ty = lastY - 22;
          return (
            <g transform={`translate(${tx}, ${ty})`}>
              <rect x="0" y="0" width={tagW} height={tagH} rx="6" fill="var(--ink)" />
              <text x="10" y="15" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted-2)">PRISM · LIVE</text>
              <text x="10" y="30" fontSize="12" fontFamily="var(--f-mono)" fill="var(--ivory)">processing</text>
            </g>
          );
        })()}
        <g fontFamily="var(--f-mono)" fontSize="10" fill="var(--muted)" className="hero-meta-text">
          <text x={padL} y={h - 18}>filings indexed: 12,847 · KPIs extracted: 184k · sectors tracked: 36 · agents: research · monitoring · extraction · summarization · retrieval</text>
        </g>
      </svg>
      <style>{`
        .hero-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: drawLine 3.4s ease-out 0.2s forwards; }
        @keyframes drawLine { to { stroke-dashoffset: 0; } }
        .hero-pulse { animation: pulse 2.2s ease-out infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes pulse { 0% { r: 5; opacity: 0.9; } 100% { r: 22; opacity: 0; } }
        @media (max-width: 1100px) {
          .hero-meta-text { display: none; }
        }
      `}</style>
    </div>
  );
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Object.assign(window, { Hero, HeroBackground, mulberry32 });
