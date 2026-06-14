import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { RuleTestsProvider } from './modules/rule-tests/RuleTestsContext';
import { DbTestsProvider } from './modules/db-tests/DbTestsContext';

// Import Pages
import Home from './pages/Home';
import RuleTests from './modules/rule-tests/RuleTests';
import RunDbTests from './modules/db-tests/RunDbTests';
import ConfigureDbTests from './modules/db-tests/ConfigureDbTests';

// Shared Layout Component
const AppLayout: React.FC = () => {
  const { xdRunning, xdStatusText } = useApp();
  const location = useLocation();

  // UTC clock state
  const [timeStr, setTimeStr] = useState('00:00:00');
  useEffect(() => {
    const updateTime = () => {
      const n = new Date();
      setTimeStr(
        [n.getHours(), n.getMinutes(), n.getSeconds()]
          .map(v => String(v).padStart(2, '0'))
          .join(':')
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine status bar suffix based on current page
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'SYSTEM MONITOR';
      case '/rule-tests':
        return 'RULE TESTS';
      case '/db-tests':
        return 'DB TESTS — RUN';
      case '/db-tests/configure':
        return 'DB TESTS — CONFIGURE';
      default:
        return 'SYSTEM MONITOR';
    }
  };

  // Check if a path is within a module group
  const isDbTestsActive = location.pathname.startsWith('/db-tests');

  return (
    <div className="app">
      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <NavLink className="nav-brand" to="/">
          <div className="nav-icon"></div>
          <span className="nav-brand-text">
            XD<span> TEST</span>
          </span>
        </NavLink>
        <div className="nav-links">
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/">
            Home
          </NavLink>
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/rule-tests">
            Rule Tests
          </NavLink>

          {/* DB Tests Module Group */}
          <div className="nav-group">
            <span className={`nav-group-label ${isDbTestsActive ? 'active' : ''}`}>DB Tests</span>
            <div className="nav-group-links">
              <NavLink
                className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`}
                to="/db-tests"
                end
              >
                Run
              </NavLink>
              <NavLink
                className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`}
                to="/db-tests/configure"
              >
                Configure
              </NavLink>
            </div>
          </div>
        </div>
        <div className="nav-right">
          <div className="nav-clock">{timeStr}</div>
          <div className="sys-status">
            <span className={`sb-dot ${xdRunning ? 'ok' : xdStatusText === 'STARTING' ? 'warn' : 'err'}`}></span>
            {xdStatusText === 'ONLINE' ? 'SYS ONLINE' : xdStatusText === 'STARTING' ? 'SYS STARTING' : 'SYS OFFLINE'}
          </div>
        </div>
      </nav>

      {/* ── PAGE CONTENT ROUTED HERE ── */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/rule-tests" element={<RuleTests />} />
        <Route path="/db-tests" element={<RunDbTests />} />
        <Route path="/db-tests/configure" element={<ConfigureDbTests />} />
      </Routes>

      {/* ── STATUS BAR ── */}
      <div className="statusbar">
        <div className="sb-item">
          <span className="sb-dot ok"></span> API CONNECTED
        </div>
        <div className="sb-item">
          <span className="sb-dot ok"></span> DB ONLINE
        </div>
        {location.pathname === '/' ? (
          <div className="sb-item">LAST UPDATE: {timeStr}</div>
        ) : (
          <div className="sb-item">IDLE</div>
        )}
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
          XD TEST v0.2.0 — {getPageTitle()}
        </div>
      </div>
    </div>
  );
};

// Main App Wrap
function App() {
  return (
    <AppProvider>
      <RuleTestsProvider>
        <DbTestsProvider>
          <BrowserRouter>
            <AppLayout />
          </BrowserRouter>
        </DbTestsProvider>
      </RuleTestsProvider>
    </AppProvider>
  );
}

export default App;
