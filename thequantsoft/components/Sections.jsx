const { useState: useS2, useEffect: useE2, useRef: useR2 } = React;

/* ============ WHY WE EXIST ============ */
function WhyNow() {
  const items = [
    { n: "01", t: "Fragmented information",
      b: "Financial systems run on enormous volumes of fragmented information — filings, disclosures, market data, sector intelligence — scattered across disconnected systems.",
      stat: ["12,000+", "Filings indexed daily"] },
    { n: "02", t: "Repetitive analysis",
      b: "Despite advances in technology, many institutional workflows still rely heavily on manual processes. Analysts spend hours on extraction, not interpretation.",
      stat: ["~70%", "Analyst time on processing"] },
    { n: "03", t: "Operational inefficiency",
      b: "Every disconnected system is friction. Every missed filing is information a competitor may have acted on. Technology should reduce this friction — not add to it.",
      stat: ["1 stack", "Decision-ready intelligence"] },
  ];
  return (
    <section id="why" style={{ borderTop: "1px solid var(--rule)" }}>
      <div className="container">
        <div className="section-head reveal">
          <div><span className="eyebrow">Why we exist</span></div>
          <h2>Financial systems<br/>shouldn't run on friction.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, borderTop: "1px solid var(--ink)" }}>
          {items.map((it, i) => (
            <div key={i} className="reveal" style={{
              padding: "32px 28px 36px",
              borderRight: i < 2 ? "1px solid var(--rule)" : "none",
              borderBottom: "1px solid var(--rule)",
              display: "flex", flexDirection: "column", gap: 20, minHeight: 320,
            }}>
              <div className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>{it.n}</div>
              <div className="display" style={{ fontSize: 28, letterSpacing: "-0.02em" }}>{it.t}</div>
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.6 }}>{it.b}</p>
              <div style={{ marginTop: "auto", paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
                <div className="mono" style={{ fontSize: 26, letterSpacing: "-0.02em" }}>{it.stat[0]}</div>
                <div className="eyebrow" style={{ marginTop: 4 }}>{it.stat[1]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ PRISM CHAT DEMO ============ */
function PrismDemo() {
  const script = [
    { r: "user", t: "Extract key KPIs from Reliance Q3 FY26 filing and compare with prior quarter" },
    { r: "prism", t: "Parsing filing (RIL_Q3FY26.pdf, 184 pages). Identifying KPIs:", chips: ["Revenue", "EBITDA margin", "Net debt", "Capex", "Segment splits"] },
    { r: "prism", t: "Extracted and normalized. Δ vs Q2:", table: true },
    { r: "user", t: "Now monitor for any disclosures from Jio Financial in next 7 days" },
    { r: "prism", t: "Monitoring active. Tracking BSE/NSE filings, press releases, regulatory disclosures.", running: true },
  ];
  const [shown, setShown] = useS2(0);
  const containerRef = useR2(null);

  useE2(() => {
    let mounted = true;
    const io = new IntersectionObserver((ents) => { ents.forEach(e => { if (e.isIntersecting) start(); }); }, { threshold: 0.35 });
    if (containerRef.current) io.observe(containerRef.current);
    function start() {
      io.disconnect();
      let i = 0;
      const tick = () => { if (!mounted) return; i++; setShown(i); if (i < script.length) setTimeout(tick, 1100); };
      setTimeout(tick, 400);
    }
    return () => { mounted = false; io.disconnect(); };
  }, []);

  return (
    <section id="prism" style={{ background: "var(--ink)", color: "var(--ivory)", borderTop: "1px solid var(--ink)" }} ref={containerRef}>
      <div className="container">
        <div className="section-head reveal" style={{ color: "var(--ivory)" }}>
          <div><span className="eyebrow" style={{ color: "var(--muted-2)" }}>Current product · PRISM</span></div>
          <h2 style={{ color: "var(--ivory)" }}>Ask. Extract.<br/><em style={{ color: "var(--accent)", fontStyle: "italic" }}>Decide.</em></h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 64, alignItems: "center" }}>
          <div>
            <div className="chip" style={{ background: "transparent", borderColor: "var(--ink-3)", color: "var(--muted-2)" }}>
              <span className="dot" style={{ background: "var(--accent)" }}></span>In active development
            </div>
            <h3 className="display" style={{ fontSize: 40, margin: "20px 0 20px", color: "var(--ivory)" }}>
              An intelligence layer for financial research.
            </h3>
            <p style={{ color: "var(--muted-2)", fontSize: 17, lineHeight: 1.6, margin: "0 0 32px" }}>
              PRISM is built to reduce the operational burden across institutional financial analysis — assisting with filing analysis, KPI extraction, sector tracking, business model understanding, regulatory monitoring, and research workflow automation.
            </p>
            <div style={{ display: "grid", gap: 14, marginBottom: 32 }}>
              {[
                ["Filing analysis", "Annual reports, quarterly filings, presentations, disclosures"],
                ["KPI extraction", "Structured metrics from large financial documents"],
                ["Sector tracking", "Companies, industries, competitors, regulatory updates"],
                ["Workflow assistance", "Notes, summaries, retrieval — across your corpus"],
              ].map(([a, b], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 20, paddingTop: 14, borderTop: "1px solid var(--ink-3)" }}>
                  <div className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>{a}</div>
                  <div style={{ color: "var(--muted-2)", fontSize: 14 }}>{b}</div>
                </div>
              ))}
            </div>
            <a href="Prism.html" className="btn" style={{ background: "var(--accent)", color: "#fff" }}>
              See PRISM in detail <span className="arr">→</span>
            </a>
          </div>

          <div className="prism-demo-card" style={{ background: "var(--ink-2)", border: "1px solid var(--ink-3)", borderRadius: 18, padding: 20, minHeight: 560, position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 4px 16px", borderBottom: "1px solid var(--ink-3)" }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--accent)", display: "grid", placeItems: "center", color: "#fff", fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 700 }}>P</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>PRISM</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>intelligence layer · v0.4.2</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <span className="kbd" style={{ background: "var(--ink)", borderColor: "var(--ink-3)", color: "var(--muted-2)" }}>⌘K</span>
              </div>
            </div>

            <div style={{ padding: "20px 4px 4px", display: "grid", gap: 16 }}>
              {script.slice(0, shown).map((m, i) => <ChatBubble key={i} m={m}/>)}
              {shown >= script.length && (
                <div className="chip" style={{ background: "var(--ink)", borderColor: "var(--ink-3)", color: "var(--muted-2)", width: "fit-content" }}>
                  <span className="dot" style={{ background: "var(--green)" }}></span>
                  Monitor active · 7-day window · auto-summary on event
                </div>
              )}
            </div>

            <div className="prism-demo-input" style={{ position: "absolute", left: 20, right: 20, bottom: 20, display: "flex", gap: 8, alignItems: "center", padding: "12px 14px", borderRadius: 12, background: "var(--ink)", border: "1px solid var(--ink-3)" }}>
              <span className="mono" style={{ color: "var(--muted-2)", fontSize: 12 }}>Ask PRISM about any filing, company, or sector…</span>
              <span style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 6, background: "var(--accent)", display: "grid", placeItems: "center", color: "#fff", fontSize: 12 }}>↵</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatBubble({ m }) {
  if (m.r === "user") {
    return (
      <div style={{ alignSelf: "end", background: "var(--ink)", border: "1px solid var(--ink-3)", padding: "12px 14px", borderRadius: 12, fontSize: 14, maxWidth: "85%", marginLeft: "auto" }}>
        {m.t}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10, maxWidth: "92%" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "start" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "grid", placeItems: "center", color: "#fff", fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 700, flex: "0 0 auto" }}>P</div>
        <div style={{ fontSize: 14, color: "var(--ivory)", lineHeight: 1.55 }}>{m.t}</div>
      </div>
      {m.chips && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginLeft: 32 }}>
          {m.chips.map((c, i) => (
            <span key={i} className="chip mono" style={{ background: "var(--ink)", borderColor: "var(--ink-3)", color: "var(--muted-2)" }}>{c}</span>
          ))}
        </div>
      )}
      {m.table && (
        <div style={{ marginLeft: 32, border: "1px solid var(--ink-3)", borderRadius: 10, overflow: "hidden", fontFamily: "var(--f-mono)", fontSize: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", padding: "8px 12px", background: "var(--ink)", color: "var(--muted-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <div>KPI</div><div>Q3 FY26</div><div>Q2 FY26</div><div>Δ</div>
          </div>
          {[
            ["Revenue", "₹2.41L Cr", "₹2.32L Cr", "+3.9%"],
            ["EBITDA margin", "17.8%", "17.2%", "+60bp"],
            ["Net debt", "₹1.18L Cr", "₹1.24L Cr", "-4.8%"],
            ["Capex", "₹38,815 Cr", "₹31,802 Cr", "+22.0%"],
            ["Jio ARPU", "₹181.7", "₹181.7", "flat"],
          ].map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", padding: "8px 12px", borderTop: "1px solid var(--ink-3)", color: "var(--ivory)" }}>
              <div style={{ fontWeight: 600 }}>{r[0]}</div>
              <div>{r[1]}</div>
              <div>{r[2]}</div>
              <div style={{ color: r[3].startsWith("-") ? "var(--red)" : r[3] === "flat" ? "var(--muted-2)" : "var(--green)" }}>{r[3]}</div>
            </div>
          ))}
        </div>
      )}
      {m.running && (
        <div style={{ marginLeft: 32, fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted-2)", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="running-dot"></span> watching: BSE · NSE · press · regulator…
        </div>
      )}
      <style>{`.running-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: blink 1s infinite; } @keyframes blink { 50% { opacity: 0.2; } }`}</style>
    </div>
  );
}

