import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

interface ColumnInfo {
  field: string;
  type: string;
}

interface SavedConfig {
  id: number;
  name: string;
  source_table: string;
  destination_table: string;
  config_json: string;
  created_at: string;
}

// Per-row data: each row has its own source and destination values
interface RowData {
  sourceVals: Record<string, string>;
  destVals: Record<string, string>;
}

const ConfigureDbTests: React.FC = () => {
  // Config state
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<number | null>(null);

  const [testName, setTestName] = useState('');
  const [sourceTable, setSourceTable] = useState('');
  const [destTable, setDestTable] = useState('');
  const [rowCount, setRowCount] = useState(5);
  const [timeoutSec, setTimeoutSec] = useState(15);
  const [simulateEtl, setSimulateEtl] = useState(true);

  const [tablesList, setTablesList] = useState<string[]>([]);
  const [sourceCols, setSourceCols] = useState<ColumnInfo[]>([]);
  const [destCols, setDestCols] = useState<ColumnInfo[]>([]);

  // Per-row data array
  const [rowsData, setRowsData] = useState<RowData[]>([]);
  const [activeRowIdx, setActiveRowIdx] = useState(0);

  // Footer message state
  const [footerMsg, setFooterMsg] = useState<{ text: string; type: 'ok' | 'err' | '' }>({
    text: '',
    type: ''
  });

  const showMsg = (text: string, type: 'ok' | 'err') => {
    setFooterMsg({ text, type });
    setTimeout(() => {
      setFooterMsg({ text: '', type: '' });
    }, 4000);
  };

  // Create empty row data based on current columns
  const makeEmptyRow = (srcCols: ColumnInfo[], dstCols: ColumnInfo[]): RowData => {
    const sourceVals: Record<string, string> = {};
    srcCols.forEach(c => { sourceVals[c.field] = ''; });
    const destVals: Record<string, string> = {};
    dstCols.forEach(c => { destVals[c.field] = ''; });
    return { sourceVals, destVals };
  };

  // Sync rows array when rowCount changes
  useEffect(() => {
    setRowsData(prev => {
      const newRows = [...prev];
      // Grow or shrink to match rowCount
      while (newRows.length < rowCount) {
        newRows.push(makeEmptyRow(sourceCols, destCols));
      }
      if (newRows.length > rowCount) {
        newRows.length = rowCount;
      }
      return newRows;
    });
    // Clamp active row
    if (activeRowIdx >= rowCount) {
      setActiveRowIdx(Math.max(0, rowCount - 1));
    }
  }, [rowCount]);

  useEffect(() => {
    fetch('http://localhost:8081/api/db/tables')
      .then(res => res.json())
      .then(data => setTablesList(data))
      .catch(err => console.error("Error fetching tables:", err));

    fetchConfigs();
  }, []);

  const fetchConfigs = () => {
    fetch('http://localhost:8081/api/config/list-dynamic')
      .then(res => res.json())
      .then(data => setSavedConfigs(data || []))
      .catch(err => console.error("Error fetching configs:", err));
  };

  const handleSourceTableChange = (table: string) => {
    setSourceTable(table);
    if (!table) {
      setSourceCols([]);
      setRowsData(prev => prev.map(r => ({ ...r, sourceVals: {} })));
      return;
    }
    fetch(`http://localhost:8081/api/db/columns?table=${table}`)
      .then(res => res.json())
      .then((cols: ColumnInfo[]) => {
        setSourceCols(cols);
        // Initialize all rows with empty source values for new columns
        setRowsData(prev => {
          const updated = prev.map(row => {
            const sourceVals: Record<string, string> = {};
            cols.forEach(c => { sourceVals[c.field] = ''; });
            return { ...row, sourceVals };
          });
          // Ensure we have enough rows
          while (updated.length < rowCount) {
            updated.push(makeEmptyRow(cols, destCols));
          }
          return updated;
        });
      })
      .catch(err => console.error(err));
  };

  const handleDestTableChange = (table: string) => {
    setDestTable(table);
    if (!table) {
      setDestCols([]);
      setRowsData(prev => prev.map(r => ({ ...r, destVals: {} })));
      return;
    }
    fetch(`http://localhost:8081/api/db/columns?table=${table}`)
      .then(res => res.json())
      .then((cols: ColumnInfo[]) => {
        setDestCols(cols);
        // Initialize all rows with empty dest values for new columns
        setRowsData(prev => {
          const updated = prev.map(row => {
            const destVals: Record<string, string> = {};
            cols.forEach(c => { destVals[c.field] = ''; });
            return { ...row, destVals };
          });
          while (updated.length < rowCount) {
            updated.push(makeEmptyRow(sourceCols, cols));
          }
          return updated;
        });
      })
      .catch(err => console.error(err));
  };

  const handleSelectConfig = (cfg: SavedConfig) => {
    setActiveConfigId(cfg.id);
    setTestName(cfg.name);
    setSourceTable(cfg.source_table);
    setDestTable(cfg.destination_table);

    const parsed = JSON.parse(cfg.config_json);
    const rc = parsed.row_count || 5;
    setRowCount(rc);
    setTimeoutSec(parsed.timeout_seconds || 15);
    setSimulateEtl(parsed.simulate_etl !== undefined ? parsed.simulate_etl : true);

    // Load per-row data from saved config
    const savedRows: RowData[] = parsed.rows || [];

    fetch(`http://localhost:8081/api/db/columns?table=${cfg.source_table}`)
      .then(res => res.json())
      .then((srcCols: ColumnInfo[]) => {
        setSourceCols(srcCols);
        return fetch(`http://localhost:8081/api/db/columns?table=${cfg.destination_table}`);
      })
      .then(res => res.json())
      .then((dstCols: ColumnInfo[]) => {
        setDestCols(dstCols);
        // Build rows from saved data, padding with empties
        const rows: RowData[] = [];
        for (let i = 0; i < rc; i++) {
          if (savedRows[i]) {
            rows.push(savedRows[i]);
          } else {
            rows.push(makeEmptyRow(sourceCols, dstCols));
          }
        }
        setRowsData(rows);
        setActiveRowIdx(0);
      })
      .catch(err => console.error(err));
  };

  const handleNewConfig = () => {
    setActiveConfigId(null);
    setTestName('');
    setSourceTable('');
    setDestTable('');
    setRowCount(5);
    setTimeoutSec(15);
    setSimulateEtl(true);
    setSourceCols([]);
    setDestCols([]);
    setRowsData([]);
    setActiveRowIdx(0);
  };

  // Update a source value for the active row
  const updateSourceVal = (field: string, val: string) => {
    setRowsData(prev => prev.map((row, idx) =>
      idx === activeRowIdx
        ? { ...row, sourceVals: { ...row.sourceVals, [field]: val } }
        : row
    ));
  };

  // Update a dest value for the active row
  const updateDestVal = (field: string, val: string) => {
    setRowsData(prev => prev.map((row, idx) =>
      idx === activeRowIdx
        ? { ...row, destVals: { ...row.destVals, [field]: val } }
        : row
    ));
  };

  // Check if a row has any filled fields
  const isRowFilled = (row: RowData): boolean => {
    const hasSrc = Object.values(row.sourceVals).some(v => v !== '');
    const hasDst = Object.values(row.destVals).some(v => v !== '');
    return hasSrc || hasDst;
  };

  const handleSave = () => {
    if (!testName || !sourceTable || !destTable) {
      showMsg('Please fill in Test Name, Source Table, and Destination Table', 'err');
      return;
    }

    const payload = {
      id: activeConfigId,
      name: testName,
      source_table: sourceTable,
      dest_table: destTable,
      config_json: {
        row_count: rowCount,
        timeout_seconds: timeoutSec,
        source_table: sourceTable,
        dest_table: destTable,
        rows: rowsData,
        simulate_etl: simulateEtl
      }
    };

    fetch('http://localhost:8081/api/config/save-dynamic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showMsg('Configuration saved to MySQL successfully!', 'ok');
          fetchConfigs();
          handleNewConfig();
        } else {
          showMsg('Failed to save configuration', 'err');
        }
      })
      .catch(err => {
        showMsg('Server connection failed', 'err');
        console.error(err);
      });
  };

  const currentRow = rowsData[activeRowIdx] || { sourceVals: {}, destVals: {} };

  return (
    <div className="body-wrap">
      {/* ── SIDEBAR ── */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">Dynamic Tests</div>
          <button className="add-row-btn" style={{ width: '100%', marginTop: 8 }} onClick={handleNewConfig}>
            <Plus size={12} style={{ marginRight: 4 }} /> NEW CONFIG
          </button>
        </div>

        <div className="sidebar-list">
          {savedConfigs.map(c => {
            const isActive = c.id === activeConfigId;
            return (
              <div
                key={c.id}
                className={`tbl-item ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectConfig(c)}
              >
                <div className="tbl-item-icon">CFG</div>
                <div className="tbl-item-body">
                  <div className="tbl-item-name">{c.name}</div>
                  <div className="tbl-item-sub">{c.source_table} ➔ {c.destination_table}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAIN CONFIG AREA ── */}
      <div className="main-panel">
        <div className="cfg-panel">
          <div className="cfg-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="cfg-tbl-name">
                  {activeConfigId ? `Config ID: ${activeConfigId}` : 'New Dynamic Configuration'}
                </div>
              </div>
              <div className="cfg-tbl-rules" style={{ marginTop: 3 }}>
                Configure source insertions and destination expected values for each test row.
              </div>
            </div>
          </div>

          <div className="form-area" style={{ padding: 20 }}>
            {/* 1. Meta Fields Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr', gap: 15, marginBottom: 20 }}>
              <div className="col-field required">
                <div className="col-label">
                  <span className="col-required-star">★</span>
                  <span className="col-label-name required">TEST NAME</span>
                </div>
                <input
                  className="col-input"
                  type="text"
                  placeholder="e.g. Replication Verification Test"
                  value={testName}
                  onChange={e => setTestName(e.target.value)}
                />
              </div>

              <div className="col-field required">
                <div className="col-label">
                  <span className="col-required-star">★</span>
                  <span className="col-label-name required">ROW COUNT</span>
                </div>
                <input
                  className="col-input"
                  type="number"
                  min="1"
                  max="100"
                  value={rowCount}
                  onChange={e => setRowCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="col-field required">
                <div className="col-label">
                  <span className="col-required-star">★</span>
                  <span className="col-label-name required">TIMEOUT (SEC)</span>
                </div>
                <input
                  className="col-input"
                  type="number"
                  min="1"
                  max="300"
                  value={timeoutSec}
                  onChange={e => setTimeoutSec(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="col-field required" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', height: '100%', marginTop: 20 }}>
                  <input
                    type="checkbox"
                    checked={simulateEtl}
                    onChange={e => setSimulateEtl(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--cyan)' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 'bold', letterSpacing: '0.05em' }}>SIMULATE replication</span>
                </label>
              </div>
            </div>

            {/* 2. Tables Dropdown Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div className="col-field required">
                <div className="col-label">
                  <span className="col-required-star">★</span>
                  <span className="col-label-name required">SOURCE TABLE</span>
                </div>
                <select
                  className="col-input"
                  style={{ background: 'var(--bg4)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  value={sourceTable}
                  onChange={e => handleSourceTableChange(e.target.value)}
                >
                  <option value="">-- Select Source Table --</option>
                  {tablesList.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="col-field required">
                <div className="col-label">
                  <span className="col-required-star">★</span>
                  <span className="col-label-name required">DESTINATION TABLE</span>
                </div>
                <select
                  className="col-input"
                  style={{ background: 'var(--bg4)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  value={destTable}
                  onChange={e => handleDestTableChange(e.target.value)}
                >
                  <option value="">-- Select Destination Table --</option>
                  {tablesList.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Row Selector Tabs */}
            {(sourceCols.length > 0 || destCols.length > 0) && (
              <>
                <div className="row-tabs-bar">
                  <button
                    className="row-nav-btn"
                    disabled={activeRowIdx === 0}
                    onClick={() => setActiveRowIdx(prev => Math.max(0, prev - 1))}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <div className="row-tabs-scroll">
                    {Array.from({ length: rowCount }).map((_, i) => {
                      const row = rowsData[i];
                      const filled = row ? isRowFilled(row) : false;
                      return (
                        <button
                          key={i}
                          className={`row-tab ${i === activeRowIdx ? 'active' : ''} ${filled ? 'filled' : ''}`}
                          onClick={() => setActiveRowIdx(i)}
                        >
                          ROW {i + 1}
                          {filled && <span className="row-tab-dot"></span>}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="row-nav-btn"
                    disabled={activeRowIdx >= rowCount - 1}
                    onClick={() => setActiveRowIdx(prev => Math.min(rowCount - 1, prev + 1))}
                  >
                    <ChevronRight size={14} />
                  </button>
                  <div className="row-tab-info">
                    {activeRowIdx + 1} / {rowCount}
                  </div>
                </div>

                {/* 4. Per-Row Column Value Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {/* Source Column Values for active row */}
                  <div className="form-section source" style={{ padding: 15 }}>
                    <div className="section-head open" style={{ borderBottom: '1px solid var(--border)', marginBottom: 15 }}>
                      <div className="section-type-tag">SOURCE — ROW {activeRowIdx + 1}</div>
                    </div>
                    <div className="cols-grid" style={{ gridTemplateColumns: '1fr' }}>
                      {sourceCols.map(c => (
                        <div key={c.field} className="col-field">
                          <div className="col-label">
                            <span className="col-label-name required">{c.field}</span>
                            <span className="col-dtype-tag">{c.type}</span>
                          </div>
                          <input
                            className="col-input"
                            type="text"
                            placeholder={`Enter ${c.field} value`}
                            value={currentRow.sourceVals[c.field] || ''}
                            onChange={e => updateSourceVal(c.field, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Destination Expected Values for active row */}
                  <div className="form-section output" style={{ padding: 15 }}>
                    <div className="section-head open" style={{ borderBottom: '1px solid var(--border)', marginBottom: 15 }}>
                      <div className="section-type-tag">EXPECTED DESTINATION — ROW {activeRowIdx + 1}</div>
                    </div>
                    {destCols.length === 0 ? (
                      <div style={{ color: 'var(--text3)', fontStyle: 'italic', fontSize: 12 }}>Select a destination table to map columns</div>
                    ) : (
                      <div className="cols-grid" style={{ gridTemplateColumns: '1fr' }}>
                        {destCols.map(c => (
                          <div key={c.field} className="col-field">
                            <div className="col-label">
                              <span className="col-label-name required">{c.field}</span>
                              <span className="col-dtype-tag">{c.type}</span>
                            </div>
                            <input
                              className="col-input"
                              type="text"
                              placeholder={`Enter expected ${c.field}`}
                              value={currentRow.destVals[c.field] || ''}
                              onChange={e => updateDestVal(c.field, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="form-footer">
            <button className="save-all-btn" onClick={handleSave}>
              {activeConfigId ? 'UPDATE CONFIGURATION' : 'SAVE NEW CONFIGURATION'}
            </button>
            <div className={`footer-msg ${footerMsg.type}`} style={{ marginLeft: 15 }}>
              {footerMsg.type === 'ok' && <Check size={12} style={{ display: 'inline', marginRight: 4 }} />}
              {footerMsg.type === 'err' && <AlertCircle size={12} style={{ display: 'inline', marginRight: 4 }} />}
              {footerMsg.text}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigureDbTests;
