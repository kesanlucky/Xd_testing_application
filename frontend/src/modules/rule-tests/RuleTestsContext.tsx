import React, { createContext, useContext, useState } from 'react';

export interface RuleTable {
  id: number;
  name: string;
  db: string;
  rules: number;
  rows: number;
  configured: 'configured' | 'partial' | 'unconfigured';
  state: 'idle' | 'running' | 'pass' | 'fail';
  pass: number;
  fail: number;
  failures: Array<{
    rule: string;
    row: number;
    expected: string;
    got: string;
    col: string;
  }>;
}

interface RuleTestsContextType {
  ruleTables: RuleTable[];
  runRuleTable: (id: number) => void;
  stopRuleTable: (id: number) => void;
  runAllRuleTables: () => void;
  updateRuleTablesSummary: () => { pass: number; fail: number };
}

const RuleTestsContext = createContext<RuleTestsContextType | undefined>(undefined);

export const RuleTestsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ruleTables, setRuleTables] = useState<RuleTable[]>([
    { id: 0, name: 'customers', db: 'xstreami_testing', rules: 14, rows: 5, configured: 'configured', state: 'idle', pass: 0, fail: 0, failures: [] },
    { id: 1, name: 'orders', db: 'xstreami_testing', rules: 8, rows: 5, configured: 'configured', state: 'idle', pass: 0, fail: 0, failures: [] },
    { id: 2, name: 'transactions', db: 'xstreami_testing', rules: 11, rows: 5, configured: 'partial', state: 'idle', pass: 0, fail: 0, failures: [] },
    { id: 3, name: 'payments', db: 'xstreami_testing', rules: 6, rows: 5, configured: 'unconfigured', state: 'idle', pass: 0, fail: 0, failures: [] },
    { id: 4, name: 'ref_complex', db: 'xstreami_testing', rules: 4, rows: 5, configured: 'configured', state: 'idle', pass: 0, fail: 0, failures: [] }
  ]);

  const fakeFails = [
    { rule: 'calc_discount', row: 2, expected: '50.00', got: '48.50', col: 'decvalue5' },
    { rule: 'assign_tier', row: 4, expected: '"platinum"', got: '"gold"', col: 'strvalue2' },
    { rule: 'flag_high_value', row: 2, expected: 'true', got: 'false', col: 'numvalue1' }
  ];

  const runRuleTable = (id: number) => {
    const table = ruleTables.find(t => t.id === id);
    if (!table || table.state === 'running' || table.configured === 'unconfigured') return;

    setRuleTables(prev => prev.map(t => t.id === id ? { ...t, state: 'running', pass: 0, fail: 0, failures: [] } : t));

    let rowDone = 0;
    const totalRows = table.rows;

    const interval = setInterval(() => {
      rowDone++;
      const isFailedRow = id === 0 && rowDone === 2; // Row 2 failure simulation on customers table

      setRuleTables(prev => prev.map(t => {
        if (t.id === id) {
          const passIncrement = isFailedRow ? 0 : 1;
          const failIncrement = isFailedRow ? 1 : 0;
          const currentFailures = isFailedRow ? fakeFails : t.failures;

          if (rowDone >= totalRows) {
            clearInterval(interval);
            return {
              ...t,
              pass: t.pass + passIncrement,
              fail: t.fail + failIncrement,
              failures: currentFailures,
              state: (t.fail + failIncrement) > 0 ? 'fail' : 'pass'
            };
          }
          return {
            ...t,
            pass: t.pass + passIncrement,
            fail: t.fail + failIncrement,
            failures: currentFailures
          };
        }
        return t;
      }));
    }, 500);
  };

  const stopRuleTable = (id: number) => {
    setRuleTables(prev => prev.map(t => t.id === id ? { ...t, state: 'idle' } : t));
  };

  const runAllRuleTables = () => {
    ruleTables
      .filter(t => t.configured !== 'unconfigured')
      .forEach((t, i) => {
        setTimeout(() => runRuleTable(t.id), i * 600);
      });
  };

  const updateRuleTablesSummary = () => {
    const pass = ruleTables.filter(t => t.state === 'pass').length;
    const fail = ruleTables.filter(t => t.state === 'fail').length;
    return { pass, fail };
  };

  return (
    <RuleTestsContext.Provider value={{
      ruleTables,
      runRuleTable,
      stopRuleTable,
      runAllRuleTables,
      updateRuleTablesSummary
    }}>
      {children}
    </RuleTestsContext.Provider>
  );
};

export const useRuleTests = () => {
  const context = useContext(RuleTestsContext);
  if (!context) {
    throw new Error('useRuleTests must be used within a RuleTestsProvider');
  }
  return context;
};
