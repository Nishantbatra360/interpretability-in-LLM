import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Download, RefreshCw, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';
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
    <div style={{ marginTop: '12px', color: 'var(--on-surface-variant)', fontSize: '12px' }}>
      <strong>Interpretation:</strong>&nbsp;
      <span style={{ color: 'var(--non-toxic)' }}>● Low (|v| ≤ 0.05)</span>&nbsp;&nbsp;
      <span style={{ color: 'var(--tertiary)' }}>● Medium (0.05 &lt; |v| ≤ 0.10)</span>&nbsp;&nbsp;
      <span style={{ color: 'var(--toxic)' }}>● High (|v| &gt; 0.10)</span>&nbsp; — thresholds per §1.4.3
    </div>
  </div>
);

/* ─── Tooltip definitions for each metric ──────────────── */
const METRIC_INFO = {
  Accuracy: {
    formula: '(TP + TN) / (TP + TN + FP + FN)',
    plain: 'Fraction of all predictions the model got right.',
    ideal: 'Higher is better. 1.0 = perfect.',
    vars: 'TP = True Positive, TN = True Negative, FP = False Positive, FN = False Negative',
    caveat: 'Misleading on imbalanced datasets — a model that always says Non-Toxic can score high accuracy if most comments are non-toxic.',
  },
  'F1 Score': {
    formula: '2 × Precision × Recall / (Precision + Recall)',
    plain: 'Harmonic mean of Precision and Recall. Balances both concerns.',
    ideal: 'Higher is better. 1.0 = perfect. More reliable than Accuracy on imbalanced data.',
    vars: 'Precision = TP/(TP+FP), Recall = TP/(TP+FN)',
    caveat: 'Drops to 0 if either Precision or Recall is 0.',
  },
  Precision: {
    formula: 'TP / (TP + FP)',
    plain: 'Of all comments the model called Toxic, how many actually were?',
    ideal: 'Higher is better. Low precision = too many false alarms.',
    vars: 'TP = True Positive, FP = False Positive',
    caveat: 'Can be gamed by making very few positive predictions.',
  },
  'Recall / TPR': {
    formula: 'TP / (TP + FN)',
    plain: 'Of all actually Toxic comments, how many did the model catch?',
    ideal: 'Higher is better. Low recall = model misses real toxic content.',
    vars: 'TP = True Positive, FN = False Negative',
    caveat: 'Also called Sensitivity or True Positive Rate (TPR).',
  },
  FPR: {
    formula: 'FP / (FP + TN)',
    plain: 'Of all actually Non-Toxic comments, how many did the model incorrectly flag as Toxic?',
    ideal: 'Lower is better. High FPR = model over-flags safe content.',
    vars: 'FP = False Positive, TN = True Negative',
    caveat: 'Used together with TPR in ROC analysis.',
  },
  'Selection Rate': {
    formula: '(TP + FP) / Total',
    plain: 'Fraction of all comments the model predicted as Toxic, regardless of ground truth.',
    ideal: 'Should reflect true base rate of toxicity in data.',
    vars: 'TP = True Positive, FP = False Positive',
    caveat: 'Used in Demographic Parity: comparing Selection Rate across groups.',
  },
  SPD: {
    formula: 'SelectionRate(A=1) − SelectionRate(A=0)',
    plain: 'Demographic Parity Difference. Difference in Toxic prediction rate between groups.',
    ideal: 'Ideal = 0. |SPD| > 0.10 is considered high disparity.',
    vars: 'A=1: identity-present. A=0: identity-absent.',
    caveat: 'Positive SPD means the model predicts Toxic more often for the identity-present group.',
  },
  'Selection Ratio': {
    formula: 'min(SR_A=1, SR_A=0) / max(SR_A=1, SR_A=0)',
    plain: 'Demographic Parity Ratio. Closer to 1.0 means more equal selection rates.',
    ideal: 'Ideal = 1.0. Values below 0.8 (Four-Fifths Rule) indicate potential bias.',
    vars: 'SR = Selection Rate',
    caveat: 'A ratio of 0.5 means one group is twice as likely to be flagged as the other.',
  },
  EOpp: {
    formula: 'TPR(A=1) − TPR(A=0)',
    plain: 'Equal Opportunity Difference. Difference in True Positive Rate between subgroups.',
    ideal: 'Ideal = 0. Non-zero means unequal opportunity to be correctly classified.',
    vars: 'TPR = True Positive Rate = TP / (TP + FN)',
    caveat: 'Negative EOpp means the model is worse at catching actual toxic comments from the A=1 group.',
  },
};

