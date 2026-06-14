import React, { createContext, useContext, useState, useEffect } from 'react';

// Types
export interface SysMetrics {
  pid: number;
  cpu: number;
  ram: number;
  running: boolean;
}

export interface StreamerInfo {
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

export interface TestCase {
  id: number;
  name: string;
  desc: string;
  runs: number;
  state: 'idle' | 'queued' | 'running' | 'pass' | 'fail';
  history: ('pass' | 'fail' | null)[];
  totalPass: number;
  totalFail: number;
  currentRun: number;
}

interface AppContextType {
  // Real Backend Data
  metrics: SysMetrics;
  streamers: StreamerInfo[];
  uptimeStr: string;
  
  // Actions
  startXd: () => void;
  stopXd: () => void;
  restartXd: () => void;
  startStreamer: (id: string) => void;
  stopStreamer: (id: string) => void;
  restartStreamer: (id: string) => void;

  // Queue Tests (Simulated for now)
  testCases: TestCase[];
  globalRuns: number;
  setGlobalRuns: (val: number) => void;
  setTestCaseRuns: (id: number, val: number) => void;
  runTestCase: (id: number) => void;
  stopTestCase: (id: number) => void;
  runAllTestCases: () => void;
  stopAllTestCases: () => void;
  isQueueRunning: boolean;
  updateTestCasesSummary: () => { pass: number; fail: number };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ── REAL BACKEND SSE DATA ──
  const [metrics, setMetrics] = useState<SysMetrics>({ pid: 0, cpu: 0, ram: 0, running: false });
  const [streamers, setStreamers] = useState<StreamerInfo[]>([]);
  
  const [uptimeStr, setUptimeStr] = useState('00:00:00');
  const [uptimeStart, setUptimeStart] = useState<number | null>(null);

  // SSE Connection
  useEffect(() => {
    const sse = new EventSource('http://localhost:8081/api/system/stream');

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const m: SysMetrics = data.metrics || { pid: 0, cpu: 0, ram: 0, running: false };
        setMetrics(m);

        if (m.running) {
          if (!uptimeStart) setUptimeStart(Date.now());
        } else {
          setUptimeStart(null);
          setUptimeStr('00:00:00');
        }

        if (Array.isArray(data.streamers)) {
          setStreamers(data.streamers);
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };

    sse.onerror = (err) => {
      console.error("SSE Error:", err);
    };

    return () => {
      sse.close();
    };
  }, [uptimeStart]);

