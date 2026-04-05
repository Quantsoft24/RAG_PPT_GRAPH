import './Header.css';

export default function Header() {
  return (
    <header className="app-header glass-panel">
      <div className="header-search">
        <span className="search-icon">🔍</span>
        <input 
          type="text" 
          placeholder="Search companies, filings, or analysts (Cmd+K)" 
          className="search-input"
        />
        <div className="search-shortcut">⌘K</div>
      </div>
      
      <div className="header-actions">
        <button className="icon-button" title="Market Status">
          <span className="status-indicator online"></span>
          <span className="status-text">Market Open</span>
        </button>
        <button className="icon-button" title="Notifications">
          🔔
          <span className="badge">3</span>
        </button>
        <button className="primary-button">
          New Research
        </button>
      </div>
    </header>
  );
}
