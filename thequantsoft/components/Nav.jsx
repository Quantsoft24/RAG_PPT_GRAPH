const { useState, useEffect } = React;

function QSLogo() {
  return (
    <a href="Home.html" className="qs-logo">
      <span className="qs-logo-mark">Q</span>
      <span>{window.QS_CONFIG.COMPANY_NAME}</span>
    </a>
  );
}

function Nav({ active = "home" }) {
  const [open, setOpen] = useState(false);
  const links = [
    { id: "home", label: "Home", href: "Home.html" },
    { id: "prism", label: "Prism", href: "Prism.html" },
    { id: "labs", label: "Labs", href: "Labs.html" },
    { id: "blog", label: "Blog", href: "Blog.html" },
    { id: "contact", label: "Contact", href: "Contact.html" },
  ];
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    if (window.QS_CONFIG && window.QS_CONFIG.COMPANY_NAME) {
      document.title = document.title.replace(/Quantsoft/gi, window.QS_CONFIG.COMPANY_NAME);
    }
  }, []);
  return (
    <nav className="qs-nav">
      <div className="container qs-nav-inner">
        <QSLogo />
        <div className="qs-nav-links">
          {links.map(l => (
            <a key={l.id} href={l.href} className={active === l.id ? "active" : ""}>{l.label}</a>
          ))}
        </div>
        <a href={window.QS_CONFIG.PRISM_APP_URL} className="qs-nav-cta">
          <span className="dot"></span>
          Launch Prism
        </a>
        <button className="qs-menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
          )}
        </button>
      </div>
      <div className={`qs-mobile-backdrop${open ? " open" : ""}`} onClick={() => setOpen(false)}></div>
      <div className={`qs-mobile-panel${open ? " open" : ""}`}>
        {links.map(l => (
          <a key={l.id} href={l.href} className={active === l.id ? "active" : ""} onClick={() => setOpen(false)}>{l.label}</a>
        ))}
        <a href={window.QS_CONFIG.PRISM_APP_URL} className="qs-nav-cta">
          <span className="dot"></span>
          Launch Prism
        </a>
      </div>
    </nav>
  );
}

function Ticker() {
  const items = [
    ["NIFTY 50", "24,812.35", "+0.42%", "up"],
    ["BANKNIFTY", "55,129.80", "-0.18%", "dn"],
    ["SENSEX", "81,204.55", "+0.37%", "up"],
    ["USD/INR", "83.12", "-0.08%", "dn"],
    ["RELIANCE", "2,914.60", "+1.12%", "up"],
    ["TCS", "4,027.10", "-0.54%", "dn"],
    ["HDFCBANK", "1,684.25", "+0.21%", "up"],
    ["INFY", "1,512.80", "+0.78%", "up"],
    ["ICICIBANK", "1,219.40", "-0.12%", "dn"],
    ["BHARTIARTL", "1,561.90", "+0.64%", "up"],
    ["ITC", "428.15", "+0.05%", "up"],
    ["SBIN", "812.35", "-0.32%", "dn"],
    ["LT", "3,624.00", "+0.47%", "up"],
    ["AXISBANK", "1,148.70", "-0.24%", "dn"],
  ];
  const all = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {all.map((it, i) => (
          <span className="ticker-item" key={i}>
            <span className="sym">{it[0]}</span>
            <span className="pr">{it[1]}</span>
            <span className={`ch ${it[3]}`}>{it[3] === "up" ? "▲" : "▼"} {it[2]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="qs-foot">
      <div className="container">
        <div className="qs-foot-grid">
          <div>
            <QSLogo />
            <p style={{ marginTop: 16, color: "var(--muted)", maxWidth: 360, fontSize: 14 }}>
              Building intelligent infrastructure for financial systems through AI, software engineering, and computational research.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <span className="chip green"><span className="dot"></span>Building · {window.QS_CONFIG.COPYRIGHT_YEAR}</span>
            </div>
          </div>
          <div>
            <h4>Products</h4>
            <ul>
              <li><a href="Prism.html">PRISM</a></li>
              <li><a href="Labs.html">Quantsoft Labs</a></li>
              <li><a href="Home.html#focus">Focus areas</a></li>
              <li><a href="Home.html#vision">Long-term vision</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><a href="Home.html#why">Why we exist</a></li>
              <li><a href="Blog.html">Blog</a></li>
              <li><a href="Labs.html">Labs</a></li>
              <li><a href="Contact.html">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><a href="Terms.html">Terms</a></li>
              <li><a href="Privacy.html">Privacy</a></li>
              <li><a href={`mailto:${window.QS_CONFIG.EMAIL}`}>Email</a></li>
              <li><a href={window.QS_CONFIG.LINKEDIN_URL}>LinkedIn</a></li>
            </ul>
          </div>
        </div>
        <div className="qs-foot-bottom">
          <span>© {window.QS_CONFIG.COPYRIGHT_YEAR} {window.QS_CONFIG.COPYRIGHT_DOMAIN} · All rights reserved</span>
          <span>{window.QS_CONFIG.LOCATION_SEC}</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Nav, Footer, Ticker, QSLogo });
