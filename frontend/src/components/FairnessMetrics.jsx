import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Download, RefreshCw, AlertTriangle, CheckCircle, Info, AlertCircle, HelpCircle, Database } from 'lucide-react';
import { SPDEOppChart } from './Charts';

/* ─── helpers ──────────────────────────────────────────── */
const pct = (v) => (v * 100).toFixed(1) + '%';
const sgn = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);

const severityColor = (absVal) => {
  if (absVal > 0.1) return 'var(--toxic)';
  if (absVal > 0.05) return 'var(--tertiary)';
  return 'var(--non-toxic)';
};

const SeverityBadge = ({ value }) => {
  const abs = Math.abs(value);
  const color = severityColor(abs);
  const label = abs > 0.1 ? 'High' : abs > 0.05 ? 'Medium' : 'Low';
  return (
    <span style={{
      fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px',
      backgroundColor: `${color}22`, color, border: `1px solid ${color}40`
    }}>
      {label}
    </span>
  );
};

/* ─── Formula legend ────────────────────────────────────── */
const FormulaLegend = () => (
  <div style={{
    backgroundColor: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
    borderRadius: '8px', padding: '16px', marginBottom: '24px', fontSize: '13px'
  }}>
    <div style={{ fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Info size={15} /> Disparity Metric Formulas (from Reference Plan §1.4.2)
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
      <div>
        <div style={{ fontWeight: '600', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>Demographic Parity (SPD & Ratio)</div>
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
          Difference = SR(A=1) − SR(A=0) | Ratio = min(SR)/max(SR)
        </code>
        <div style={{ color: 'var(--on-surface-variant)', marginTop: '4px', lineHeight: 1.5 }}>
          Compares <strong>Selection Rate (SR)</strong> — how often the model predicts Toxic.<br/>
          Ideal: Difference = 0, Ratio = 1.
        </div>
      </div>
      <div>
        <div style={{ fontWeight: '600', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>Equal Opportunity (EOpp)</div>
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
          EOpp = TPR(A=1) − TPR(A=0)
        </code>
        <div style={{ color: 'var(--on-surface-variant)', marginTop: '4px', lineHeight: 1.5 }}>
          Difference in <strong>True Positive Rate</strong>. Measures if the model is<br/>
          equally good at catching toxic content across groups.
        </div>
      </div>
    </div>
  </div>
);

/* ─── Tooltip definitions for each metric ──────────────── */
const METRIC_INFO = {
  Accuracy: { formula: '(TP + TN) / Total', plain: 'Overall accuracy across subgroups.', ideal: '1.0' },
  'F1 Score': { formula: 'Harmonic Mean of P & R', plain: 'Balance of precision and recall.', ideal: '1.0' },
  Precision: { formula: 'TP / (TP + FP)', plain: 'Ratio of true positives in positive predictions.', ideal: '1.0' },
  'Recall / TPR': { formula: 'TP / (TP + FN)', plain: 'Ratio of actual positives caught.', ideal: '1.0' },
  FPR: { formula: 'FP / (FP + TN)', plain: 'Ratio of Safe comments incorrectly flagged.', ideal: '0.0' },
  'Selection Rate': { formula: '(TP + FP) / Total', plain: 'How often model predicts Toxic.', ideal: 'Dataset Dependent' },
  SPD: { formula: 'SR(A=1) - SR(A=0)', plain: 'Demographic Parity Difference.', ideal: '0.0' },
  EOpp: { formula: 'TPR(A=1) - TPR(A=0)', plain: 'Recall Parity Difference.', ideal: '0.0' },
};

/* ─── Tooltip component ─────────────────────────────────── */
const Tooltip = ({ info, children }) => {
  const [show, setShow] = useState(false);
  if (!info) return children;
  return (
    <div 
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', display: 'contents' }}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', zIndex: 100, backgroundColor: 'var(--surface)',
          padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-variant)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px', width: '200px'
        }}>
          <strong>Formula:</strong> {info.formula}<br/>
          <strong>Meaning:</strong> {info.plain}
        </div>
      )}
    </div>
  );
};

/* ─── Stat card ─────────────────────────────────────────── */
const StatCard = ({ label, value, color = 'var(--primary)', description, unavailable, tooltipKey }) => {
  const info = METRIC_INFO[tooltipKey || label];
  return (
    <div style={{
      flex: 1, minWidth: '140px', padding: '16px', borderRadius: '8px',
      backgroundColor: 'var(--surface-container-lowest)',
      border: `2px solid ${unavailable ? 'var(--outline-variant)' : color + '40'}`,
      opacity: unavailable ? 0.55 : 1
    }}>
      <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>{label}</div>
      {unavailable
        ? <div style={{ fontSize: '18px', fontWeight: '600' }}>N/A</div>
        : <div style={{ fontSize: '24px', fontWeight: '700', color }}>{typeof value === 'number' ? pct(value) : value}</div>
      }
      {description && <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>{description}</div>}
    </div>
  );
};

/* ─── Per-group row inside expandable section ────────────── */
const GroupRow = ({ label, m }) => {
  if (!m) return null;
  return (
    <tr style={{ borderBottom: '1px solid var(--surface-container-highest)' }}>
      <td style={{ padding: '8px 12px', fontWeight: '500', fontSize: '13px' }}>{label}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{m.n}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{pct(m.accuracy)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{pct(m.f1)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{pct(m.tpr)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{pct(m.fpr)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{pct(m.ppr)}</td>
    </tr>
  );
};

/* ─── Main component ─────────────────────────────────────── */
const FairnessMetrics = ({ onDeepDive, isScanning, setIsScanning, scanningFileId, setScanningFileId }) => {
  const [metrics, setMetrics]           = useState(null);
  const [files, setFiles]               = useState([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [loading, setLoading]           = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [model, setModel]               = useState('meta/llama-3.1-8b-instruct');
  const [scanProgress, setScanProgress] = useState(null);

  const AVAILABLE_MODELS = [
    { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (Fastest)' },
    { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Recommended)' },
    { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3' },
    { id: 'mistralai/mistral-small-4-119b-2603', name: 'Mistral Small 4' },
    { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B' },
    { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B' },
    { id: 'google/gemma-2-2b-it', name: 'Gemma 2 2B' }
  ];

  const fetchFiles = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8004/files');
      setFiles(res.data);
      if (res.data.length > 0 && !selectedFileId) setSelectedFileId(res.data[0].id.toString());
    } catch (e) { console.error(e); }
  };

  const fetchMetrics = useCallback(async () => {
    if (!selectedFileId) return;
    setLoading(true);
    try {
      const res = await axios.get(`http://127.0.0.1:8004/metrics?file_id=${selectedFileId}`);
      setMetrics(res.data);
    } catch (e) {
      console.error(e);
      setMetrics({ error: 'Failed to fetch metrics.' });
    } finally {
      setLoading(false);
    }
  }, [selectedFileId]);

  useEffect(() => { fetchFiles(); }, []);
  useEffect(() => { if (selectedFileId) fetchMetrics(); }, [selectedFileId]);

  const handleSyncFromLogs = async () => {
    if (!selectedFileId) return;
    setLoading(true);
    try {
      await axios.post(`http://127.0.0.1:8004/sync-from-logs/${selectedFileId}`);
      await fetchMetrics();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScanIdentities = async () => {
    if (isScanning || !selectedFileId) return;
    setIsScanning(true);
    setScanningFileId(selectedFileId);
    setScanProgress({ current: 0, total: 100 });

    const eventSource = new EventSource(`http://127.0.0.1:8004/stream-scan/${selectedFileId}?model=${model}`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'start') setScanProgress({ current: 0, total: data.total });
      else if (data.type === 'progress') setScanProgress(prev => ({ ...prev, current: data.current }));
      else if (data.type === 'complete' || data.done) {
        eventSource.close();
        setIsScanning(false);
        setScanningFileId(null);
        setScanProgress(null);
        fetchMetrics();
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
      setIsScanning(false);
      setScanningFileId(null);
      setScanProgress(null);
    };
  };

  const exportCSV = () => {
    if (!metrics || !metrics.identities) return;
    const header = 'Identity,SPD,EOpp,A1_n,A0_n\n';
    const rows = metrics.identities.map(r => `${r.name},${r.spd},${r.eopp},${r.a1.n},${r.a0.n}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fairness_metrics.csv'; a.click();
  };

  if (loading) return (
    <div className="card" style={{ padding: '64px 0', textAlign: 'center' }}>
      <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
      <p>Computing Fairness Metrics...</p>
    </div>
  );

  if (!metrics) return null;

  const { overall, identities, worst_case, diagnostics } = metrics;
  const hasLabels = metrics.has_labels;
  const minReq = diagnostics?.min_required || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Diagnostics */}
      <div className="card" style={{ padding: '20px', backgroundColor: 'var(--surface-container-low)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={18} style={{ color: 'var(--primary)' }} />
              Data Coverage & Diagnostics
            </div>
            <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
              Coverage across {Object.keys(diagnostics?.group_counts || {}).length} categories.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button className="btn" onClick={handleSyncFromLogs} style={{ border: '1px solid var(--outline-variant)', gap: '8px', display: 'flex' }}>
              <Database size={14} /> 🔄 Sync from Logs
            </button>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ padding: '8px', borderRadius: '4px' }}>
              {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={handleScanIdentities} disabled={isScanning}>
              {isScanning ? 'Scanning...' : '✨ New LLM Scan'}
            </button>
          </div>
        </div>

        {isScanning && scanProgress && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ height: '6px', backgroundColor: 'var(--surface-variant)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: 'var(--primary)', width: `${(scanProgress.current / scanProgress.total) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <select value={selectedFileId} onChange={(e) => setSelectedFileId(e.target.value)} style={{ padding: '8px', borderRadius: '4px' }}>
          {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
        </select>
        <button className="btn btn-primary" onClick={fetchMetrics}><RefreshCw size={14} /> Compute</button>
        <button className="btn" onClick={exportCSV} style={{ border: '1px solid var(--outline-variant)' }}><Download size={14} /> Export</button>
      </div>

      {overall && overall.n > 0 && (
        <>
          <div className="card">
            <div className="card-header"><h2>Overall Performance</h2></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <StatCard label="Accuracy" value={overall.accuracy} unavailable={!hasLabels} />
              <StatCard label="F1 Score" value={overall.f1} unavailable={!hasLabels} />
              <StatCard label="Recall" value={overall.tpr} unavailable={!hasLabels} />
              <StatCard label="Precision" value={overall.precision} unavailable={!hasLabels} />
              <StatCard label="Selection Rate" value={overall.ppr} color="var(--tertiary)" />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Per-Identity Disparity</h2></div>
            <div style={{ padding: '16px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px', marginBottom: '16px' }}>
              <SPDEOppChart identities={identities} />
            </div>
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>SPD (Parity Gap)</th>
                  <th>EOpp (Opportunity Gap)</th>
                  <th>A=1 (n)</th>
                  <th>A=0 (n)</th>
                </tr>
              </thead>
              <tbody>
                {identities.map(row => (
                  <React.Fragment key={row.name}>
                    <tr onClick={() => setExpandedRows(p => ({ ...p, [row.name]: !p[row.name] }))} style={{ cursor: 'pointer' }}>
                      <td>{expandedRows[row.name] ? '▼' : '▶'} {row.name}</td>
                      <td style={{ color: severityColor(Math.abs(row.spd)), fontWeight: '700' }}>{sgn(row.spd)}</td>
                      <td style={{ color: severityColor(Math.abs(row.eopp)), fontWeight: '700' }}>{sgn(row.eopp)}</td>
                      <td>{row.a1.n}</td>
                      <td>{row.a0.n}</td>
                    </tr>
                    {expandedRows[row.name] && (
                      <tr>
                        <td colSpan="5" style={{ padding: '16px', backgroundColor: 'var(--surface-container-lowest)' }}>
                           <table style={{ width: '100%', fontSize: '12px' }}>
                              <thead><tr><th>Subgroup</th><th>n</th><th>Accuracy</th><th>F1</th><th>Recall</th><th>FPR</th><th>Selection</th></tr></thead>
                              <tbody>
                                <GroupRow label="A=1" m={row.a1} />
                                <GroupRow label="A=0" m={row.a0} />
                              </tbody>
                           </table>
                           <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--on-surface-variant)' }}>
                             Showing up to 5 samples from this subgroup...
                           </div>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                             {row.samples?.map((s, i) => (
                               <div key={i} style={{ padding: '8px', backgroundColor: 'var(--surface-container-low)', borderRadius: '4px' }}>
                                 <div style={{ fontWeight: '600' }}>"{s.text}"</div>
                                 <div style={{ fontSize: '11px', opacity: 0.8 }}>LLM Reason: {s.toxicity_rationale}</div>
                               </div>
                             ))}
                           </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-header"><h2>Worst-Case Summary</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="stat-box">
                <div className="label">Max SPD Gap</div>
                <div className="value" style={{ color: severityColor(Math.abs(worst_case.max_spd.value)) }}>{sgn(worst_case.max_spd.value)}</div>
                <div className="subtext">{worst_case.max_spd.identity}</div>
              </div>
              <div className="stat-box">
                <div className="label">Max EOpp Gap</div>
                <div className="value" style={{ color: severityColor(Math.abs(worst_case.max_eopp.value)) }}>{sgn(worst_case.max_eopp.value)}</div>
                <div className="subtext">{worst_case.max_eopp.identity}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FairnessMetrics;
