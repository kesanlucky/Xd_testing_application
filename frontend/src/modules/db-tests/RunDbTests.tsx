import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { motion } from 'framer-motion';
import { AlertTriangle, Terminal } from 'lucide-react';

interface SavedConfig {
  id: number;
  name: string;
  source_table: string;
  destination_table: string;
  config_json: string;
  created_at: string;
}

interface TestOutput {
  success: boolean;
  status: string;
  logs: string[];
}

const RunDbTests: React.FC = () => {
  const {
    xdRunning,
    xdPid,
    xdStatusText,
    startXd,
    stopXd,
    restartXd
  } = useApp();

  const [dynamicTests, setDynamicTests] = useState<SavedConfig[]>([]);
  const [runningTestId, setRunningTestId] = useState<number | null>(null);
  const [testOutputs, setTestOutputs] = useState<Record<number, TestOutput>>({});

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = () => {
    fetch('http://localhost:8081/api/config/list-dynamic')
      .then(res => res.json())
      .then(data => {
        setDynamicTests(data || []);
      })
      .catch(err => console.error("Error fetching configs:", err));
  };

  const handleRunDynamicTest = (id: number) => {
    setRunningTestId(id);
    // Reset output for this run
    setTestOutputs(prev => ({
      ...prev,
      [id]: { success: false, status: 'RUNNING', logs: ['[SYSTEM] Starting execution...', '[SYSTEM] Connecting to database...'] }
    }));

    fetch(`http://localhost:8081/api/tests/run-dynamic?id=${id}`, {
      method: 'POST'
    })
      .then(res => res.json())
      .then(data => {
        setTestOutputs(prev => ({
          ...prev,
          [id]: { success: data.success, status: data.status, logs: data.logs || [] }
        }));
      })
      .catch(err => {
        console.error("Test execution failed:", err);
        setTestOutputs(prev => ({
          ...prev,
          [id]: { success: false, status: 'FAIL', logs: ['[ERROR] Connection failed to backend server.'] }
        }));
      })
      .finally(() => {
        setRunningTestId(null);
      });
  };

  return (
    <div className="content">
      {/* ── XD PROCESS STRIP ── */}
      <div>
        <div className="section-header">
          <span className="section-label">XD Process</span>
          <div className="section-line"></div>
          <span className="section-tag" id="xd-uptime-tag">
            GO ENGINE
          </span>
        </div>

        <div className="panel panel-cut xd-strip">
          <div className="xd-strip-left">
            <div className={`status-orb ${xdRunning ? 'running' : xdStatusText === 'STARTING' ? 'starting' : 'stopped'}`}></div>
            <div className="xd-name-inline">xd-rules-engine</div>
            <div className="xd-pid-inline">{xdPid || 'PID 930'}</div>
            <div className="xd-uptime-inline">
              STATUS<span>{xdRunning ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          </div>
          <div className="xd-strip-right">
            <button
              className="ctrl-btn start"
              onClick={startXd}
              disabled={xdRunning || xdStatusText === 'STARTING'}
            >
              ▶ START
            </button>
            <button
              className="ctrl-btn stop"
              onClick={stopXd}
              disabled={!xdRunning}
            >
              ■ STOP
            </button>
            <button
              className="ctrl-btn restart"
              onClick={restartXd}
              disabled={xdStatusText === 'STARTING'}
            >
              ↺ RESTART
            </button>
          </div>
        </div>
      </div>

      {/* ── DYNAMIC TESTS LIST ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="tests-toolbar">
          <span className="section-label">Database Replication Tests</span>
          <div className="section-line"></div>
          <span className="section-tag" id="tests-summary">
            {dynamicTests.length} CONFIGURATIONS LOADED
          </span>
        </div>

        {dynamicTests.length === 0 ? (
          <div className="panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            <AlertTriangle style={{ margin: '0 auto 10px', color: 'var(--yellow)' }} />
            <div>No dynamic test configurations found. Go to <strong>DB Tests: Configure</strong> to create one.</div>
          </div>
        ) : (
          <div className="tests-list">
            {dynamicTests.map(t => {
              const isRunning = runningTestId === t.id;
              const hasOutput = !!testOutputs[t.id];
              const output = testOutputs[t.id];
              
              const parsedConfig = JSON.parse(t.config_json);
              const totalRows = parsedConfig.row_count || 0;

              return (
                <motion.div
                  key={t.id}
                  layout
                  className={`test-card ${hasOutput ? output.status.toLowerCase() : 'pending'}`}
                >
                  <div className="tc-inner">
                    {/* Left Column: Name, Description & Details */}
                    <div className="tc-name-block">
                      <div className="tc-name" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {t.name}
                        <span style={{ fontSize: '10px', color: 'var(--cyan)', background: 'rgba(0,255,204,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          ID: {t.id}
                        </span>
                      </div>
                      <div className="tc-desc" style={{ marginTop: 4 }}>
                        Source: <strong style={{ color: 'var(--text1)' }}>{t.source_table}</strong> ➔ Destination: <strong style={{ color: 'var(--text1)' }}>{t.destination_table}</strong>
                      </div>
                      <div className="tc-desc" style={{ marginTop: 2, fontSize: '11px', color: 'var(--text3)' }}>
                        Created at: {new Date(t.created_at).toLocaleString()}
                      </div>
                    </div>

                    {/* Middle Column: Stats Counter */}
                    <div className="tc-stats">
                      <div className="tc-stat-row">
                        <div className="tc-stat">
                          <span className="tc-stat-key">Injected</span>
                          <span className="tc-stat-val pass">{hasOutput ? output.logs.filter(l => l.includes("Successfully injected")).length > 0 ? totalRows : 0 : 0}</span>
                        </div>
                        <div className="tc-stat">
                          <span className="tc-stat-key">Verified</span>
                          <span className="tc-stat-val pass">{hasOutput ? output.status === 'PASS' ? totalRows : 0 : 0}</span>
                        </div>
                        <div className="tc-stat">
                          <span className="tc-stat-key">Target</span>
                          <span className="tc-stat-val neutral">{totalRows}</span>
                        </div>
                      </div>
                      <div className={`tc-status ${hasOutput ? output.status.toLowerCase() : 'pending'}`}>
                        {hasOutput ? output.status : 'PENDING'}
                      </div>
                    </div>

                    {/* Right Column: Run Buttons */}
                    <div className="tc-controls">
                      <button
                        className={`tc-btn ${isRunning ? 'stop' : 'run'}`}
                        onClick={() => handleRunDynamicTest(t.id)}
                        disabled={runningTestId !== null && !isRunning}
                      >
                        {isRunning ? '■ RUNNING' : hasOutput ? '↺ RERUN' : '▶ RUN'}
                      </button>
                    </div>
                  </div>

                  {/* Embedded Cyberpunk Terminal Logs */}
                  {hasOutput && (
                    <div className="tc-terminal" style={{
                      background: '#07070f',
                      border: '1px solid var(--border)',
                      color: 'var(--cyan)',
                      fontFamily: 'var(--mono)',
                      fontSize: '11px',
                      padding: '12px',
                      marginTop: '15px',
                      borderRadius: '4px',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)'
                    }}>
                      <div style={{
                        color: 'var(--text3)',
                        borderBottom: '1px solid #1a1a2e',
                        paddingBottom: 6,
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '10px',
                        letterSpacing: '0.1em'
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Terminal size={10} /> EXECUTION CONSOLE OUTPUT
                        </span>
                        <span className={output.status.toLowerCase()}>{output.status}</span>
                      </div>
                      <div className="console-lines" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {output.logs.map((logLine, li) => {
                          let color = 'var(--text2)';
                          if (logLine.includes("Error") || logLine.includes("Timeout")) color = 'var(--red)';
                          else if (logLine.includes("Pass") || logLine.includes("Successfully")) color = 'var(--green)';
                          else if (logLine.includes("[SYSTEM]")) color = 'var(--yellow)';

                          return (
                            <div key={li} style={{ color }}>{logLine}</div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RunDbTests;
