import React, { createContext, useContext, useState } from 'react';

// Types for the configure form
export interface Column {
  name: string;
  type: string;
  required: boolean;
}

export interface SeedTable {
  name: string;
  db: string;
  joinHint: string;
  cols: Column[];
}

export interface OutputColumn {
  name: string;
  type: string;
  derivedFrom: string;
}

export interface ConfigTable {
  id: number;
  name: string;
  db: string;
  status: 'configured' | 'partial' | 'unconfigured';
  rules: number;
  defaultRows: number;
  sourceCols: Column[];
  seedTables: SeedTable[];
  outputCols: OutputColumn[];
  rows: Array<{
    srcVals: Record<string, string>;
    seedVals: Record<string, Record<string, string>>;
    outVals: Record<string, string>;
    outSkips: Record<string, boolean>;
  }>;
}

interface DbTestsContextType {
  // Configure data
  configTables: ConfigTable[];
  activeTableId: number;
  setActiveTableId: (id: number) => void;
  activeRowIdx: number;
  setActiveRowIdx: (idx: number) => void;
  updateFieldVal: (prefix: string, colName: string, val: string) => void;
  updateOutputVal: (colName: string, val: string) => void;
  updateSkipVal: (colName: string, checked: boolean) => void;
  addRowToTable: () => void;
  saveRowConfig: () => { success: boolean; msg: string };
  saveAllRowsConfig: () => { success: boolean; msg: string };
}

const DbTestsContext = createContext<DbTestsContextType | undefined>(undefined);

