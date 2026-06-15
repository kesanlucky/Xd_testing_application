import React, { createContext, useContext, useState, useEffect } from 'react';

export interface ServerConfig {
  flavor: string;
  hostname: string;
  database: string;
  port: number;
}

export interface XdConfig {
  source_server: ServerConfig;
  destination_server: ServerConfig;
}

export interface ColumnSchema {
  name: string;
  type: string;
}

export interface BenchmarkResult {
  success: boolean;
  total_inserted: number;
  total_received: number;
  insert_time_ms: number;
  replication_time_ms: number;
  total_time_ms: number;
  avg_eps: number;
  peak_eps: number;
  first_event_lat_ms: number;
  status: string;
}

export interface TestState {
  phase: 'idle' | 'inserting' | 'starting_xd' | 'polling' | 'complete' | 'error';
  message: string;
  insertProgress: { inserted: number; total: number; elapsed_ms: number } | null;
  pollProgress: { dest_count: number; expected: number; elapsed_ms: number; eps: number } | null;
  result: BenchmarkResult | null;
}

interface PerfTestContextType {
  xdConfig: XdConfig | null;
  sourceTables: string[];
  destTables: string[];
  testState: TestState;
  startTest: (config: any) => void;
  stopTest: () => void;
  fetchSourceTables: () => void;
  fetchDestTables: () => void;
}

const PerfTestContext = createContext<PerfTestContextType | undefined>(undefined);

export const PerfTestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [xdConfig, setXdConfig] = useState<XdConfig | null>(null);
  const [sourceTables, setSourceTables] = useState<string[]>([]);
  const [destTables, setDestTables] = useState<string[]>([]);
  const [testState, setTestState] = useState<TestState>({
    phase: 'idle',
    message: '',
    insertProgress: null,
    pollProgress: null,
    result: null
  });

  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  useEffect(() => {
    fetch('http://localhost:8081/api/perftest/config')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setXdConfig(data);
        }
      })
      .catch(console.error);
  }, []);

  const fetchSourceTables = () => {
    fetch('http://localhost:8081/api/perftest/tables?which=source')
      .then(res => res.json())
      .then(data => {
        if (data.tables) setSourceTables(data.tables);
      })
      .catch(console.error);
  };

  const fetchDestTables = () => {
    fetch('http://localhost:8081/api/perftest/tables?which=dest')
      .then(res => res.json())
      .then(data => {
        if (data.tables) setDestTables(data.tables);
      })
      .catch(console.error);
  };

  const startTest = (config: any) => {
    if (eventSource) {
      eventSource.close();
    }

    setTestState({
      phase: 'inserting',
      message: 'Connecting to backend...',
      insertProgress: null,
      pollProgress: null,
      result: null
    });

    // We can't easily send POST body with EventSource directly,
    // so we'll use fetch to initiate and the backend handles streaming,
    // actually, SSE with POST is tricky. The standard EventSource only supports GET.
    // We should use fetch for streaming.
    startStreamingFetch(config);
  };

  const startStreamingFetch = async (config: any) => {
    try {
      const response = await fetch('http://localhost:8081/api/perftest/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(config)
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE format: event: ... \n data: ... \n\n
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep the incomplete part

        for (const message of messages) {
          if (!message.trim()) continue;

          const lines = message.split('\n');
          let eventType = 'message';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventData = line.slice(5).trim();
            }
          }

          if (eventData) {
            try {
              const parsedData = JSON.parse(eventData);
              handleEvent(eventType, parsedData);
            } catch (e) {
              console.error("Error parsing event data:", e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Stream error:", err);
      setTestState(prev => ({
        ...prev,
        phase: 'error',
        message: err.message || 'Stream error'
      }));
    }
  };

  const handleEvent = (type: string, data: any) => {
    setTestState(prev => {
      const nextState = { ...prev };
      
      switch (type) {
        case 'phase':
          nextState.phase = data.phase;
          nextState.message = data.message;
          break;
        case 'insert_progress':
          nextState.insertProgress = data;
          break;
        case 'poll_progress':
          nextState.pollProgress = data;
          break;
        case 'benchmark_result':
          nextState.result = data;
          break;
        case 'error':
          nextState.phase = 'error';
          nextState.message = data.message;
          break;
      }
      
      return nextState;
    });
  };

  const stopTest = () => {
    fetch('http://localhost:8081/api/perftest/stop', { method: 'POST' })
      .catch(console.error);
    
    setTestState(prev => {
        if (prev.phase !== 'complete' && prev.phase !== 'error' && prev.phase !== 'idle') {
            return { ...prev, phase: 'idle', message: 'Test cancelled' };
        }
        return prev;
    });
  };

  return (
    <PerfTestContext.Provider value={{
      xdConfig,
      sourceTables,
      destTables,
      testState,
      startTest,
      stopTest,
      fetchSourceTables,
      fetchDestTables
    }}>
      {children}
    </PerfTestContext.Provider>
  );
};

export const usePerfTest = () => {
  const context = useContext(PerfTestContext);
  if (!context) {
    throw new Error('usePerfTest must be used within a PerfTestProvider');
  }
  return context;
};
