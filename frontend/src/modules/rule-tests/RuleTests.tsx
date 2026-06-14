import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useRuleTests } from './RuleTestsContext';
import type { RuleTable } from './RuleTestsContext';
import { motion, AnimatePresence } from 'framer-motion';

const RuleTests: React.FC = () => {
  const {
    xdRunning,
    xdUptimeStart,
    xdPid,
    xdStatusText,
    startXd,
    stopXd,
    restartXd,
    streamers,
    startStreamer,
    stopStreamer,
    restartStreamer
  } = useApp();

  const {
    ruleTables,
    runRuleTable,
    stopRuleTable,
    runAllRuleTables,
    updateRuleTablesSummary
  } = useRuleTests();

  // Uptime display ticker
  const [uptimeStr, setUptimeStr] = useState('00:00:00');
  useEffect(() => {
    const updateUptime = () => {
      if (!xdRunning) {
        setUptimeStr('00:00:00');
        return;
      }
      const s = Math.floor((Date.now() - xdUptimeStart) / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setUptimeStr(
        [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
      );
    };

    updateUptime();
    const interval = setInterval(updateUptime, 1000);
    return () => clearInterval(interval);
  }, [xdRunning, xdUptimeStart]);

  // Copy streamer logs to clipboard
  const [copiedStreamerIdx, setCopiedStreamerIdx] = useState<number | null>(null);
  const handleCopyLog = (idx: number, log: string) => {
    navigator.clipboard.writeText(log).then(() => {
      setCopiedStreamerIdx(idx);
      setTimeout(() => setCopiedStreamerIdx(null), 2000);
    });
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTableForModal, setSelectedTableForModal] = useState<RuleTable | null>(null);

  const openFailModal = (table: RuleTable) => {
    setSelectedTableForModal(table);
    setIsModalOpen(true);
  };

  const closeFailModal = () => {
    setIsModalOpen(false);
    setSelectedTableForModal(null);
  };

  const summary = updateRuleTablesSummary();

  return (
    <div className="content">
      {/* ── XD PROCESS STRIP ── */}
      <div>
        <div className="section-header">
          <span className="section-label">XD Process</span>
          <div className="section-line"></div>
          <span className="section-tag" id="xd-uptime-tag">
            UPTIME {uptimeStr}
          </span>
        </div>

        <div className="panel panel-cut xd-strip">
          <div className="xd-strip-left">
            <div className={`status-orb ${xdRunning ? 'running' : xdStatusText === 'STARTING' ? 'starting' : 'stopped'}`}></div>
            <div className="xd-name-inline">xd-rules-engine</div>
            <div className="xd-pid-inline">{xdPid}</div>
            <div className="xd-uptime-inline">
              UPTIME<span>{uptimeStr}</span>
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

      {/* ── STREAMERS STRIP ── */}
      <div>
        <div className="section-header">
          <span className="section-label">Streamers</span>
          <div className="section-line"></div>
          <span className="section-tag" id="str-tag">
            {streamers.filter(s => s.status === 'running').length}/{streamers.length} RUNNING
          </span>
        </div>

        <div className="streamers-strip">
          {streamers.map((s, i) => (
            <div key={s.id} className={`str-chip ${s.status}`}>
              <div className="str-chip-top">
                <div className="str-chip-id">{s.id}</div>
                <div className={`str-badge ${s.status}`}>
                  {s.status.toUpperCase()}
                </div>
              </div>
              <div className="str-chip-meta">
                <div className="str-chip-meta-item">
                  <span className="str-chip-meta-key">Delay</span>
                  <span className={`str-chip-meta-val ${s.delay === '--' ? 'warn' : ''}`}>{s.delay}</span>
                </div>
                <div className="str-chip-meta-item">
                  <span className="str-chip-meta-key">Rules</span>
                  <span className="str-chip-meta-val">{s.rules}</span>
                </div>
                <div className="str-chip-meta-item">
                  <span className="str-chip-meta-key">Status</span>
                  <span className={`str-chip-meta-val ${s.status === 'error' ? 'err' : s.status === 'stopped' ? 'warn' : ''}`}>
                    {s.status}
                  </span>
                </div>
              </div>
              {s.error && <div className="str-error-inline">{s.error}</div>}
              <div className="str-chip-controls">
                <button
                  className="str-chip-btn start"
                  onClick={() => startStreamer(i)}
                  disabled={s.status === 'running' || s.status === 'starting'}
                >
                  ▶ START
                </button>
                <button
                  className="str-chip-btn stop"
                  onClick={() => stopStreamer(i)}
                  disabled={s.status === 'stopped'}
                >
                  ■ STOP
                </button>
                <button
                  className="str-chip-btn restart"
                  onClick={() => restartStreamer(i)}
                  disabled={s.status === 'starting'}
                >
                  ↺
                </button>
                <button
                  className={`str-chip-btn log ${copiedStreamerIdx === i ? 'copied' : ''}`}
                  onClick={() => handleCopyLog(i, s.log)}
                >
                  {copiedStreamerIdx === i ? '✓ COPIED' : '⧉ LOG'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RULE TEST TABLES MATRIX ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="tables-header-row">
          <span className="section-label">Rule Test Tables</span>
          <div className="section-line"></div>
          <span className="section-tag" id="tbl-summary">
            {summary.pass} PASS · {summary.fail} FAIL
          </span>
          <button className="run-all-btn" onClick={runAllRuleTables}>
            ▶▶ RUN ALL TABLES
          </button>
        </div>

        <div className="tables-grid">
          {ruleTables.map(t => {
            const isUnconfigured = t.configured === 'unconfigured';
            const isPartial = t.configured === 'partial';
            const hasFailures = t.state === 'fail' && t.failures.length > 0;
            const completedCount = t.pass + t.fail;
            const progressPct = t.state === 'running' ? (completedCount / t.rows) * 100 : 0;

            return (
              <motion.div
                key={t.id}
                layout
                className={`table-row ${t.state}`}
              >
                {/* Horizontal Progress Bar */}
                <div className="tbl-progress">
                  <div
                    className={`tbl-progress-fill ${t.state}`}
                    style={{
                      width: t.state === 'running' ? `${progressPct}%` : t.state === 'pass' || t.state === 'fail' ? '100%' : '0%'
                    }}
                  ></div>
                </div>

                <div className="table-row-inner">
                  {/* Left Column: Name & Metadata */}
                  <div className="tbl-name-block">
                    <div className="tbl-name">{t.name}</div>
                    <div className="tbl-db">{t.db}</div>
                    <div className={`tbl-config-badge ${t.configured}`}>
                      {t.configured === 'configured' ? 'Configured' : t.configured === 'partial' ? 'Partial' : 'Unconfigured'}
                    </div>
                  </div>

                  {/* Middle Column: Stats & Pip Progress */}
                  <div className="tbl-middle">
                    <div className="tbl-stats">
                      <div className="tbl-stat">
                        <span className="tbl-stat-key">Rules</span>
                        <span className="tbl-stat-val">{t.rules}</span>
                      </div>
                      <div className="tbl-stat">
                        <span className="tbl-stat-key">Test Rows</span>
                        <span className="tbl-stat-val">{t.rows}</span>
                      </div>
                      <div className="tbl-stat">
                        <span className="tbl-stat-key">Inserted</span>
                        <span className="tbl-stat-val neutral">
                          {t.state === 'running' || t.state === 'pass' || t.state === 'fail' ? completedCount : 0}/{t.rows}
                        </span>
                      </div>
                      <div className="tbl-stat">
                        <span className="tbl-stat-key">Passed</span>
                        <span className="tbl-stat-val ok">{t.pass}</span>
                      </div>
                      <div className="tbl-stat">
                        <span className="tbl-stat-key">Failed</span>
                        <span className={`tbl-stat-val ${t.fail > 0 ? 'fail' : 'neutral'}`}>
                          {t.fail}
                        </span>
                      </div>
                    </div>

                    <div className="tbl-bottom-row">
                      <div className={`tbl-status-badge ${t.state}`}>
                        {t.state === 'idle' ? 'IDLE' : t.state === 'running' ? 'RUNNING' : t.state === 'pass' ? 'ALL PASS' : 'FAILED'}
                      </div>
                      <span className="pips-label">ROWS:</span>
                      <div className="row-pips">
                        {Array.from({ length: t.rows }).map((_, ri) => {
                          let pipCls = '';
                          if (t.state === 'running') {
                            if (ri < completedCount) {
                              // Finished pip
                              const isFailedRow = t.id === 0 && ri === 1; // row index 1 (second pip) fails on customers
                              pipCls = isFailedRow ? 'fail' : 'pass';
                            } else if (ri === completedCount) {
                              pipCls = 'running';
                            }
                          } else if (t.state === 'pass') {
                            pipCls = 'pass';
                          } else if (t.state === 'fail') {
                            const isFailedRow = t.id === 0 && ri === 1;
                            pipCls = isFailedRow ? 'fail' : 'pass';
                          }

                          return <div key={ri} className={`row-pip ${pipCls}`}></div>;
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Control Actions */}
                  <div className="tbl-actions">
                    <div className="tbl-actions-row">
                      <button
                        className="tbl-btn run"
                        onClick={() => runRuleTable(t.id)}
                        disabled={t.state === 'running' || isUnconfigured}
                      >
                        {t.state === 'pass' || t.state === 'fail' ? '↺ RERUN' : '▶ RUN'}
                      </button>
                      {t.state === 'running' && (
                        <button className="tbl-btn stop" onClick={() => stopRuleTable(t.id)}>
                          ■ STOP
                        </button>
                      )}
                    </div>

                    {hasFailures && (
                      <div className="tbl-actions-row">
                        <button className="tbl-btn fail-btn" onClick={() => openFailModal(t)}>
                          ⚠ {t.fail} RULE FAILURES
                        </button>
                      </div>
                    )}
                    {isUnconfigured && (
                      <div className="tbl-actions-row">
                        <button className="tbl-btn config-btn" onClick={() => alert('Navigate to Configure Tests tab to setup this table schema')}>
                          ⚙ CONFIGURE
                        </button>
                      </div>
                    )}
                    {isPartial && (
                      <div className="tbl-actions-row">
                        <button className="tbl-btn config-btn" onClick={() => alert('Navigate to Configure Tests tab to complete configuration')}>
                          ⚙ COMPLETE CONFIG
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── FAILURE SUMMARY DIALOG / MODAL ── */}
      <AnimatePresence>
        {isModalOpen && selectedTableForModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop open"
            onClick={closeFailModal}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <span className="modal-title">
                  FAILURE SUMMARY — {selectedTableForModal.name.toUpperCase()}
                </span>
                <button className="modal-close" onClick={closeFailModal}>
                  ✕ CLOSE
                </button>
              </div>
              <div className="modal-body">
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    color: 'var(--text2)',
                    marginBottom: '14px',
                    paddingBottom: '10px',
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  {selectedTableForModal.failures.length} assertion failure(s) · table:{' '}
                  {selectedTableForModal.name} · {selectedTableForModal.rules} rules ·{' '}
                  {selectedTableForModal.rows} test rows
                </div>
                <table className="fail-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Rule</th>
                      <th>Row</th>
                      <th>Expected</th>
                      <th>Got</th>
                      <th>Column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTableForModal.failures.map((f, fIdx) => (
                      <tr key={fIdx}>
                        <td className="fail-icon">✕</td>
                        <td className="fail-rule-name">{f.rule}</td>
                        <td className="fail-row-num">ROW {f.row}</td>
                        <td style={{ color: 'var(--text2)' }}>{f.expected}</td>
                        <td className="fail-got">{f.got}</td>
                        <td style={{ color: 'var(--text3)' }}>{f.col}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RuleTests;