export const DbTestsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialConfigTables: ConfigTable[] = [
    {
      id: 0, name: 'customers', db: 'xstreami_testing', status: 'partial',
      rules: 14, defaultRows: 5,
      sourceCols: [
        { name: 'id', type: 'int', required: true },
        { name: 'email', type: 'varchar', required: true },
        { name: 'first_name', type: 'varchar', required: false },
        { name: 'last_name', type: 'varchar', required: false },
        { name: 'phone', type: 'varchar', required: false },
        { name: 'country', type: 'varchar', required: false },
        { name: 'tier', type: 'varchar', required: true },
        { name: 'spend', type: 'decimal', required: true },
        { name: 'age', type: 'int', required: false },
        { name: 'status', type: 'varchar', required: false },
        { name: 'created_at', type: 'datetime', required: false },
        { name: 'numvalue1', type: 'int', required: false },
        { name: 'decvalue1', type: 'decimal', required: true },
        { name: 'jsonvalue1', type: 'json', required: false }
      ],
      seedTables: [
        {
          name: 'ref_complex', db: 'xstreami_testing',
          joinHint: 't1.ref_id = customers.id',
          cols: [
            { name: 'ref_id', type: 'int', required: true },
            { name: 'strvalue1', type: 'varchar', required: true },
            { name: 'decvalue3', type: 'decimal', required: true },
            { name: 'numvalue5', type: 'int', required: false },
            { name: 'jsonvalue1', type: 'json', required: false }
          ]
        }
      ],
      outputCols: [
        { name: 'nameFromEmail', type: 'varchar', derivedFrom: "substring_index(strvalue1,'@',1)" },
        { name: 'tier_code', type: 'varchar', derivedFrom: 'assign_tier rule' }
      ],
      rows: []
    },
    {
      id: 1, name: 'orders', db: 'xstreami_testing', status: 'configured',
      rules: 8, defaultRows: 5,
      sourceCols: [
        { name: 'id', type: 'int', required: true },
        { name: 'customer_id', type: 'int', required: true },
        { name: 'amount', type: 'decimal', required: true },
        { name: 'status', type: 'varchar', required: false },
        { name: 'created_at', type: 'datetime', required: false },
        { name: 'numvalue2', type: 'int', required: true },
        { name: 'decvalue2', type: 'decimal', required: false }
      ],
      seedTables: [
        {
          name: 'ref_reference1', db: 'xstreami_testing',
          joinHint: 't1.order_id = orders.id',
          cols: [
            { name: 'order_id', type: 'int', required: true },
            { name: 'replacewords', type: 'varchar', required: true },
            { name: 'value1', type: 'decimal', required: false }
          ]
        },
        {
          name: 'ref_complex', db: 'xstreami_testing',
          joinHint: 't1.ref_id = orders.customer_id',
          cols: [
            { name: 'ref_id', type: 'int', required: true },
            { name: 'decvalue1', type: 'decimal', required: true },
            { name: 'strvalue3', type: 'varchar', required: false }
          ]
        }
      ],
      outputCols: [
        { name: 'strvalue2', type: 'varchar', derivedFrom: 'assign_tier rule' }
      ],
      rows: []
    },
    {
      id: 2, name: 'transactions', db: 'xstreami_testing', status: 'unconfigured',
      rules: 11, defaultRows: 5,
      sourceCols: [
        { name: 'id', type: 'int', required: true },
        { name: 'order_id', type: 'int', required: true },
        { name: 'amount', type: 'decimal', required: true },
        { name: 'type', type: 'varchar', required: true },
        { name: 'status', type: 'varchar', required: false },
        { name: 'numvalue4', type: 'int', required: true },
        { name: 'decvalue5', type: 'decimal', required: true },
        { name: 'strvalue3', type: 'varchar', required: true },
        { name: 'jsonvalue1', type: 'json', required: false }
      ],
      seedTables: [],
      outputCols: [
        { name: 'strvalue5', type: 'varchar', derivedFrom: 'complex if_case rule' },
        { name: 'numvalue5', type: 'int', derivedFrom: 'ordinal_day x-operation' }
      ],
      rows: []
    },
    {
      id: 3, name: 'payments', db: 'xstreami_testing', status: 'unconfigured',
      rules: 6, defaultRows: 5,
      sourceCols: [
        { name: 'id', type: 'int', required: true },
        { name: 'txn_id', type: 'int', required: true },
        { name: 'amount', type: 'decimal', required: true },
        { name: 'method', type: 'varchar', required: false },
        { name: 'numvalue8', type: 'int', required: true },
        { name: 'numvalue9', type: 'int', required: true }
      ],
      seedTables: [],
      outputCols: [
        { name: 'numvalue15', type: 'int', derivedFrom: 'if_case numvalue8 between 50-60' }
      ],
      rows: []
    },
    {
      id: 4, name: 'ref_complex', db: 'xstreami_testing', status: 'configured',
      rules: 4, defaultRows: 5,
      sourceCols: [
        { name: 'ref_id', type: 'int', required: true },
        { name: 'strvalue1', type: 'varchar', required: true },
        { name: 'decvalue3', type: 'decimal', required: false },
        { name: 'numvalue5', type: 'int', required: false },
        { name: 'jsonvalue2', type: 'json', required: false }
      ],
      seedTables: [],
      outputCols: [
        { name: 'strvalue20', type: 'varchar', derivedFrom: 'concat x-operation' }
      ],
      rows: []
    }
  ];

  const makeEmptyRow = (t: ConfigTable) => {
    const srcVals: Record<string, string> = {};
    t.sourceCols.forEach(c => { srcVals[c.name] = ''; });

    const seedVals: Record<string, Record<string, string>> = {};
    t.seedTables.forEach(s => {
      seedVals[s.name] = {};
      s.cols.forEach(c => { seedVals[s.name][c.name] = ''; });
    });

    const outVals: Record<string, string> = {};
    const outSkips: Record<string, boolean> = {};
    t.outputCols.forEach(c => {
      outVals[c.name] = '';
      outSkips[c.name] = false;
    });

    return { srcVals, seedVals, outVals, outSkips };
  };

  // Pre-populate empty rows
  const prePopulated = initialConfigTables.map(t => {
    const rows = [];
    for (let i = 0; i < t.defaultRows; i++) {
      rows.push(makeEmptyRow(t));
    }
    return { ...t, rows };
  });

  const [configTables, setConfigTables] = useState<ConfigTable[]>(prePopulated);
  const [activeTableId, setActiveTableId] = useState<number>(-1);
  const [activeRowIdx, setActiveRowIdx] = useState<number>(0);

  // Field change
  const updateFieldVal = (prefix: string, colName: string, val: string) => {
    setConfigTables(prev => prev.map(t => {
      if (t.id === activeTableId) {
        const updatedRows = t.rows.map((row, rIdx) => {
          if (rIdx === activeRowIdx) {
            if (prefix === 'src') {
              return { ...row, srcVals: { ...row.srcVals, [colName]: val } };
            } else if (prefix.startsWith('seed_')) {
              const tblName = prefix.replace('seed_', '');
              return {
                ...row,
                seedVals: {
                  ...row.seedVals,
                  [tblName]: { ...row.seedVals[tblName], [colName]: val }
                }
              };
            }
          }
          return row;
        });
        return { ...t, rows: updatedRows };
      }
      return t;
    }));
  };

  const updateOutputVal = (colName: string, val: string) => {
    setConfigTables(prev => prev.map(t => {
      if (t.id === activeTableId) {
        const updatedRows = t.rows.map((row, rIdx) => {
          if (rIdx === activeRowIdx) {
            return { ...row, outVals: { ...row.outVals, [colName]: val } };
          }
          return row;
        });
        return { ...t, rows: updatedRows };
      }
      return t;
    }));
  };

  const updateSkipVal = (colName: string, checked: boolean) => {
    setConfigTables(prev => prev.map(t => {
      if (t.id === activeTableId) {
        const updatedRows = t.rows.map((row, rIdx) => {
          if (rIdx === activeRowIdx) {
            return { ...row, outSkips: { ...row.outSkips, [colName]: checked } };
          }
          return row;
        });
        return { ...t, rows: updatedRows };
      }
      return t;
    }));
  };

  const addRowToTable = () => {
    setConfigTables(prev => prev.map(t => {
      if (t.id === activeTableId) {
        const newRow = makeEmptyRow(t);
        const nextRows = [...t.rows, newRow];
        setActiveRowIdx(nextRows.length - 1);
        return { ...t, rows: nextRows };
      }
      return t;
    }));
  };

  const getMissingRequired = (t: ConfigTable, rowIdx: number) => {
    const row = t.rows[rowIdx];
    const missing: string[] = [];

    t.sourceCols.forEach(c => {
      if (c.required && (!row.srcVals[c.name] || row.srcVals[c.name] === '')) {
        missing.push(c.name);
      }
    });

    t.seedTables.forEach(s => {
      s.cols.forEach(c => {
        if (c.required) {
          const sv = row.seedVals[s.name];
          if (!sv || !sv[c.name] || sv[c.name] === '') {
            missing.push(`${s.name}.${c.name}`);
          }
        }
      });
    });

    t.outputCols.forEach(c => {
      if (!row.outSkips[c.name] && (!row.outVals[c.name] || row.outVals[c.name] === '')) {
        missing.push(`${c.name} (expected)`);
      }
    });

    return missing;
  };

  const saveRowConfig = () => {
    const t = configTables.find(tbl => tbl.id === activeTableId);
    if (!t) return { success: false, msg: 'No active table selected' };

    const missing = getMissingRequired(t, activeRowIdx);
    if (missing.length > 0) {
      const displayMsg = `Fill required: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` +${missing.length - 3} more` : ''}`;
      return { success: false, msg: displayMsg };
    }

    // Update table status
    updateTableStatus(activeTableId);
    return { success: true, msg: `Row ${activeRowIdx + 1} saved successfully` };
  };

  const saveAllRowsConfig = () => {
    const t = configTables.find(tbl => tbl.id === activeTableId);
    if (!t) return { success: false, msg: 'No active table selected' };

    const allMissing: string[] = [];
    for (let i = 0; i < t.rows.length; i++) {
      const m = getMissingRequired(t, i);
      if (m.length > 0) {
        allMissing.push(`Row ${i + 1}`);
      }
    }

    if (allMissing.length > 0) {
      return { success: false, msg: `Incomplete fields: ${allMissing.join(', ')}` };
    }

    // Set complete status
    setConfigTables(prev => prev.map(tbl => tbl.id === activeTableId ? { ...tbl, status: 'configured' } : tbl));

    return { success: true, msg: `All ${t.rows.length} rows saved successfully` };
  };

  const updateTableStatus = (tblId: number) => {
    setConfigTables(prev => prev.map(tbl => {
      if (tbl.id === tblId) {
        let allDone = true;
        for (let i = 0; i < tbl.rows.length; i++) {
          if (getMissingRequired(tbl, i).length > 0) {
            allDone = false;
            break;
          }
        }
        const nextStatus = allDone ? 'configured' : 'partial';
        return { ...tbl, status: nextStatus };
      }
      return tbl;
    }));
  };

  return (
    <DbTestsContext.Provider value={{
      configTables,
      activeTableId,
      setActiveTableId,
      activeRowIdx,
      setActiveRowIdx,
      updateFieldVal,
      updateOutputVal,
      updateSkipVal,
      addRowToTable,
      saveRowConfig,
      saveAllRowsConfig
    }}>
      {children}
    </DbTestsContext.Provider>
  );
};

export const useDbTests = () => {
  const context = useContext(DbTestsContext);
  if (!context) {
    throw new Error('useDbTests must be used within a DbTestsProvider');
  }
  return context;
};
