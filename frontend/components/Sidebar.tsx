import Link from 'next/link';
import './Sidebar.css';

export default function Sidebar() {
  return (
    <aside className="sidebar glass-panel">
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-mark">▲</div>
          <span className="logo-text text-gradient">PRISM</span>
        </div>
      </div>
      
      <div className="sidebar-section">
        <h4 className="section-title">WORKSPACE</h4>
        <nav className="sidebar-nav">
          <Link href="/" className="nav-item active">
            <span className="nav-icon">📊</span>
            Dashboard
          </Link>
          <Link href="/companies" className="nav-item">
            <span className="nav-icon">🏢</span>
            Companies
          </Link>
          <Link href="/filings" className="nav-item">
            <span className="nav-icon">📄</span>
            EDGAR Filings
          </Link>
          <Link href="/search" className="nav-item">
            <span className="nav-icon">🔍</span>
            Semantic Search
          </Link>
          <Link href="/models" className="nav-item">
            <span className="nav-icon">📈</span>
            Financial Models
          </Link>
          <Link href="/reports" className="nav-item">
            <span className="nav-icon">📝</span>
            Research Reports
          </Link>
        </nav>
      </div>

      <div className="sidebar-section mt-auto">
        <h4 className="section-title">INTELLIGENCE</h4>
        <nav className="sidebar-nav">
          <Link href="/alerts" className="nav-item">
            <span className="nav-icon">⚡</span>
            Live Alerts
          </Link>
          <Link href="/regulatory" className="nav-item">
            <span className="nav-icon">⚖️</span>
            Regulatory Intelligence
          </Link>
          <Link href="/chat" className="nav-item">
            <span className="nav-icon">💬</span>
            SIGMA Chat
          </Link>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">AJ</div>
          <div className="user-info">
            <span className="user-name">Analyst</span>
            <span className="user-role">Demo Account</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