/* ============ APPROACH ============ */
function Team() {
  const disciplines = [
    { n: "AI Systems", d: "Agents, retrieval, structured extraction, reasoning over financial documents." },
    { n: "Software Engineering", d: "Reliable systems and infrastructure built to institutional standards." },
    { n: "Financial Understanding", d: "Domain depth across filings, markets, and operational workflows." },
    { n: "Computational Research", d: "Modeling, optimization, and forward-looking computational paradigms." },
  ];
  return (
    <section id="approach" style={{ borderTop: "1px solid var(--rule)", background: "var(--paper)" }}>
      <div className="container">
        <div className="section-head reveal">
          <div><span className="eyebrow">Our approach</span></div>
          <h2>Four disciplines.<br/>One integrated team.</h2>
        </div>
        <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: 720, marginBottom: 48, lineHeight: 1.6 }}>
          We combine AI systems, software engineering, financial understanding, and computational research to build technologies that solve real operational and analytical problems in finance.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderTop: "1px solid var(--ink)" }}>
          {disciplines.map((p, i) => (
            <div key={i} style={{ padding: "32px 24px 36px", borderRight: i < 3 ? "1px solid var(--rule)" : "none", borderBottom: "1px solid var(--rule)", minHeight: 240 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>0{i + 1}</div>
              <div className="display" style={{ fontSize: 24, letterSpacing: "-0.02em", marginBottom: 14 }}>{p.n}</div>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{p.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ FUTURE / VISION ============ */
function FutureDirections() {
  const items = [
    { tag: "FUTURE · 01", t: "Algorithmic Trading Infrastructure for Retail Participants",
      d: "Systems that enable retail participants to research, ideate, backtest, and execute sophisticated quantitative strategies through accessible institutional-style infrastructure. Our long-term vision is to reduce the technological gap between institutional and individual market participants." },
    { tag: "FUTURE · 02", t: "Quantum & Advanced Computational Research",
      d: "Researching future computational approaches for financial optimization, portfolio construction, and large-scale decision systems — including the potential applications of quantum computing in solving complex financial problems." },
  ];
  return (
    <section id="vision" style={{ borderTop: "1px solid var(--rule)" }}>
      <div className="container">
        <div className="section-head reveal">
          <div><span className="eyebrow">Future directions</span></div>
          <h2>Where this goes next.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {items.map((it, i) => (
            <div key={i} className="card" style={{ padding: 36, minHeight: 280 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.08em" }}>{it.tag}</div>
              <div className="display" style={{ fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 16 }}>{it.t}</div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 15, lineHeight: 1.6 }}>{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ CONTACT ============ */
function Contact() {
  const [sent, setSent] = useS2(false);
  const [error, setError] = useS2(null);
  const [form, setForm] = useS2({ name: "", email: "", role: "", msg: "", accept: true });
  return (
    <section id="contact" style={{ background: "var(--ink)", color: "var(--ivory)", borderTop: "1px solid var(--ink)" }}>
      <div className="container">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 80, alignItems: "start" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--muted-2)", borderTop: "1px solid var(--muted)", paddingTop: 10, display: "inline-block" }}>Contact</div>
            <h2 className="display" style={{ color: "var(--ivory)", fontSize: "clamp(40px, 5vw, 64px)", margin: "24px 0 20px" }}>
              Build with us.
            </h2>
            <p style={{ color: "var(--muted-2)", fontSize: 17, lineHeight: 1.6, maxWidth: 480 }}>
              Whether you're modernizing legacy workflows, deploying AI into production, or building operational infrastructure from the ground up — we'll help you design and ship systems engineered for the real world.
            </p>
            <div style={{ marginTop: 40, display: "grid", gap: 14 }}>
              {[["Email", window.QS_CONFIG.EMAIL], ["LinkedIn", window.QS_CONFIG.LINKEDIN_HANDLE], ["Location", window.QS_CONFIG.LOCATION_MAIN]].map(([a, b], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 20, paddingTop: 14, borderTop: "1px solid var(--ink-3)" }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{a}</div>
                  <div style={{ fontSize: 14 }}>{b}</div>
                </div>
              ))}
            </div>
          </div>
          <form onSubmit={async (e) => { 
            e.preventDefault(); 
            setError(null);
            const btn = e.target.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.innerText = "Sending..."; }
            try {
              const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'Send us a note', ...form })
              });
              const data = await res.json();
              if (res.ok && data.success) {
                setSent(true); 
              } else {
                setError(data.message || "Failed to send message.");
              }
            } catch(err) {
              console.error(err);
              setError("An unexpected error occurred. Please try again.");
            } finally {
              if (btn) { btn.disabled = false; btn.innerHTML = 'Submit <span class="arr">→</span>'; }
            }
          }} style={{ background: "var(--ink-2)", border: "1px solid var(--ink-3)", borderRadius: 16, padding: 32 }}>
            {sent ? (
              <div style={{ padding: "40px 0", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <div className="display" style={{ fontSize: 32, color: "var(--ivory)", marginBottom: 12 }}>Message received.</div>
                <div style={{ color: "var(--muted-2)" }}>We'll get back to you within 48 hours.</div>
              </div>
            ) : (
              <>
                <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 20 }}>// Send us a note</div>
                {error && (
                  <div style={{ background: "var(--red-tint)", color: "var(--red)", padding: "12px 14px", borderRadius: 8, fontSize: 14, marginBottom: 16, border: "1px solid var(--red)" }}>
                    {error}
                  </div>
                )}
                <div style={{ display: "grid", gap: 14 }}>
                  <Field label="Your name" v={form.name} onChange={v => setForm({...form, name: v})}/>
                  <Field label="Email" v={form.email} onChange={v => setForm({...form, email: v})}/>
                  <Field label="Company / role" v={form.role} onChange={v => setForm({...form, role: v})} placeholder="e.g. Head of Research at..."/>
                  <Field label="Message" v={form.msg} onChange={v => setForm({...form, msg: v})} textarea/>
                  <button type="submit" className="btn" style={{ background: "var(--accent)", color: "#fff", justifyContent: "center", marginTop: 8 }}>
                    Submit <span className="arr">→</span>
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function Field({ label, v, onChange, textarea, placeholder }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-2)" }}>{label}</span>
      {textarea ? (
        <textarea rows="4" value={v} placeholder={placeholder} onChange={e => onChange(e.target.value)}
          style={{ background: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ivory)", padding: "12px 14px", borderRadius: 8, fontFamily: "var(--f-sans)", fontSize: 14, resize: "vertical" }}/>
      ) : (
        <input value={v} placeholder={placeholder} onChange={e => onChange(e.target.value)}
          style={{ background: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ivory)", padding: "12px 14px", borderRadius: 8, fontFamily: "var(--f-sans)", fontSize: 14 }}/>
      )}
    </label>
  );
}

/* ============ MANIFESTO ============ */
function ManifestoCTA() {
  return (
    <section style={{ borderTop: "1px solid var(--rule)", padding: "100px 0" }}>
      <div className="container" style={{ textAlign: "center", maxWidth: 1000 }}>
        <div className="eyebrow reveal" style={{ display: "inline-block" }}>Long-term vision</div>
        <h2 className="display reveal" style={{ fontSize: "clamp(36px, 5vw, 72px)", margin: "20px auto 0", textAlign: "center", letterSpacing: "-0.03em" }}>
          The next generation of financial systems will be <em style={{ color: "var(--accent)", fontStyle: "italic" }}>AI-native</em>, computationally adaptive, and continuously intelligent.
        </h2>
        <p className="reveal" style={{ marginTop: 28, color: "var(--ink-2)", fontSize: 18, lineHeight: 1.6, maxWidth: 740, marginLeft: "auto", marginRight: "auto" }}>
          Our goal is to contribute toward the infrastructure powering that future.
        </p>
      </div>
    </section>
  );
}

Object.assign(window, { WhyNow, PrismDemo, Team, Contact, ManifestoCTA, FutureDirections });
