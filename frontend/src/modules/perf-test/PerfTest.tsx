import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePerfTest } from './PerfTestContext';
import { Database, Server, Play, Square, Activity, FastForward, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const PerfTest: React.FC = () => {
  const { 
    xdConfig, 
    sourceTables, 
    destTables, 
    testState, 
    startTest, 
    stopTest, 
    fetchSourceTables, 
    fetchDestTables 
  } = usePerfTest();

  const [config, setConfig] = useState({
    source_table: '',
    dest_table: '',
    row_count: 1000,
    insert_mode: 'single',
    batch_size: 100,
    timeout_seconds: 120,
    poll_interval_ms: 500,
    clean_before_run: true
  });

  useEffect(() => {
    fetchSourceTables();
    fetchDestTables();
  }, []);

  // Set defaults when tables load
  useEffect(() => {
    if (sourceTables.length > 0 && !config.source_table) {
      setConfig(c => ({ ...c, source_table: sourceTables[0] }));
    }
    if (destTables.length > 0 && !config.dest_table) {
      setConfig(c => ({ ...c, dest_table: destTables[0] }));
    }
  }, [sourceTables, destTables]);

  const handleStart = () => {
    startTest(config);
  };

  const isRunning = testState.phase !== 'idle' && testState.phase !== 'complete' && testState.phase !== 'error';

  // --- Visualization Helpers ---
  const showParticles = testState.phase === 'inserting' || testState.phase === 'polling' || testState.phase === 'starting_xd';
  const particleSpeed = testState.phase === 'polling' ? '0.5s' : '1.5s';

  // Number formatting
  const fmt = (num: number) => new Intl.NumberFormat().format(num);

  return (
    <div className="content">
      {/* ── PIPELINE VISUALIZATION ── */}
      <div className="section-header">
        <span className="section-label">Pipeline Topology</span>
        <div className="section-line"></div>
        <span className="section-tag">{xdConfig?.xd?.cluster_name || 'UNKNOWN CLUSTER'}</span>
      </div>

      <div className="panel pipeline-viz-panel">
        <div className="pipeline-container">
          {/* SOURCE */}
          <div className="pipeline-node source">
            <div className="node-icon"><Database size={24} /></div>
            <div className="node-title">SOURCE DB</div>
            <div className="node-detail flavor">{xdConfig?.source_server?.flavor.toUpperCase() || 'LOADING...'}</div>
            <div className="node-detail">{xdConfig?.source_server?.hostname}:{xdConfig?.source_server?.port}</div>
          </div>

          {/* LINK 1 */}
          <div className={`pipeline-link ${showParticles ? 'active' : ''}`}>
             <div className="link-track">
                {showParticles && (
                  <>
                    <div className="particle" style={{ animationDuration: particleSpeed, animationDelay: '0s' }}></div>
                    <div className="particle" style={{ animationDuration: particleSpeed, animationDelay: '0.3s' }}></div>
                    <div className="particle" style={{ animationDuration: particleSpeed, animationDelay: '0.6s' }}></div>
                  </>
                )}
             </div>
             <div className="link-label">INSERTS</div>
          </div>

          {/* XD ENGINE */}
          <div className={`pipeline-node xd-engine ${isRunning ? 'pulsing' : ''}`}>
            <div className="node-icon"><Activity size={24} /></div>
            <div className="node-title">XD RULES ENGINE</div>
            <div className="node-detail port">PORT: {xdConfig?.xd?.port || '---'}</div>
            <div className="node-status">
              <span className={`status-dot ${isRunning ? 'running' : 'idle'}`}></span>
              {isRunning ? testState.phase.toUpperCase() : 'IDLE'}
            </div>
          </div>

          {/* LINK 2 */}
          <div className={`pipeline-link ${testState.phase === 'polling' ? 'active' : ''}`}>
             <div className="link-track">
                {testState.phase === 'polling' && (
                  <>
                    <div className="particle" style={{ animationDuration: '0.4s', animationDelay: '0s' }}></div>
                    <div className="particle" style={{ animationDuration: '0.4s', animationDelay: '0.2s' }}></div>
                    <div className="particle" style={{ animationDuration: '0.4s', animationDelay: '0.4s' }}></div>
                  </>
                )}
             </div>
             <div className="link-label">REPLICATION</div>
          </div>

          {/* DESTINATION */}
          <div className="pipeline-node dest">
            <div className="node-icon"><Server size={24} /></div>
            <div className="node-title">DESTINATION DB</div>
            <div className="node-detail flavor">{xdConfig?.destination_server?.flavor.toUpperCase() || 'LOADING...'}</div>
            <div className="node-detail">{xdConfig?.destination_server?.hostname}:{xdConfig?.destination_server?.port}</div>
          </div>
        </div>
      </div>

      <div className="perf-body-grid">
        
        {/* ── CONFIGURATION PANEL ── */}
        <div className="panel perf-config-panel">
          <div className="panel-header">TEST CONFIGURATION</div>
          <div className="form-grid">
            
            <div className="form-group">
              <label>Source Table</label>
              <select 
                value={config.source_table} 
                onChange={e => setConfig({...config, source_table: e.target.value})}
                disabled={isRunning}
              >
                {sourceTables.length === 0 && <option value="">Loading...</option>}
                {sourceTables.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Destination Table</label>
              {destTables.length > 0 ? (
                <select 
                  value={config.dest_table} 
                  onChange={e => setConfig({...config, dest_table: e.target.value})}
                  disabled={isRunning}
                >
                  {destTables.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input 
                  type="text" 
                  value={config.dest_table} 
                  onChange={e => setConfig({...config, dest_table: e.target.value})}
                  disabled={isRunning}
                  placeholder="e.g. flt_customers"
                />
              )}
            </div>

            <div className="form-group">
              <label>Insert Mode</label>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${config.insert_mode === 'single' ? 'active' : ''}`}
                  onClick={() => setConfig({...config, insert_mode: 'single'})}
                  disabled={isRunning}
                >SINGLE</button>
                <button 
                  className={`toggle-btn ${config.insert_mode === 'bulk' ? 'active' : ''}`}
                  onClick={() => setConfig({...config, insert_mode: 'bulk'})}
                  disabled={isRunning}
                >BULK</button>
                <button 
                  className={`toggle-btn ${config.insert_mode === 'transaction' ? 'active' : ''}`}
                  onClick={() => setConfig({...config, insert_mode: 'transaction'})}
                  disabled={isRunning}
                >TXN</button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Row Count</label>
                <input 
                  type="number" 
                  value={config.row_count} 
                  onChange={e => setConfig({...config, row_count: parseInt(e.target.value) || 0})}
                  disabled={isRunning}
                />
              </div>
              
              {(config.insert_mode === 'bulk' || config.insert_mode === 'transaction') && (
                <div className="form-group">
                  <label>Batch Size</label>
                  <input 
                    type="number" 
                    value={config.batch_size} 
                    onChange={e => setConfig({...config, batch_size: parseInt(e.target.value) || 0})}
                    disabled={isRunning}
                  />
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Timeout (sec)</label>
                <input 
                  type="number" 
                  value={config.timeout_seconds} 
                  onChange={e => setConfig({...config, timeout_seconds: parseInt(e.target.value) || 0})}
                  disabled={isRunning}
                />
              </div>
              <div className="form-group form-group-center">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={config.clean_before_run}
                    onChange={e => setConfig({...config, clean_before_run: e.target.checked})}
                    disabled={isRunning}
                  />
                  <span>Clean tables before run</span>
                </label>
              </div>
            </div>
            
          </div>
        </div>

        {/* ── EXECUTION & PROGRESS ── */}
        <div className="perf-execution-panel-wrap">
          
          <div className="panel perf-execution-panel">
            <div className="panel-header panel-header-flex">
              <span>EXECUTION RUNNER</span>
              <span className={`phase-tag ${testState.phase}`}>{testState.phase.toUpperCase()}</span>
            </div>
            
            <div className="perf-execution-body">
              {testState.phase === 'error' && (
                <div className="error-box">
                  <AlertTriangle size={16} /> {testState.message}
                </div>
              )}

              {testState.insertProgress && (
                <div className="progress-section">
                  <div className="progress-header">
                    <span>Source Insertion</span>
                    <span>{fmt(testState.insertProgress.inserted)} / {fmt(testState.insertProgress.total)}</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div 
                      className="progress-bar-fill cyan" 
                      style={{ width: `${(testState.insertProgress.inserted / testState.insertProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  <div className="progress-footer">{testState.insertProgress.elapsed_ms}ms elapsed</div>
                </div>
              )}

              {testState.pollProgress && (
                <div className="progress-section mt-1">
                  <div className="progress-header">
                    <span>Destination Polling</span>
                    <span>{fmt(testState.pollProgress.dest_count)} / {fmt(testState.pollProgress.expected)}</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div 
                      className="progress-bar-fill green" 
                      style={{ width: `${Math.min(100, (testState.pollProgress.dest_count / testState.pollProgress.expected) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="progress-footer">
                    <span>{testState.pollProgress.elapsed_ms}ms elapsed</span>
                    <span className="eps-tag"><FastForward size={12} /> {fmt(Math.round(testState.pollProgress.eps))} EPS</span>
                  </div>
                </div>
              )}

              {!testState.insertProgress && !testState.pollProgress && testState.phase === 'idle' && (
                 <div className="idle-state">
                   Configure parameters and start the test to begin benchmark.
                 </div>
              )}
            </div>

            <div className="controls-footer">
              {!isRunning ? (
                <button className="btn primary block" onClick={handleStart}>
                  <Play size={16} /> START BENCHMARK
                </button>
              ) : (
                <button className="btn danger block" onClick={stopTest}>
                  <Square size={16} /> CANCEL TEST
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BENCHMARK RESULTS ── */}
      <AnimatePresence>
        {testState.result && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="panel results-panel mt-1"
          >
            <div className="panel-header panel-header-flex">
              <span>BENCHMARK RESULTS</span>
              <span className={`result-badge ${testState.result.status.toLowerCase()}`}>
                {testState.result.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {testState.result.status}
              </span>
            </div>
            
            <div className="results-grid">
              <div className="result-box">
                <div className="lbl">TOTAL INSERTED</div>
                <div className="val">{fmt(testState.result.total_inserted)}</div>
              </div>
              <div className="result-box">
                <div className="lbl">TOTAL RECEIVED</div>
                <div className="val">{fmt(testState.result.total_received)}</div>
              </div>
              <div className="result-box">
                <div className="lbl">INSERT TIME</div>
                <div className="val">{fmt(testState.result.insert_time_ms)}<span className="unit">ms</span></div>
              </div>
              <div className="result-box highlight">
                <div className="lbl">REPLICATION TIME</div>
                <div className="val">{fmt(testState.result.replication_time_ms)}<span className="unit">ms</span></div>
              </div>
              <div className="result-box highlight">
                <div className="lbl">AVERAGE EPS</div>
                <div className="val">{fmt(Math.round(testState.result.avg_eps))}</div>
              </div>
              <div className="result-box">
                <div className="lbl">PEAK EPS</div>
                <div className="val">{fmt(Math.round(testState.result.peak_eps))}</div>
              </div>
              <div className="result-box">
                <div className="lbl">FIRST EVENT LATENCY</div>
                <div className="val">{fmt(testState.result.first_event_lat_ms)}<span className="unit">ms</span></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default PerfTest;
