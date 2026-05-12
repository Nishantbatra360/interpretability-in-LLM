import React, { useState, useEffect, useCallback } from 'react';
import { 
  Download, RefreshCw, AlertTriangle, CheckCircle, Info, BookOpen,
  ChevronDown, ChevronUp, ExternalLink, ShieldCheck, BarChart3,
  TrendingUp, TrendingDown, Target, Database, Activity, AlertCircle, FileText, ShieldAlert, Loader2
} from 'lucide-react';
import { SPDEOppChart, TokenHeatmap } from './Charts';
import { Section, Formula } from './InterpretabilityPanel';
import api, { IS_DEMO } from '../api';
import axios from 'axios';

/* ─── Human-readable identity labels ───────────────────── */
const IDENTITY_LABELS = {
  male: 'Male',
  female: 'Female',
  christian: 'Christian',
  jewish: 'Jewish',
  muslim: 'Muslim',
  threat_group: 'Threat / Violence'
};

/* ─── helpers ──────────────────────────────────────────── */
const pct = (v) => (v * 100).toFixed(1) + '%';
const sgn = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);

const severityColor = (absVal) => {
  if (absVal > 0.1) return 'var(--toxic)';
  if (absVal > 0.05) return 'var(--tertiary)';
  return 'var(--non-toxic)';
};

/* ─── Components ────────────────────────────────────────── */

const Tooltip = ({ label, detail }) => (
    <div className="tooltip-wrapper">
        {label} <Info size={12} style={{ opacity: 0.7 }} />
        <div className="tooltip-popup">{detail}</div>
    </div>
);

const MetricBadge = ({ label, value }) => {
    const abs = Math.abs(value);
    const color = severityColor(abs);
    
    // Detailed tooltip text for each metric
    const tooltipText = label === "Flagging Gap" 
        ? "Difference in the rate at which this group is flagged as toxic vs others. > 0 means over-flagged."
        : "Difference in how well the model catches actual toxicity for this group vs others.";
        
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: 'var(--on-surface-variant)', fontWeight: '700', width: '105px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Tooltip label={label} detail={tooltipText} />
            </span>
            <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: '3px', overflow: 'hidden', minWidth: '50px' }}>
                <div style={{ height: '100%', width: `${Math.min(abs * 200, 100)}%`, backgroundColor: color }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', color, width: '50px', textAlign: 'right' }}>{sgn(value)}</span>
        </div>
    );
};

