import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { motion } from 'framer-motion';
import { Play, Square, RotateCcw, Check, FileWarning, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ErrorLogModal from '../components/ErrorLogModal';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler
);

interface SysMetrics {
  pid: number;
  cpu: number;
  ram: number;
  running: boolean;
}

interface StreamerInfo {
  id: string;
  name: string;
  status: string;
  threads: number;
  eps: number;
  uptime: string;
  delay?: string;
  rules?: number;
  error?: string;
  posMethod?: number; // legacy UI state
}

const Home: React.FC = () => {
  const {
    metrics,
    streamers,
    uptimeStr,
    startXd,
    stopXd,
    startStreamer,
    stopStreamer,
    restartStreamer
  } = useApp();

  const fetchStreamerLogs = async (id: string) => {
    setLoadingLogs(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`http://localhost:8081/api/monitor/streamer/logs?id=${id}`);
      const data = await res.json();
      if (data.streamers && data.streamers.length > 0) {
        setFetchedLogs(prev => ({ ...prev, [id]: data.streamers[0] }));
      }
    } catch (err) {
      console.error("Failed to fetch logs", err);
    } finally {
      setLoadingLogs(prev => ({ ...prev, [id]: false }));
    }
  };

  // Historical chart data
  const [chartDataState, setChartDataState] = useState({
    cpu: Array(30).fill(0),
    ram: Array(30).fill(0),
    eps: Array(30).fill(0)
  });

  // Log fetching states
  const [fetchedLogs, setFetchedLogs] = useState<Record<string, any>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Track the previous PID to reset charts if the backend restarts
  const [lastPid, setLastPid] = useState(metrics.pid);

  useEffect(() => {
    if (metrics.pid !== lastPid) {
       // Reset chart if PID changed (meaning app restarted)
       setChartDataState({ cpu: Array(30).fill(0), ram: Array(30).fill(0), eps: Array(30).fill(0) });
       setLastPid(metrics.pid);
    }

    const totalEps = streamers.reduce((acc, s) => acc + (s.eps || 0), 0);

    setChartDataState(prev => ({
      cpu: [...prev.cpu.slice(1), parseFloat(metrics.cpu.toFixed(1))],
      ram: [...prev.ram.slice(1), parseFloat((metrics.ram / 512 * 100).toFixed(1))],
      eps: [...prev.eps.slice(1), parseFloat((totalEps / 500 * 100).toFixed(1))]
    }));

  }, [metrics, streamers]);

  // Chart configuration
  const chartData = {
    labels: Array(30).fill(''),
    datasets: [
      {
        label: 'CPU',
        data: chartDataState.cpu,
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.04)',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        fill: true
      },
      {
        label: 'RAM',
        data: chartDataState.ram,
        borderColor: '#00ff87',
        backgroundColor: 'rgba(0, 255, 135, 0.04)',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        fill: true
      },
      {
        label: 'EPS',
        data: chartDataState.eps,
        borderColor: '#ffb800',
        backgroundColor: 'rgba(255, 184, 0, 0.04)',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        fill: true
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 } as any,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0d1520',
        borderColor: '#1a3a55',
        borderWidth: 1,
        titleColor: '#00e5ff',
        bodyColor: '#c8dae8',
        titleFont: { family: "'Share Tech Mono'" },
        bodyFont: { family: "'Share Tech Mono'", size: 10 }
      }
    },
    scales: {
      x: { display: false },
      y: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(0,229,255,0.04)' },
        ticks: {
          color: '#2a4a60',
          font: { family: "'Share Tech Mono'", size: 9 },
          callback: (v: any) => v + '%'
        },
        border: { color: '#0e2133' }
      }
    }
  };

  const getMetricClass = (pct: number) => {
    return pct > 80 ? 'crit' : pct > 55 ? 'warn' : 'ok';
  };

  const totalEps = streamers.reduce((acc, s) => acc + (s.eps || 0), 0);
  const totalThreads = streamers.reduce((acc, s) => acc + (s.threads || 0), 0);

  return (
    <div className="content">
      {/* ── XD SECTION ── */}
      <div>
        <div className="section-header">
          <span className="section-label">XD Process</span>
          <div className="section-line"></div>
          <span className="section-tag">GO ENGINE</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="panel panel-cut xd-section"
        >
          {/* Top Identity Row */}
          <div className="xd-top">
            <div className="xd-identity">
              <div className="xd-status-indicator">
                <div className={`status-orb ${metrics.running ? 'running' : 'stopped'}`}></div>
                <span className={`status-text ${metrics.running ? 'running' : 'stopped'}`}>
                  {metrics.running ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div className="xd-name-block">
                <div className="xd-name">xd-rules-engine</div>
                <div className="xd-meta">
                  <span>PID: {metrics.pid || 'N/A'}</span>
                  <span>v2.4.1</span>
                  <span>ENV: development</span>
                </div>
              </div>
            </div>
            <div className="ctrl-buttons">
              <button
                className="ctrl-btn start"
                onClick={startXd}
                disabled={metrics.running}
              >
                <Play size={10} style={{ marginRight: 6, display: 'inline' }} /> START
              </button>
              <button
                className="ctrl-btn stop"
                onClick={stopXd}
                disabled={!metrics.running}
              >
                <Square size={10} style={{ marginRight: 6, display: 'inline' }} /> STOP
              </button>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="metrics-row">
            {/* CPU */}
            <div className="metric-box">
              <div className="metric-label">CPU</div>
              <div className={`metric-value ${getMetricClass(metrics.cpu)}`}>
                {metrics.cpu.toFixed(1)}
              </div>
              <div className="metric-unit">PERCENT</div>
              <div className="metric-bar">
                <div
                  className={`metric-bar-fill ${getMetricClass(metrics.cpu)}`}
                  style={{ width: `${Math.min(100, metrics.cpu)}%` }}
                ></div>
              </div>
            </div>

            {/* RAM */}
            <div className="metric-box">
              <div className="metric-label">RAM</div>
              <div className={`metric-value ${getMetricClass((metrics.ram / 512) * 100)}`}>
                {metrics.ram.toFixed(0)}
              </div>
              <div className="metric-unit">MB USAGE</div>
              <div className="metric-bar">
                <div
                  className={`metric-bar-fill ${getMetricClass((metrics.ram / 512) * 100)}`}
                  style={{ width: `${Math.min(100, (metrics.ram / 512) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Goroutines/Threads */}
            <div className="metric-box">
              <div className="metric-label">WORKER THREADS</div>
              <div className={`metric-value ${getMetricClass((totalThreads / 100) * 100)}`}>
                {totalThreads}
              </div>
              <div className="metric-unit">ACTIVE</div>
              <div className="metric-bar">
                <div
                  className={`metric-bar-fill ${getMetricClass((totalThreads / 100) * 100)}`}
                  style={{ width: `${Math.min(100, (totalThreads / 100) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Graph Box */}
            <div className="graph-box">
              <div className="graph-label">
                <span>LIVE METRICS</span>
                <div className="graph-legend">
                  <div className="graph-legend-item">
                    <div className="graph-legend-dot" style={{ backgroundColor: '#00e5ff' }}></div> CPU
                  </div>
                  <div className="graph-legend-item">
                    <div className="graph-legend-dot" style={{ backgroundColor: '#00ff87' }}></div> RAM
                  </div>
                  <div className="graph-legend-item">
                    <div className="graph-legend-dot" style={{ backgroundColor: '#ffb800' }}></div> EPS
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                <Line data={chartData} options={chartOptions as any} />
              </div>
            </div>
          </div>

          {/* Bottom Uptime info */}
          <div className="xd-uptime-row">
            <div>UPTIME:<span>{uptimeStr}</span></div>
            <div>EVENTS/SEC:<span>{totalEps}</span></div>
            <div>STREAMERS:<span>{streamers.length}</span></div>
          </div>
        </motion.div>
      </div>

      {/* ── STREAMERS SECTION ── */}
      <div>
        <div className="section-header">
          <span className="section-label">Streamers</span>
          <div className="section-line"></div>
          <span className="section-tag" id="str-count">
            {streamers.filter(s => s.status.toLowerCase() === 'running').length}/{streamers.length} ACTIVE
          </span>
        </div>

        <div className="streamers-grid">
          {streamers.map((s, i) => (
            <motion.div
              key={s.id || i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
              className={`streamer-card ${s.status.toLowerCase()}`}
            >
              {/* Card Header */}
              <div className="str-header">
                <div className="str-id">{s.name || s.id}</div>
                <div className={`str-status-badge ${s.status.toLowerCase()}`}>
                  {s.status.toUpperCase()}
                </div>
              </div>

              {/* Card Meta Grid */}
              <div className="str-meta">
                <div className="str-meta-item">
                  <span className="str-meta-key">EPS</span>
                  <span className="str-meta-val">{s.eps}</span>
                </div>
                <div className="str-meta-item">
                  <span className="str-meta-key">Threads</span>
                  <span className="str-meta-val">{s.threads}</span>
                </div>
                <div className="str-meta-item">
                  <span className="str-meta-key">Uptime</span>
                  <span className="str-meta-val">{s.uptime || '0'}</span>
                </div>
              </div>

              {/* Error Banner Section (Visible if stopped or error) */}
              {(s.status.toLowerCase() === 'stopped' || s.status.toLowerCase() === 'error' || s.status.toLowerCase() === 'failed') && (
                <div style={{ padding: '0.8rem', backgroundColor: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                  {!fetchedLogs[s.id] ? (
                    <button 
                      onClick={() => fetchStreamerLogs(s.id)}
                      disabled={loadingLogs[s.id]}
                      style={{ 
                        width: '100%', padding: '0.5rem', backgroundColor: 'transparent', 
                        border: '1px dashed var(--border)', color: 'var(--text-dim)', 
                        cursor: 'pointer', borderRadius: '4px', display: 'flex', 
                        justifyContent: 'center', alignItems: 'center', gap: '0.5rem' 
                      }}
                    >
                      <FileWarning size={14} /> 
                      {loadingLogs[s.id] ? 'FETCHING LOGS...' : 'FETCH ERROR LOGS'}
                    </button>
                  ) : (
                    <div>
                      <div style={{ color: 'var(--red)', marginBottom: '0.5rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FileWarning size={14} />
                        {fetchedLogs[s.id]?.error_log?.error_type || 'Unknown Error'}
                      </div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fetchedLogs[s.id]?.error_log?.message || 'Check detailed logs for info.'}
                      </div>
                      <button 
                        onClick={() => setSelectedLog(fetchedLogs[s.id])}
                        style={{ 
                          width: '100%', padding: '0.4rem', backgroundColor: 'rgba(0, 229, 255, 0.1)', 
                          border: '1px solid rgba(0, 229, 255, 0.3)', color: 'var(--cyan)', 
                          cursor: 'pointer', borderRadius: '4px', display: 'flex', 
                          justifyContent: 'center', alignItems: 'center', gap: '0.4rem' 
                        }}
                      >
                        <Eye size={14} /> VIEW DETAILS
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="str-controls">
                <button
                  className="str-btn start"
                  onClick={() => startStreamer(s.id)}
                  disabled={s.status.toLowerCase() === 'running'}
                >
                  ▶ START
                </button>
                <button
                  className="str-btn stop"
                  onClick={() => stopStreamer(s.id)}
                  disabled={s.status.toLowerCase() === 'stopped'}
                >
                  ■ STOP
                </button>
                <button
                  className="str-btn restart"
                  onClick={() => restartStreamer(s.id)}
                  disabled={s.status.toLowerCase() === 'stopped'}
                >
                  ↺ RESTART
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <ErrorLogModal 
        isOpen={!!selectedLog} 
        onClose={() => setSelectedLog(null)} 
        rawLog={selectedLog} 
      />
    </div>
  );
};

export default Home;
