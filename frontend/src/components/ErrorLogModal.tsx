import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ErrorLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawLog: any; // The specific streamer object containing error_log, audit_log, etc.
}

const ErrorLogModal: React.FC<ErrorLogModalProps> = ({ isOpen, onClose, rawLog }) => {
  if (!rawLog || !rawLog.error_log) return null;

  const err = rawLog.error_log;
  const sourceData = err.extra_info?.source_data || {};
  const rules = rawLog.event_log?.find((e: any) => e.type === 'smart_rule')?.rules || {};

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <motion.div
            className="panel panel-cut"
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90%', maxWidth: '900px', maxHeight: '90vh',
              overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '1.5rem'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ color: 'var(--red)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', backgroundColor: 'rgba(255, 68, 68, 0.1)', border: '1px solid var(--red)', borderRadius: '3px' }}>
                    {err.code}
                  </span>
                  {err.error_type}
                </h2>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{err.message}</div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              
              {/* Left Col: Source Context */}
              <div>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--cyan)', marginBottom: '0.5rem', borderBottom: '1px solid rgba(0, 229, 255, 0.2)', paddingBottom: '0.2rem' }}>
                  SOURCE CONTEXT
                </h3>
                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem' }}>
                  <div><span style={{ color: 'var(--text-dim)' }}>Database:</span> {err.extra_info?.source_database}</div>
                  <div><span style={{ color: 'var(--text-dim)' }}>Table:</span> {err.extra_info?.source_table}</div>
                  <div><span style={{ color: 'var(--text-dim)' }}>Event:</span> <span style={{ color: 'var(--cyan)' }}>{err.extra_info?.source_event?.toUpperCase()}</span></div>
                </div>

                <h3 style={{ fontSize: '0.9rem', color: 'var(--cyan)', marginBottom: '0.5rem', borderBottom: '1px solid rgba(0, 229, 255, 0.2)', paddingBottom: '0.2rem' }}>
                  PAYLOAD DATA
                </h3>
                <pre style={{ 
                  backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '4px', 
                  border: '1px solid var(--border)', fontSize: '0.75rem', overflowX: 'auto',
                  color: '#a5d6ff'
                }}>
                  {JSON.stringify(sourceData, null, 2)}
                </pre>
              </div>

              {/* Right Col: Rule Evaluation */}
              <div>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--yellow)', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255, 184, 0, 0.2)', paddingBottom: '0.2rem' }}>
                  RULE EVALUATION FAILURE
                </h3>
                <div style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Failed Rule ID:</span> {err.extra_info?.rule_id}
                </div>

                {/* Display Failed Queries from event_log -> smart_rule */}
                {Object.keys(rules).map(ruleId => (
                   <div key={ruleId} style={{ marginBottom: '1rem', borderLeft: ruleId === err.extra_info?.rule_id ? '3px solid var(--red)' : '3px solid var(--border)', paddingLeft: '0.8rem' }}>
                     <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>{ruleId}</div>
                     {rules[ruleId].map((step: any, idx: number) => (
                       <div key={idx} style={{ marginBottom: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '3px' }}>
                          {step.query && (
                            <div style={{ fontSize: '0.75rem', color: '#c9d1d9', marginBottom: '0.3rem', fontFamily: 'monospace' }}>
                              {step.query}
                            </div>
                          )}
                          {step.result && (
                            <div style={{ fontSize: '0.75rem', color: typeof step.result === 'string' && step.result.includes('Error') ? 'var(--red)' : 'var(--green)' }}>
                              ► {typeof step.result === 'string' ? step.result : JSON.stringify(step.result)}
                            </div>
                          )}
                       </div>
                     ))}
                   </div>
                ))}
              </div>
            </div>

            {/* Event Timeline */}
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--cyan)', marginBottom: '0.5rem', borderBottom: '1px solid rgba(0, 229, 255, 0.2)', paddingBottom: '0.2rem' }}>
                EVENT PIPELINE TIMELINE
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                {rawLog.event_log?.map((e: any, i: number) => (
                  <div key={i} style={{ 
                    padding: '0.4rem 0.8rem', 
                    backgroundColor: e.type === 'smart_rule' && err ? 'rgba(255, 68, 68, 0.1)' : 'rgba(0, 229, 255, 0.05)',
                    border: e.type === 'smart_rule' && err ? '1px solid var(--red)' : '1px solid rgba(0, 229, 255, 0.2)',
                    borderRadius: '4px',
                    display: 'flex', alignItems: 'center', gap: '0.4rem'
                  }}>
                    <span style={{ color: 'var(--text-dim)' }}>{e.order}.</span>
                    {e.type || (e.event_start_pos ? 'event_start' : 'event_end')}
                  </div>
                ))}
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ErrorLogModal;
