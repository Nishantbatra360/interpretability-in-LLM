import React, { useState, useEffect, useCallback } from 'react';
import { 
  Download, RefreshCw, AlertTriangle, CheckCircle, Info, 
  ChevronDown, ChevronUp, ExternalLink, ShieldCheck, 
  TrendingUp, TrendingDown, Target, Database, Activity, AlertCircle 
} from 'lucide-react';
import { SPDEOppChart, TokenHeatmap } from './Charts';
import api, { IS_DEMO } from '../api';
import axios from 'axios';

/* ─── helpers ──────────────────────────────────────────── */
const pct = (v) => (v * 100).toFixed(1) + '%';
const sgn = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);

const severityColor = (absVal) => {
  if (absVal > 0.1) return 'var(--toxic)';
  if (absVal > 0.05) return 'var(--tertiary)';
  return 'var(--non-toxic)';
};

/* ─── Components ────────────────────────────────────────── */

const MetricBadge = ({ label, value, type = 'spd' }) => {
    const abs = Math.abs(value);
    const color = severityColor(abs);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: 'var(--on-surface-variant)', fontWeight: '600', width: '40px' }}>{type.toUpperCase()}</span>
            <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                <div style={{ height: '100%', width: `${Math.min(abs * 500, 100)}%`, backgroundColor: color }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color, width: '50px', textAlign: 'right' }}>{sgn(value)}</span>
        </div>
    );
};

const SubgroupCard = ({ group, isExpanded, onToggle }) => {
    const maxDisparity = Math.max(Math.abs(group.spd), Math.abs(group.eopp));
    const statusColor = severityColor(maxDisparity);

    return (
        <div className="card" style={{ 
            padding: 0, overflow: 'hidden', 
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
                    backgroundColor: `${statusColor}15`, color: statusColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {maxDisparity > 0.1 ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
                </div>

                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--on-surface)', textTransform: 'capitalize' }}>
                        {group.name.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                        Sample size: <strong>{group.count}</strong>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '32px', marginRight: '16px' }}>
                    <MetricBadge label="SPD" value={group.spd} type="spd" />
                    <MetricBadge label="EOpp" value={group.eopp} type="eopp" />
                </div>

                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>

            {isExpanded && (
                <div style={{ padding: '24px', borderTop: '1px solid var(--outline-variant)', backgroundColor: 'var(--surface-container-lowest)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-container-low)' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', marginBottom: '8px' }}>SELECTION RATE (SR)</div>
                            <div style={{ fontSize: '20px', fontWeight: '800' }}>{pct(group.a1.ppr)}</div>
                            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>vs {pct(group.a0.ppr)} for others</div>
                        </div>
                        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-container-low)' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>RECALL (TPR)</div>
                            <div style={{ fontSize: '20px', fontWeight: '800' }}>{pct(group.a1.tpr)}</div>
                            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>vs {pct(group.a0.tpr)} for others</div>
                        </div>
                        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-container-low)' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--tertiary)', marginBottom: '8px' }}>F1 SCORE</div>
                            <div style={{ fontSize: '20px', fontWeight: '800' }}>{pct(group.a1.f1)}</div>
                            <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>Model balance on this group</div>
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={16} className="text-primary" /> Audit: Feature Attribution Heatmap (Interpretability)
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

  const fetchMetrics = useCallback(async () => {
    if (!selectedFileId) return;
    setLoading(true);
    try {
      const data = await api.getMetrics(selectedFileId);
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

  if (loading && !metrics) return (
    <div className="card" style={{ padding: '64px 0', textAlign: 'center' }}>
      <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
      <p>Computing Fairness Metrics...</p>
    </div>
  );

  const insights = metrics ? [
    { 
        title: "Audit Status", 
        val: Math.abs(metrics.worst_case.max_spd.value) > 0.1 ? "CRITICAL" : "STABLE",
        color: severityColor(Math.abs(metrics.worst_case.max_spd.value)),
        icon: ShieldCheck
    },
    { 
        title: "Max Selection Gap", 
        val: sgn(metrics.worst_case.max_spd.value),
        sub: metrics.worst_case.max_spd.identity,
        color: severityColor(Math.abs(metrics.worst_case.max_spd.value)),
        icon: TrendingUp
    },
    { 
        title: "Worst Opportunity Gap", 
        val: sgn(metrics.worst_case.max_eopp.value),
        sub: metrics.worst_case.max_eopp.identity,
        color: severityColor(Math.abs(metrics.worst_case.max_eopp.value)),
        icon: Target
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
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '15px' }}>Focused Analysis: Gender, Religion &amp; Threat (Audit Logs).</p>
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
                <Database size={14} /> Sync from Logs
            </button>
            <button 
                className="btn btn-primary" 
                onClick={fetchMetrics} 
                style={{ gap: '8px', display: 'flex' }}
                disabled={IS_DEMO}
            >
                <RefreshCw size={14} /> Recalculate
            </button>
        </div>
      </div>

      {metrics && (
        <>
          {/* Insight Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {insights.map((ins, i) => (
                <div key={i} className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ backgroundColor: `${ins.color}15`, color: ins.color, padding: '12px', borderRadius: '12px' }}>
                        <ins.icon size={32} />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ins.title}</div>
                        <div style={{ fontSize: '24px', fontWeight: '900', color: ins.color }}>{ins.val}</div>
                        {ins.sub && <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', fontWeight: '600' }}>{ins.sub}</div>}
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
                <SPDEOppChart identities={metrics.identities} />
            </div>
          </div>

          {/* Identity Subgroup Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database size={20} className="text-primary" />
                Detailed Subgroup Analysis
            </h3>
            {metrics.identities.map(group => (
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