const SubgroupCard = ({ group, isExpanded, onToggle }) => {
    const maxDisparity = Math.max(Math.abs(group.spd), Math.abs(group.eopp));
    const statusColor = severityColor(maxDisparity);

    return (
        <div className="card" style={{ 
            padding: 0, 
            border: isExpanded ? `1px solid ${statusColor}80` : '1px solid var(--outline-variant)',
            boxShadow: isExpanded ? `0 4px 20px ${statusColor}15` : 'none',
            transition: 'all 0.3s ease'
        }}>
            <div 
                onClick={onToggle}
                style={{ 
                    padding: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px',
                    backgroundColor: isExpanded ? 'var(--surface-container-low)' : 'transparent'
                }}
            >
                <div style={{ 
                    width: '48px', height: '48px', borderRadius: '12px', 
                    backgroundColor: group.count < 30 ? 'var(--surface-container-highest)' : `${statusColor}15`, 
                    color: group.count < 30 ? 'var(--on-surface-variant)' : statusColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {group.count < 30 ? <AlertCircle size={24} /> : (maxDisparity > 0.1 ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />)}
                </div>

                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--on-surface)', textTransform: 'capitalize' }}>
                        {IDENTITY_LABELS[group.name] || group.name.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                        Sample size: <strong>{group.count}</strong>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginRight: '24px', minWidth: '240px' }}>
                    <MetricBadge label="Flagging Gap" value={group.spd} />
                    <MetricBadge label="Recall Gap" value={group.eopp} />
                </div>

                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>

            {isExpanded && (
                <div style={{ padding: '24px', borderTop: '1px solid var(--outline-variant)', backgroundColor: 'var(--surface-container-lowest)' }}>
                    
                    {group.count < 30 && (
                        <div style={{ marginBottom: '24px', padding: '12px 16px', backgroundColor: 'var(--surface-container-high)', borderRadius: '8px', borderLeft: '4px solid var(--tertiary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <AlertCircle size={18} style={{ color: 'var(--tertiary)' }} />
                            <div style={{ fontSize: '13px', color: 'var(--on-surface)' }}>
                                <strong>Low Statistical Confidence:</strong> With a sample size of only {group.count}, the metrics below may not be statistically significant. Take these gaps as early signals rather than conclusive evidence.
                            </div>
                        </div>
                    )}
                    
                    <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'var(--surface-container-high)', borderRadius: '8px', borderLeft: `4px solid ${statusColor}` }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--on-surface)', lineHeight: 1.7 }}>
                            <strong>Business Impact:</strong> {maxDisparity > 0.1 ? `The model shows significant bias on the ${IDENTITY_LABELS[group.name] || group.name} subgroup.` : 'The model is relatively fair on this subgroup.'} 
                            &nbsp;This group is flagged as toxic <strong style={{ color: 'var(--primary)' }}>{pct(group.a1.ppr)}</strong> of the time (vs {pct(group.a0.ppr)} for others).
                            {group.di !== undefined && (
                                <span style={{ marginLeft: '12px', paddingLeft: '12px', borderLeft: '1px solid var(--outline-variant)' }}>
                                    <strong>Disparate Impact Ratio:</strong>{' '}
                                    <span style={{ color: (group.di >= 0.8 && group.di <= 1.25) ? 'var(--non-toxic)' : 'var(--toxic)', fontWeight: '800' }}>
                                        {(group.di || 0).toFixed(2)}x
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginLeft: '4px' }}>
                                        ({(group.di >= 0.8 && group.di <= 1.25) ? '✓ within 80% rule' : '⚠ outside 80% rule'})
                                    </span>
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                            <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                <Tooltip label="FLAGGED AS TOXIC" detail="Percentage of ALL comments mentioning this group that the model flagged as toxic." />
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: '900' }}>{pct(group.a1?.ppr || 0)}</div>
                            <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginTop: '4px' }}>vs <strong>{pct(group.a0?.ppr || 0)}</strong> for other groups</div>
                            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '8px', fontStyle: 'italic' }}>How often comments mentioning this are rejected.</div>
                        </div>
                        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                            <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                <Tooltip label="FALSE POSITIVE RATE" detail="Percentage of SAFE comments mentioning this group that the model incorrectly flagged as toxic." />
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: '900', color: (group.a1?.fpr || 0) > (group.a0?.fpr || 0) + 0.05 ? 'var(--toxic)' : 'var(--on-surface)' }}>{pct(group.a1?.fpr || 0)}</div>
                            <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginTop: '4px' }}>vs <strong>{pct(group.a0?.fpr || 0)}</strong> for other groups</div>
                            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '8px', fontStyle: 'italic' }}>Safe comments incorrectly flagged as toxic.</div>
                        </div>
                        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                            <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--tertiary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                                <Tooltip label="CAUGHT TOXICITY (RECALL)" detail="Percentage of TRULY TOXIC comments mentioning this group that the model successfully caught." />
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: '900' }}>{pct(group.a1?.tpr || 0)}</div>
                            <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginTop: '4px' }}>vs <strong>{pct(group.a0?.tpr || 0)}</strong> for other groups</div>
                            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '8px', fontStyle: 'italic' }}>How well the model finds actual toxicity here.</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                        <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Activity size={16} className="text-primary" /> Classification Outcomes (Confusion Matrix)
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '8px', alignItems: 'center', textAlign: 'center', fontSize: '13px' }}>
                                <div></div>
                                <div style={{ fontWeight: '800', color: 'var(--toxic)', fontSize: '11px', textTransform: 'uppercase' }}>Predicted Toxic</div>
                                <div style={{ fontWeight: '800', color: 'var(--non-toxic)', fontSize: '11px', textTransform: 'uppercase' }}>Predicted Safe</div>
                                
                                <div style={{ fontWeight: '800', color: 'var(--on-surface-variant)', textAlign: 'right', paddingRight: '8px', fontSize: '11px' }}>Actually Toxic</div>
                                <div style={{ backgroundColor: 'rgba(0,108,75,0.12)', border: '1px solid rgba(0,108,75,0.3)', padding: '12px', borderRadius: '6px', fontWeight: 'bold', color: 'var(--non-toxic)' }}>{group.a1.tp} <span style={{ fontSize: '10px', fontWeight: 'normal', display: 'block', marginTop: '2px' }}>True Positives ✓</span></div>
                                <div style={{ backgroundColor: 'rgba(186,26,26,0.12)', color: 'var(--toxic)', border: '1px solid rgba(186,26,26,0.3)', padding: '12px', borderRadius: '6px', fontWeight: 'bold' }}>{group.a1.fn} <span style={{ fontSize: '10px', fontWeight: 'normal', display: 'block', marginTop: '2px' }}>Missed Toxicity ✗</span></div>
                                
                                <div style={{ fontWeight: '800', color: 'var(--on-surface-variant)', textAlign: 'right', paddingRight: '8px', fontSize: '11px' }}>Actually Safe</div>
                                <div style={{ backgroundColor: 'rgba(186,26,26,0.12)', color: 'var(--toxic)', border: '1px solid rgba(186,26,26,0.3)', padding: '12px', borderRadius: '6px', fontWeight: 'bold' }}>{group.a1.fp} <span style={{ fontSize: '10px', fontWeight: 'normal', display: 'block', marginTop: '2px' }}>Over-Flagged ✗</span></div>
                                <div style={{ backgroundColor: 'rgba(0,108,75,0.12)', border: '1px solid rgba(0,108,75,0.3)', padding: '12px', borderRadius: '6px', fontWeight: 'bold', color: 'var(--non-toxic)' }}>{group.a1.tn} <span style={{ fontSize: '10px', fontWeight: 'normal', display: 'block', marginTop: '2px' }}>True Negatives ✓</span></div>
                            </div>
                        </div>

                        {group.fp_word_cloud && group.fp_word_cloud.length > 0 && (
                            <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                                <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertTriangle size={16} className="text-secondary" /> Common Words in False Positives
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'center', height: 'calc(100% - 36px)' }}>
                                    {group.fp_word_cloud.map((w, i) => (
                                        <div key={i} style={{ 
                                            padding: '8px 16px', 
                                            backgroundColor: 'var(--surface)', 
                                            border: '1px solid var(--outline-variant)',
                                            borderRadius: '20px',
                                            fontSize: `${Math.max(12, Math.min(24, 12 + w.value * 2))}px`,
                                            fontWeight: i < 2 ? '800' : '600',
                                            color: i === 0 ? 'var(--secondary)' : 'var(--on-surface)'
                                        }}>
                                            {w.text} <span style={{ opacity: 0.5, fontSize: '11px', fontWeight: 'normal' }}>({w.value})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={16} className="text-primary" /> Sample Comments Audit
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginBottom: '16px', padding: '10px 14px', backgroundColor: 'var(--surface-container)', borderRadius: '6px', borderLeft: '3px solid var(--secondary)' }}>
                            Showing up to 5 sample comments from this subgroup. Errors (false positives / false negatives) are prioritized to highlight where the model struggles.
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {group.samples && group.samples.length > 0 ? group.samples.map((s, i) => (
                                <div key={i} style={{ 
                                    padding: '20px', borderRadius: '12px', backgroundColor: 'var(--surface-container-low)',
                                    border: '1px solid var(--outline-variant)',
                                    borderLeft: `6px solid ${s.type.includes('Positive') ? 'var(--toxic)' : 'var(--non-toxic)'}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', backgroundColor: s.type.includes('Positive') ? 'var(--toxic)' : 'var(--non-toxic)', color: 'white', textTransform: 'uppercase' }}>
                                                {s.type}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', fontWeight: '600' }}>
                                            Actual: {s.truth} | Predicted: {s.predicted}
                                        </span>
                                    </div>
                                    
                                    {/* Show heatmap if tokens exist, otherwise show raw text */}
                                    {s.tokens && s.tokens.length > 0 ? (
                                        <TokenHeatmap tokens={s.tokens} fullText={s.text} />
                                    ) : (
                                        <div style={{ 
                                            fontSize: '14px', fontWeight: '500', color: 'var(--on-surface)', 
                                            padding: '12px', backgroundColor: 'var(--surface-container-lowest)', 
                                            borderRadius: '6px', border: '1px solid var(--outline-variant)',
                                            lineHeight: 1.5 
                                        }}>
                                            "{s.text}"
                                        </div>
                                    )}
                                    
                                    <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginTop: '12px', backgroundColor: 'var(--surface-container-high)', padding: '10px', borderRadius: '6px' }}>
                                        <strong>Model Rationale:</strong> {s.toxicity_rationale}
                                    </div>
                                </div>
                            )) : (
                                <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>No significant errors found for this subgroup.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const FairnessMetrics = () => {
  const [metrics, setMetrics] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState(null);

  const fetchFiles = async () => {
    try {
      const data = await api.getFiles();
      setFiles(data);
      if (data.length > 0 && !selectedFileId) setSelectedFileId(data[0].id.toString());
    } catch (e) { console.error(e); }
  };

  const fetchMetrics = useCallback(async (force = false) => {
    if (!selectedFileId) return;
    setLoading(true);
    try {
      const data = await api.getMetrics(selectedFileId, force);
      setMetrics(data);
    } catch (e) {
      console.error(e);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [selectedFileId]);

  useEffect(() => { fetchFiles(); }, []);
  useEffect(() => { if (selectedFileId) fetchMetrics(); }, [selectedFileId, fetchMetrics]);

  const handleSyncFromLogs = async () => {
    if (IS_DEMO) return;
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

  const handleExportCSV = () => {
    if (!metrics) return;
    
    const rows = [
      ["Subgroup", "Sample Size", "Flagged As Toxic (%)", "False Positive Rate (%)", "Caught Toxicity (Recall %)", "Flagging Gap", "Recall Gap"]
    ];
    
    rows.push([
      "Overall (Average)",
      metrics.overall?.total || 0,
      (metrics.overall?.ppr ? metrics.overall.ppr * 100 : 0).toFixed(1),
      (metrics.overall?.fpr ? metrics.overall.fpr * 100 : 0).toFixed(1),
      (metrics.overall?.tpr ? metrics.overall.tpr * 100 : 0).toFixed(1),
      "0",
      "0"
    ]);
    
    metrics.subgroups.forEach(group => {
      rows.push([
        group.name.replace(/_/g, ' '),
        group.count,
        (group.a1.ppr * 100).toFixed(1),
        (group.a1.fpr * 100).toFixed(1),
        (group.a1.tpr * 100).toFixed(1),
        group.spd.toFixed(3),
        group.eopp.toFixed(3)
      ]);
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fairness_report_${selectedFileId || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (loading && !metrics) return (
    <div className="card" style={{ padding: '64px 0', textAlign: 'center' }}>
      <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
      <p>Computing Fairness Metrics...</p>
    </div>
  );

  const insights = metrics ? [
    { 
        title: "Comments Audited", 
        val: metrics?.overall?.count || 0, 
        sub: `Accuracy: ${pct(metrics?.overall?.accuracy || 0)} · F1: ${(metrics?.overall?.f1 || 0).toFixed(3)}`, 
        color: 'var(--primary)', 
        icon: FileText,
        tooltip: "Total evaluated comments. Accuracy and F1 measure overall model quality before subgroup breakdown."
    },
    { 
        title: "Worst Flagging Gap (SPD)", 
        val: sgn(metrics?.worst_case?.max_spd?.value || 0),
        sub: IDENTITY_LABELS[metrics?.worst_case?.max_spd?.identity] || metrics?.worst_case?.max_spd?.identity || 'None',
        color: severityColor(Math.abs(metrics?.worst_case?.max_spd?.value || 0)),
        icon: TrendingUp,
        tooltip: "Statistical Parity Difference: how much more/less often a subgroup is flagged vs others. Ideal = 0."
    },
    { 
        title: "Worst Recall Gap (EOpp)", 
        val: sgn(metrics?.worst_case?.max_eopp?.value || 0),
        sub: IDENTITY_LABELS[metrics?.worst_case?.max_eopp?.identity] || metrics?.worst_case?.max_eopp?.identity || 'None',
        color: severityColor(Math.abs(metrics?.worst_case?.max_eopp?.value || 0)),
        icon: Target,
        tooltip: "Equal Opportunity Difference: how much better/worse the model catches real toxicity for a subgroup. Ideal = 0."
    }
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>Subgroup Fairness Audit</h1>
              {IS_DEMO && <span style={{ fontSize: '10px', fontWeight: '800', padding: '4px 8px', backgroundColor: 'var(--outline-variant)', borderRadius: '4px', color: 'var(--on-surface-variant)' }}>READ ONLY</span>}
            </div>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '15px' }}>Comparing model behavior across gender, religion &amp; threat subgroups.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
            <select className="btn" value={selectedFileId} onChange={(e) => setSelectedFileId(e.target.value)} style={{ border: '1px solid var(--outline-variant)', paddingRight: '32px' }}>
                {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
            </select>
            <button 
                className="btn" 
                onClick={handleSyncFromLogs} 
                title="Refresh identities from stored LLM logs" 
                style={{ border: '1px solid var(--outline-variant)', gap: '8px', display: 'flex' }}
                disabled={IS_DEMO}
            >
                <Database size={14} /> Sync Logs
            </button>
            <button 
                className="btn" 
                onClick={handleExportCSV} 
                title="Export fairness metrics as CSV" 
                style={{ border: '1px solid var(--outline-variant)', gap: '8px', display: 'flex', backgroundColor: 'var(--surface-container-high)' }}
                disabled={!metrics}
            >
                <Download size={14} /> Export CSV
            </button>
            <button 
                className="btn btn-primary" 
                onClick={() => fetchMetrics(true)} 
                style={{ gap: '8px', display: 'flex' }}
                disabled={IS_DEMO || loading}
                title={IS_DEMO ? "Disabled in Demo Mode" : "Recalculate metrics"}
            >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {loading ? "Computing..." : "Recalculate"}
            </button>
        </div>
      </div>

      {loading && !metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '16px', color: 'var(--on-surface-variant)' }}>
          <Loader2 size={48} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <div style={{ fontSize: '14px', fontWeight: '500' }}>Computing subgroup fairness metrics...</div>
        </div>
      )}

      {metrics && (
        <>
          <div className="card" style={{ padding: '24px', backgroundColor: 'var(--surface-container-low)' }}>
            <div style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={20} className="text-primary" /> Overall Model Performance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: '700' }}>
                  <Tooltip label="Accuracy" detail="Percentage of total predictions that were correct (both toxic and safe). Formula: (TP + TN) / Total." />
                </div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary)' }}>{pct(metrics.overall?.accuracy || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: '700' }}>
                  <Tooltip label="F1 Score" detail="Harmonic mean of precision and recall. Best for imbalanced datasets as it balances false positives and false negatives." />
                </div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--on-surface)' }}>{(metrics.overall?.f1 || 0).toFixed(3)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: '700' }}>
                  <Tooltip label="Precision" detail="How many of the comments flagged as 'Toxic' were actually toxic. Formula: TP / (TP + FP)." />
                </div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--on-surface)' }}>{pct(metrics.overall?.precision || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: '700' }}>
                  <Tooltip label="Recall (TPR)" detail="What percentage of truly toxic comments the model successfully identified. Formula: TP / (TP + FN)." />
                </div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--on-surface)' }}>{pct(metrics.overall?.tpr || 0)}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {insights.map((ins, i) => (
                <div key={i} className="card" style={{ 
                    padding: '28px 24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '24px',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    cursor: 'default',
                    border: `1px solid ${ins.color}20`,
                    boxShadow: `0 4px 20px ${ins.color}08`,
                    position: 'relative'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = `0 12px 30px ${ins.color}15`;
                    e.currentTarget.style.borderColor = `${ins.color}40`;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = `0 4px 20px ${ins.color}08`;
                    e.currentTarget.style.borderColor = `${ins.color}20`;
                }}>
                    <div style={{ 
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        overflow: 'hidden', borderRadius: 'inherit', zIndex: 0
                    }}>
                        <div style={{ 
                            position: 'absolute', top: '-20px', right: '-20px', 
                            width: '100px', height: '100px', borderRadius: '50%', 
                            background: `radial-gradient(circle, ${ins.color}10 0%, transparent 70%)`
                        }} />
                    </div>
                    <div style={{ backgroundColor: `${ins.color}15`, color: ins.color, padding: '16px', borderRadius: '16px', zIndex: 1, boxShadow: `inset 0 0 0 1px ${ins.color}20` }}>
                        <ins.icon size={32} />
                    </div>
                    <div style={{ zIndex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                            <Tooltip label={ins.title} detail={ins.tooltip} />
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: ins.color, lineHeight: 1 }}>{ins.val}</div>
                        {ins.sub && <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', fontWeight: '600', marginTop: '6px' }}>{ins.sub}</div>}
                    </div>
                </div>
            ))}
          </div>

          {/* Visual Overview */}
          <div className="card" style={{ padding: '32px' }}>
            <div className="card-header" style={{ marginBottom: '24px' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Activity size={20} className="text-primary" /> 
                    Global Disparity Overview
                </h2>
            </div>
            <div style={{ backgroundColor: 'var(--surface-container-low)', padding: '24px', borderRadius: '12px' }}>
                <SPDEOppChart identities={metrics?.subgroups || []} />
            </div>
          </div>

          {/* Methodology Explainer */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ borderBottom: '1px solid var(--outline-variant)', paddingBottom: '16px', marginBottom: '0' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: '800', margin: 0 }}>
                <BookOpen size={20} style={{ color: 'var(--primary)' }} />
                How to Read These Metrics
              </h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '13px', marginTop: '4px' }}>What each fairness metric means and how it is calculated from the evaluation data.</p>
            </div>

            <Section title="📊 Statistical Parity Difference (SPD) — Flagging Gap" defaultOpen={false}>
              <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '12px' }}>
                Measures whether the model flags comments <strong>mentioning</strong> a particular identity group as toxic more or less often than comments not mentioning that group.
              </p>
              <Formula
                label="SPD Formula"
                formula="SPD = P(ŷ=Toxic | A=1) − P(ŷ=Toxic | A=0)"
                description="A=1 means the comment mentions the identity. SPD > 0 = over-flagged, SPD < 0 = under-flagged. Fair range: |SPD| ≤ 0.05."
                highlight
              />
              <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(0,108,75,0.08)', border: '1px solid var(--non-toxic)', textAlign: 'center' }}><strong style={{ color: 'var(--non-toxic)' }}>|v| ≤ 0.05</strong><br/>Fair</div>
                <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(255,159,64,0.08)', border: '1px solid var(--tertiary)', textAlign: 'center' }}><strong style={{ color: 'var(--tertiary)' }}>0.05 – 0.10</strong><br/>Monitor</div>
                <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(186,26,26,0.08)', border: '1px solid var(--toxic)', textAlign: 'center' }}><strong style={{ color: 'var(--toxic)' }}>|v| &gt; 0.10</strong><br/>Biased</div>
              </div>
            </Section>

            <Section title="🎯 Equal Opportunity Difference (EOpp) — Recall Gap" defaultOpen={false}>
              <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '12px' }}>
                Measures whether the model is equally good at <strong>catching actual toxicity</strong> across groups. A large negative EOpp means the model misses real toxicity for that group.
              </p>
              <Formula
                label="EOpp Formula"
                formula="EOpp = TPR(A=1) − TPR(A=0)"
                description="TPR = True Positive Rate (Recall). EOpp > 0 = better at catching toxicity for this group. EOpp < 0 = worse. Ideal = 0."
                highlight
              />
            </Section>

            <Section title="⚖️ Disparate Impact Ratio (80% Rule)" defaultOpen={false}>
              <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '12px' }}>
                The legal/regulatory benchmark for adverse impact. If the ratio falls below 0.8 or above 1.25, the model may be discriminating against that group.
              </p>
              <Formula
                label="Disparate Impact"
                formula="DI = P(ŷ=Toxic | A=1) / P(ŷ=Toxic | A=0)"
                description="DI between 0.80 and 1.25 is considered fair (the '80% rule'). Outside this range suggests potential discrimination."
              />
            </Section>

            <Section title="🧩 Confusion Matrix Explained" defaultOpen={false}>
              <div style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--on-surface)' }}>
                <p style={{ marginBottom: '12px' }}>Each subgroup's expanded view shows a 2×2 confusion matrix comparing the model's predictions against ground truth labels:</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(0,108,75,0.08)', border: '1px solid rgba(0,108,75,0.3)' }}><strong style={{ color: 'var(--non-toxic)' }}>True Positive (TP):</strong> Correctly caught toxic comment</div>
                  <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(186,26,26,0.08)', border: '1px solid rgba(186,26,26,0.3)' }}><strong style={{ color: 'var(--toxic)' }}>False Negative (FN):</strong> Missed a toxic comment</div>
                  <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(186,26,26,0.08)', border: '1px solid rgba(186,26,26,0.3)' }}><strong style={{ color: 'var(--toxic)' }}>False Positive (FP):</strong> Safe comment wrongly flagged — potential bias</div>
                  <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(0,108,75,0.08)', border: '1px solid rgba(0,108,75,0.3)' }}><strong style={{ color: 'var(--non-toxic)' }}>True Negative (TN):</strong> Correctly passed a safe comment</div>
                </div>
              </div>
            </Section>
          </div>

          {/* Identity Subgroup Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database size={20} className="text-primary" />
                Detailed Subgroup Analysis
            </h3>
            {(metrics?.subgroups || []).map(group => (
                <SubgroupCard 
                    key={group.name} 
                    group={group} 
                    isExpanded={expandedGroupId === group.name}
                    onToggle={() => setExpandedGroupId(expandedGroupId === group.name ? null : group.name)}
                />
            ))}
          </div>
        </>
      )}

      {!metrics && !loading && (
          <div className="card" style={{ padding: '80px 0', textAlign: 'center' }}>
              <div style={{ backgroundColor: 'var(--surface-container-low)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <AlertCircle size={32} style={{ color: 'var(--on-surface-variant)' }} />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>No Evaluation Data Found</h2>
              <p style={{ color: 'var(--on-surface-variant)', maxWidth: '400px', margin: '0 auto 24px' }}>
                  Please run a <strong>Bulk Evaluation</strong> first. Identities are automatically captured during the classification pass.
              </p>
          </div>
      )}
    </div>
  );
};

export default FairnessMetrics;