  // Local Uptime ticker
  useEffect(() => {
    if (!uptimeStart) return;
    const interval = setInterval(() => {
      const s = Math.floor((Date.now() - uptimeStart) / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setUptimeStr([h, m, sec].map(v => String(v).padStart(2, '0')).join(':'));
    }, 1000);
    return () => clearInterval(interval);
  }, [uptimeStart]);

  // ── CONTROL ACTIONS ──
  const doAction = (endpoint: string, payload: any = {}) => {
    fetch(`http://localhost:8081${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(console.error);
  };

  const startXd = () => doAction('/api/monitor/xd/start');
  const stopXd = () => doAction('/api/monitor/xd/stop');
  const restartXd = () => { stopXd(); setTimeout(startXd, 2000); };
  
  const startStreamer = (id: string) => doAction('/api/monitor/streamer/start', { id });
  const stopStreamer = (id: string) => doAction('/api/monitor/streamer/stop', { id });
  const restartStreamer = (id: string) => doAction('/api/monitor/streamer/restart', { id });


  // ── TESTS QUEUE RUNNER ──
  const [testCases, setTestCases] = useState<TestCase[]>([
    { id: 0, name: 'App Restart Recovery', desc: 'Stop and restart the Go app, verify it recovers cleanly', runs: 5, state: 'idle', history: [], totalPass: 0, totalFail: 0, currentRun: 0 },
    { id: 1, name: 'Streamer Reconnect', desc: 'Drop and re-establish streamer connection, verify event replay', runs: 5, state: 'idle', history: [], totalPass: 0, totalFail: 0, currentRun: 0 },
    { id: 2, name: 'Log Integrity Check', desc: 'Verify log entries are correct and in expected sequence', runs: 5, state: 'idle', history: [], totalPass: 0, totalFail: 0, currentRun: 0 },
    { id: 3, name: 'Event Replay Under Load', desc: 'Simulate high event volume and verify no data loss', runs: 5, state: 'idle', history: [], totalPass: 0, totalFail: 0, currentRun: 0 },
    { id: 4, name: 'DB Connection Pool', desc: 'Exhaust connection pool and verify graceful recovery', runs: 5, state: 'idle', history: [], totalPass: 0, totalFail: 0, currentRun: 0 },
    { id: 5, name: 'Position Update Validation', desc: 'Test pos_update for all three methods, verify positions applied', runs: 5, state: 'idle', history: [], totalPass: 0, totalFail: 0, currentRun: 0 }
  ]);

  const [globalRuns, setGlobalRunsState] = useState(5);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [, setRunQueue] = useState<number[]>([]);
  const [stopQueueFlag, setStopQueueFlag] = useState(false);

  const setGlobalRuns = (val: number) => {
    const n = Math.max(1, val);
    setGlobalRunsState(n);
    setTestCases(prev => prev.map(t => t.state === 'idle' ? { ...t, runs: n } : t));
  };

  const setTestCaseRuns = (id: number, val: number) => {
    const n = Math.max(1, val);
    setTestCases(prev => prev.map(t => t.id === id ? { ...t, runs: n } : t));
  };

  // Run single test
  const runTestCase = (id: number) => {
    const t = testCases.find(tc => tc.id === id);
    if (!t || t.state === 'running' || t.state === 'queued') return;

    setTestCases(prev => prev.map(tc => tc.id === id ? {
      ...tc,
      state: 'running',
      history: [],
      totalPass: 0,
      totalFail: 0,
      currentRun: 0
    } : tc));

    executeRuns(id);
  };

  const executeRuns = (id: number) => {
    let run = 0;
    const nextRun = () => {
      setTestCases(prev => {
        const tc = prev.find(item => item.id === id);
        if (!tc || tc.state !== 'running' || stopQueueFlag) return prev;

        const currentRunsTarget = tc.runs;
        if (run >= currentRunsTarget) {
          // Completed
          const finalState = tc.totalFail > 0 ? 'fail' : 'pass';
          setTimeout(() => {
            if (isQueueRunning) {
              setRunQueue(prevQueue => {
                const nextQueue = [...prevQueue];
                const nextId = nextQueue.shift();
                if (nextId !== undefined) {
                  // Run next in queue
                  setTimeout(() => startQueuedTest(nextId), 200);
                } else {
                  setIsQueueRunning(false);
                }
                return nextQueue;
              });
            }
          }, 100);

          return prev.map(item => item.id === id ? {
            ...item,
            state: finalState,
            currentRun: currentRunsTarget
          } : item);
        }

        // Add run
        const isPass = Math.random() > 0.15;
        const newHistory = [...tc.history, isPass ? 'pass' : 'fail'] as ('pass' | 'fail')[];
        const nextPass = tc.totalPass + (isPass ? 1 : 0);
        const nextFail = tc.totalFail + (isPass ? 0 : 1);
        run++;

        setTimeout(nextRun, 300 + Math.random() * 200);

        return prev.map(item => item.id === id ? {
          ...item,
          history: newHistory,
          totalPass: nextPass,
          totalFail: nextFail,
          currentRun: run
        } : item);
      });
    };
    // Start delay
    setTimeout(nextRun, 200);
  };

  const startQueuedTest = (id: number) => {
    setTestCases(prev => prev.map(tc => tc.id === id ? { ...tc, state: 'running' } : tc));
    executeRuns(id);
  };

  const stopTestCase = (id: number) => {
    setTestCases(prev => prev.map(tc => tc.id === id && (tc.state === 'running' || tc.state === 'queued') ? { ...tc, state: 'idle' } : tc));
  };

  const runAllTestCases = () => {
    if (isQueueRunning) return;
    setStopQueueFlag(false);
    
    // Reset all
    setTestCases(prev => prev.map(tc => ({
      ...tc,
      state: 'queued',
      history: [],
      totalPass: 0,
      totalFail: 0,
      currentRun: 0
    })));

    const queue = testCases.map(t => t.id);
    if (queue.length === 0) return;

    setIsQueueRunning(true);
    const firstId = queue.shift()!;
    setRunQueue(queue);
    
    startQueuedTest(firstId);
  };

  const stopAllTestCases = () => {
    setStopQueueFlag(true);
    setIsQueueRunning(false);
    setRunQueue([]);
    setTestCases(prev => prev.map(tc => 
      (tc.state === 'running' || tc.state === 'queued') ? { ...tc, state: 'idle' } : tc
    ));
    setTimeout(() => setStopQueueFlag(false), 500);
  };

  const updateTestCasesSummary = () => {
    let pass = 0;
    let fail = 0;
    testCases.forEach(t => {
      if (t.state === 'pass') pass++;
      if (t.state === 'fail') fail++;
    });
    return { pass, fail };
  };

  return (
    <AppContext.Provider value={{
      metrics,
      streamers,
      uptimeStr,
      startXd,
      stopXd,
      restartXd,
      startStreamer,
      stopStreamer,
      restartStreamer,
      testCases,
      globalRuns,
      setGlobalRuns,
      setTestCaseRuns,
      runTestCase,
      stopTestCase,
      runAllTestCases,
      stopAllTestCases,
      isQueueRunning,
      updateTestCasesSummary
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