/* ─── Tooltip component ─────────────────────────────────── */
const Tooltip = ({ info, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY + 8,
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 340),
      });
    }
    setShow(true);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', display: 'contents' }}
    >
      {children}
      {show && info && (
        <div style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          zIndex: 9999,
          width: '320px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--outline-variant)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          padding: '14px 16px',
          fontSize: '12px',
          lineHeight: 1.6,
          pointerEvents: 'none',
          animation: 'fadeInTooltip 0.15s ease',
        }}>
          {/* Formula */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '3px', letterSpacing: '0.05em' }}>Formula</div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--primary)', display: 'block', backgroundColor: 'var(--surface-container)', padding: '4px 8px', borderRadius: '4px' }}>
              {info.formula}
            </code>
          </div>
          {/* Plain English */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '3px', letterSpacing: '0.05em' }}>What it means</div>
            <div style={{ color: 'var(--on-surface)' }}>{info.plain}</div>
          </div>
          {/* Variables */}
          {info.vars && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '3px', letterSpacing: '0.05em' }}>Variables</div>
              <div style={{ color: 'var(--on-surface-variant)' }}>{info.vars}</div>
            </div>
          )}
          {/* Ideal */}
          <div style={{ marginBottom: info.caveat ? '8px' : '0' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '3px', letterSpacing: '0.05em' }}>Ideal value</div>
            <div style={{ color: 'var(--non-toxic)', fontWeight: '600' }}>{info.ideal}</div>
          </div>
          {/* Caveat */}
          {info.caveat && (
            <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '8px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
              ⚠ {info.caveat}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Stat card ─────────────────────────────────────────── */
const StatCard = ({ label, value, unit = '', color = 'var(--primary)', description, unavailable, tooltipKey }) => {
  const info = METRIC_INFO[tooltipKey || label];
  return (
    <Tooltip info={info}>
      <div style={{
        flex: 1, minWidth: '120px', padding: '14px 16px', borderRadius: '8px', cursor: 'default',
        backgroundColor: 'var(--surface-container-lowest)',
        border: `2px solid ${unavailable ? 'var(--outline-variant)' : color + '40'}`,
        opacity: unavailable ? 0.55 : 1,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
        onMouseEnter={e => { if (!unavailable && info) { e.currentTarget.style.boxShadow = `0 0 0 2px ${color}60`; e.currentTarget.style.borderColor = color; } }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = unavailable ? 'var(--outline-variant)' : `${color}40`; }}
      >
        <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {label}
          {info && !unavailable && <Info size={10} style={{ color: 'var(--outline)' }} />}
        </div>
        {unavailable
          ? <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--on-surface-variant)' }}>N/A</div>
          : <div style={{ fontSize: '24px', fontWeight: '700', color }}>{typeof value === 'number' ? pct(value) : value}{unit}</div>
        }
        {description && <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>{unavailable ? 'Requires ground-truth labels' : description}</div>}
      </div>
    </Tooltip>
  );
};

/* ─── Per-group row inside expandable section ────────────── */
const GroupRow = ({ label, m }) => {
  if (!m) return null;
  return (
    <tr style={{ borderBottom: '1px solid var(--surface-container-highest)' }}>
      <td style={{ padding: '8px 12px', fontWeight: '500', fontSize: '13px', color: 'var(--on-surface-variant)' }}>{label}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{m.n}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{pct(m.accuracy)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{pct(m.f1)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{pct(m.tpr)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{pct(m.fpr)}</td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{pct(m.ppr)}</td>
    </tr>
  );
};

/* ─── Main component ─────────────────────────────────────── */
const FairnessMetrics = () => {
  const [metrics, setMetrics]           = useState(null);
  const [files, setFiles]               = useState([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [loading, setLoading]           = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [scanning, setScanning]         = useState(false);

  /* Fetch files once on mount */
  useEffect(() => {
    axios.get('http://127.0.0.1:8004/files')
      .then(res => {
        setFiles(res.data);
        if (res.data.length > 0) setSelectedFileId(res.data[0].id.toString());
      })
      .catch(console.error);
  }, []);

  /* Fetch metrics on demand only */
  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setMetrics(null);
    try {
      const url = selectedFileId
        ? `http://127.0.0.1:8004/metrics?file_id=${selectedFileId}`
        : 'http://127.0.0.1:8004/metrics';
      const res = await axios.get(url);
      setMetrics(res.data);
    } catch (e) {
      console.error(e);
      setMetrics({ error: 'Failed to fetch metrics.' });
    } finally {
      setLoading(false);
    }
  }, [selectedFileId]);

  /* Auto-fetch when file selection changes */
  useEffect(() => {
    if (selectedFileId !== '') fetchMetrics();
  }, [selectedFileId]);

  /* ── Export CSV ── */
  const exportCSV = () => {
    if (!metrics || metrics.error || !metrics.identities) return;
    const header = 'Identity,SPD,SPD_Severity,EOpp,EOpp_Severity,A1_n,A1_Accuracy,A1_F1,A1_TPR,A1_FPR,A1_PPR,A0_n,A0_Accuracy,A0_F1,A0_TPR,A0_FPR,A0_PPR';
    const rows = metrics.identities.map(r =>
      [r.name, r.spd.toFixed(4), Math.abs(r.spd) > 0.1 ? 'High' : Math.abs(r.spd) > 0.05 ? 'Medium' : 'Low',
       r.eopp.toFixed(4), Math.abs(r.eopp) > 0.1 ? 'High' : Math.abs(r.eopp) > 0.05 ? 'Medium' : 'Low',
       r.a1.n, r.a1.accuracy.toFixed(4), r.a1.f1.toFixed(4), r.a1.tpr.toFixed(4), r.a1.fpr.toFixed(4), r.a1.ppr.toFixed(4),
       r.a0.n, r.a0.accuracy.toFixed(4), r.a0.f1.toFixed(4), r.a0.tpr.toFixed(4), r.a0.fpr.toFixed(4), r.a0.ppr.toFixed(4),
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fairness_metrics.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleRow = (name) => setExpandedRows(prev => ({ ...prev, [name]: !prev[name] }));

  const handleScanIdentities = async () => {
    setScanning(true);
    try {
      await axios.post(`http://127.0.0.1:8004/scan-identities/${selectedFileId}`);
      fetchMetrics();
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  /* ── Render states ── */
  if (loading) return (
    <div className="card" style={{ padding: '64px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
      <p style={{ fontWeight: '500' }}>Computing Fairness Metrics...</p>
      <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', marginTop: '8px' }}>
        Calculating SPD and EOpp per identity subgroup
      </p>
    </div>
  );

  if (!metrics) return (
    <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--on-surface-variant)', marginBottom: '16px' }}>
        Select a dataset and click "Compute Metrics" to begin fairness analysis.
      </p>
    </div>
  );

  const { overall, identities, worst_case, diagnostics } = metrics;
  const hasLabels = metrics.has_labels;

  const DiagnosticsPanel = () => {
    const counts = diagnostics?.group_counts || diagnostics?.counts || {};
    const minReq = diagnostics?.min_group_size || diagnostics?.min_required || 3;
    
    // Groups that exist but are below threshold
    const underRepresented = Object.entries(counts)
      .filter(([name, n]) => n > 0 && n < minReq)
      .map(([name]) => name);

    // Groups that have 0 detections
    const missing = Object.entries(counts)
      .filter(([name, n]) => n === 0)
      .map(([name]) => name);

    return (
      <div className="card" style={{ padding: '20px', backgroundColor: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={18} style={{ color: 'var(--primary)' }} />
              Data Coverage & Diagnostics
            </div>
            <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
              Tracking detections across {Object.keys(counts).length} identity categories in {overall.total} evaluated comments.
            </div>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={handleScanIdentities}
            disabled={scanning || overall.total === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {scanning ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {scanning ? 'Scanning...' : '✨ Infer Missing Identities (LLM Scan)'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ backgroundColor: 'var(--surface-container-lowest)', padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--tertiary)', marginBottom: '8px', textTransform: 'uppercase' }}>
              ⚠ Insufficient Data ({minReq} required)
            </div>
            {underRepresented.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {underRepresented.map(name => (
                  <span key={name} style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--tertiary-container)', color: 'var(--on-tertiary-container)', fontSize: '11px' }}>
                    {name} ({counts[name]})
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--on-surface-variant)' }}>No groups in this state.</div>
            )}
          </div>

          <div style={{ backgroundColor: 'var(--surface-container-lowest)', padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--on-surface-variant)', marginBottom: '8px', textTransform: 'uppercase' }}>
              ⚪ No Detections Found
            </div>
            {missing.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {missing.map(name => (
                  <span key={name} style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--surface-container)', color: 'var(--on-surface-variant)', fontSize: '11px' }}>
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--on-surface-variant)' }}>All groups have at least one detection.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <DiagnosticsPanel />

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '14px', fontWeight: '500' }}>Dataset:</label>
        <select
          value={selectedFileId}
          onChange={(e) => setSelectedFileId(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--outline-variant)' }}
        >
          <option value="">All Uploaded Data</option>
          {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
        </select>
        <button className="btn btn-primary" onClick={fetchMetrics} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> Compute Metrics
        </button>
        <button className="btn" onClick={exportCSV} style={{ border: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* No-labels warning */}
      {!hasLabels && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px',
          backgroundColor: '#fff3e0', border: '1px solid #fb8c00', borderRadius: '8px', fontSize: '13px'
        }}>
          <AlertCircle size={18} style={{ color: '#fb8c00', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong style={{ color: '#e65100' }}>No Ground-Truth Labels Detected</strong>
            <div style={{ marginTop: '4px', color: '#5d4037', lineHeight: 1.6 }}>
              Your uploaded CSV does not have a <code style={{ fontFamily: 'var(--font-mono)' }}>target</code> column.
              Accuracy, F1, Precision, Recall, TPR, FPR, and disparity metrics (SPD / EOpp) require
              actual toxicity labels to compare against predictions. Only the <strong>Positive Prediction Rate</strong>
              (how often the model predicted Toxic) is shown.
              <br />
              To enable all metrics, upload a CSV with a <code style={{ fontFamily: 'var(--font-mono)' }}>target</code> column
              containing values 0.0 (non-toxic) or 1.0 (toxic) for each comment.
            </div>
          </div>
        </div>
      )}

      {/* Formula Legend */}
      <FormulaLegend />

      {/* No Data Warning */}
      {overall.total === 0 && (
        <div className="card" style={{ padding: '24px', border: '2px dashed var(--outline-variant)', textAlign: 'center', backgroundColor: 'var(--surface-container-low)' }}>
          <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'var(--surface-container)', color: 'var(--tertiary)', marginBottom: '16px' }}>
            <AlertTriangle size={32} />
          </div>
          <h3 style={{ marginBottom: '8px' }}>No Evaluated Comments Found</h3>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', maxWidth: '500px', margin: '0 auto 16px' }}>
            The selected dataset has 0 evaluations. Please go to the <strong>Bulk Evaluation</strong> tab and run a "Zero-Shot Classification" for this dataset first.
          </p>
        </div>
      )}

      {overall.total > 0 && (
        <>
          {/* Overall Performance */}
          <div className="card">
            <div className="card-header">
              <h2>Overall Classification Performance</h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '13px', marginTop: '4px' }}>
                Across all {overall.total} evaluated comments
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <StatCard label="Accuracy" value={overall.accuracy} color="var(--primary)" unavailable={!hasLabels} />
              <StatCard label="F1 Score" value={overall.f1} color="var(--primary)" unavailable={!hasLabels} />
              <StatCard label="Precision" value={overall.precision} color="var(--secondary)" description="TP / (TP + FP)" unavailable={!hasLabels} />
              <StatCard label="Recall / TPR" value={overall.recall} color="var(--secondary)" description="TP / (TP + FN)" unavailable={!hasLabels} />
              <StatCard label="FPR" value={overall.fpr} color="var(--tertiary)" description="FP / (FP + TN)" unavailable={!hasLabels} />
              <StatCard label="Selection Rate" value={overall.selection_rate} color={hasLabels ? 'var(--on-surface-variant)' : 'var(--primary)'} description="(TP + FP) / Total" />
            </div>
          </div>

      {/* Disparity Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>Per-Identity Disparity Metrics</h2>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '13px', marginTop: '4px' }}>
              Click any row to expand full per-subgroup breakdown (A=1 vs A=0)
            </p>
          </div>
        </div>

        {identities.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'var(--surface-container)', color: 'var(--on-surface-variant)', marginBottom: '16px' }}>
              <AlertCircle size={32} />
            </div>
            <h3 style={{ marginBottom: '8px' }}>No identity groups met the sample size requirements</h3>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', maxWidth: '500px', margin: '0 auto 24px' }}>
              To ensure statistical stability, disparity metrics (SPD/EOpp) are only calculated for groups with at least <strong>{metrics.diagnostics?.min_group_size || 3}</strong> samples where the identity is present (A=1) and {metrics.diagnostics?.min_group_size || 3} where it is absent (A=0).
            </p>
            
            {metrics.diagnostics?.counts && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
                {Object.entries(metrics.diagnostics.counts).map(([name, count]) => (
                  <div key={name} style={{ 
                    padding: '6px 12px', borderRadius: '4px', fontSize: '12px',
                    backgroundColor: count > 0 ? 'var(--primary-container)' : 'var(--surface-container)',
                    color: count > 0 ? 'var(--on-primary-container)' : 'var(--on-surface-variant)',
                    border: count > 0 ? '1px solid var(--primary)' : '1px solid var(--outline-variant)',
                    opacity: count > 0 ? 1 : 0.6
                  }}>
                    {name}: <strong>{count}</strong> samples
                  </div>
                ))}
              </div>
            )}

            <div style={{ textAlign: 'left', backgroundColor: 'var(--surface-container-lowest)', padding: '16px', borderRadius: '8px', border: '1px solid var(--outline-variant)', fontSize: '13px' }}>
              <div style={{ fontWeight: '700', marginBottom: '8px' }}>How to fix this:</div>
              <ul style={{ paddingLeft: '20px', color: 'var(--on-surface-variant)', marginBottom: '16px' }}>
                <li>Ensure your CSV contains identity columns like <code>male</code>, <code>female</code>, <code>black</code>, <code>white</code>, <code>asian</code>, <code>latino</code>, <code>christian</code>, <code>jewish</code>, or <code>muslim</code>.</li>
                <li>Verify values are <code>1.0</code> (present) or <code>0.0</code> (absent).</li>
                <li>Evaluate more comments — currently only {overall.total} evaluated comments are being analyzed.</li>
              </ul>
              
              <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginBottom: '12px' }}>
                  Missing identity labels in your CSV? We can use the LLM to scan your {overall.total} comments and infer mentioned identities.
                </p>
                <button 
                  className="btn btn-primary" 
                  onClick={handleScanIdentities}
                  disabled={scanning || overall.total === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
                >
                  {scanning ? <RefreshCw size={14} className="animate-spin" /> : <Info size={14} />}
                  {scanning ? 'Scanning Comments...' : '✨ Infer Missing Identities (LLM Scan)'}
                </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Visual bar chart */}
                <div style={{ padding: '16px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px', marginBottom: '20px' }}>
                  <SPDEOppChart identities={identities} />
                </div>
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Selection Rate Diff (SPD)</th>
                    <th>Selection Rate Ratio</th>
                    <th>TPR Diff (EOpp)</th>
                    <th>FPR Diff</th>
                    <th>A=1 (n)</th>
                    <th>A=0 (n)</th>
                  </tr>
                </thead>
                <tbody>
                  {identities.map((row) => (
                    <React.Fragment key={row.name}>
                      <tr
                        onClick={() => toggleRow(row.name)}
                        style={{ cursor: 'pointer', backgroundColor: expandedRows[row.name] ? 'var(--surface-container-low)' : undefined }}
                      >
                        <td style={{ fontFamily: 'var(--font-sans)', fontWeight: '600' }}>
                          {expandedRows[row.name] ? '▼' : '▶'} {row.name}
                        </td>
                        <td style={{ color: severityColor(Math.abs(row.spd)), fontWeight: '700' }}>{sgn(row.spd)}</td>
                        <td style={{ fontWeight: '700' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {row.selection_rate_ratio.toFixed(2)}
                            <SeverityBadge value={1.0 - row.selection_rate_ratio} />
                          </div>
                        </td>
                        <td style={{ color: severityColor(Math.abs(row.eopp)), fontWeight: '700' }}>{sgn(row.eopp)}</td>
                        <td style={{ color: severityColor(Math.abs(row.fpr_diff)) }}>{sgn(row.fpr_diff)}</td>
                        <td style={{ color: 'var(--on-surface-variant)' }}>{row.a1.n}</td>
                        <td style={{ color: 'var(--on-surface-variant)' }}>{row.a0.n}</td>
                      </tr>

                      {expandedRows[row.name] && (
                        <tr>
                          <td colSpan="7" style={{ padding: '0 0 0 24px', backgroundColor: 'var(--surface-container-lowest)' }}>
                            <div style={{ padding: '16px 0 16px 0', fontSize: '13px' }}>
                              <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>
                                Subgroup Breakdown for <strong>{row.name}</strong>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px' }}>
                                <thead>
                                  <tr style={{ backgroundColor: 'var(--surface-container)' }}>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>Subgroup</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>n</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>Accuracy</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>F1</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>TPR (Recall)</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>FPR</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>Selection Rate</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <GroupRow label={`${row.name} = 1`} m={row.a1} />
                                  <GroupRow label={`${row.name} = 0`} m={row.a0} />
                                  <tr style={{ borderTop: '2px solid var(--outline-variant)', fontWeight: '600', backgroundColor: 'var(--surface-container-low)' }}>
                                    <td style={{ padding: '8px 12px', color: 'var(--primary)' }}>Disparity (A=1 − A=0)</td>
                                    <td style={{ padding: '8px 12px' }}>—</td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: severityColor(Math.abs(row.a1.accuracy - row.a0.accuracy)) }}>{sgn(row.a1.accuracy - row.a0.accuracy)}</td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: severityColor(Math.abs(row.a1.f1 - row.a0.f1)) }}>{sgn(row.a1.f1 - row.a0.f1)}</td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: severityColor(Math.abs(row.eopp)) }}>{sgn(row.eopp)} ← EOpp</td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: severityColor(Math.abs(row.fpr_diff)) }}>{sgn(row.fpr_diff)}</td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: severityColor(Math.abs(row.spd)) }}>{sgn(row.spd)} ← SPD</td>
                                  </tr>
                                </tbody>
                              </table>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                {[row.a1, row.a0].map((subg, idx) => (
                                  <div key={idx}>
                                    <div style={{ fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '8px' }}>
                                      Samples: {subg.label}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {subg.samples && subg.samples.length > 0 ? (
                                        subg.samples.map((s, si) => (
                                          <div key={si} style={{ 
                                            padding: '10px', borderRadius: '6px', backgroundColor: 'var(--surface-container-low)',
                                            borderLeft: `3px solid ${s.predicted === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)'}`,
                                            fontSize: '12px'
                                          }}>
                                            <div style={{ fontStyle: 'italic', marginBottom: '4px' }}>"{s.text}"</div>
                                            <div style={{ display: 'flex', gap: '12px', fontSize: '10px', fontWeight: '600' }}>
                                              <span style={{ color: s.predicted === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)' }}>Predicted: {s.predicted}</span>
                                              <span style={{ color: 'var(--on-surface-variant)' }}>Actual: {s.actual}</span>
                                              {s.predicted !== s.actual && <span style={{ color: 'var(--tertiary)' }}>⚠ ERROR</span>}
                                            </div>
                                          </div>
                                        ))
                                      ) : <div style={{ color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>No samples available</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </div>

          {/* Worst-Case Summary */}
          <div className="card">
            <div className="card-header">
              <h2>Worst-Case Summary</h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '13px', marginTop: '4px' }}>
                Most adverse group-level behavior across all identities (per §1.4.3)
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Max |SPD|', identity: worst_case.max_spd.identity, value: worst_case.max_spd.value, desc: 'Largest selection rate gap' },
                { label: 'Min Selection Ratio', identity: worst_case.min_selection_ratio.identity, value: worst_case.min_selection_ratio.value, desc: 'Lowest parity ratio (Ideal: 1.0)', isPercent: false, unit: '' },
                { label: 'Max |EOpp|', identity: worst_case.max_eopp.identity, value: worst_case.max_eopp.value, desc: 'Largest true positive rate gap' },
                { label: 'Worst Subgroup Accuracy', identity: worst_case.worst_accuracy.identity, value: worst_case.worst_accuracy.value, desc: `Subgroup: ${worst_case.worst_accuracy.subgroup || '—'}`, isPercent: true },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-container)',
                  border: `2px solid ${severityColor(Math.abs(item.value))}40`
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: severityColor(Math.abs(item.value)) }}>
                    {item.isPercent ? pct(item.value) : sgn(item.value)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600', marginTop: '2px' }}>{item.identity}</div>
                  <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '2px' }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default FairnessMetrics;
