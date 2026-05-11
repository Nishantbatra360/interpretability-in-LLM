import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Play, Code, X, ShieldAlert, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import InterpretabilityHeatmap from './InterpretabilityHeatmap';
import InterpretabilityPanel, { MethodologyBox, ComputedMetricsBox, TopTokenDriversBox, InterpretationSummaryBox } from './InterpretabilityPanel';
import { AttributionBarChart } from './Charts';
import api, { IS_DEMO } from '../api';

const AVAILABLE_MODELS = [
  { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Recommended)' },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (Fastest)' },
  { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3' },
  { id: 'mistralai/mistral-small-4-119b-2603', name: 'Mistral Small 4' },
  { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B (State of the Art)' },
  { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B' },
  { id: 'google/gemma-2-2b-it', name: 'Gemma 2 2B' }
];

const ClassificationPanel = ({ initialText = '' }) => {
  const [text, setText] = useState(() => {
    if (initialText) return initialText;
    if (!IS_DEMO) {
      try {
        const last = localStorage.getItem('last_evaluated_comment');
        if (last) return last;
      } catch (e) {}
    }
    return '';
  });
  const [model, setModel] = useState('meta/llama-3.1-8b-instruct');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('deep_dive_history');
      if (saved) {
        return JSON.parse(saved).map(item => ({ ...item, timestamp: new Date(item.timestamp) }));
      }
    } catch (e) { }
    return [];
  });

  // Demo Mode: Auto-load featured sample
  useEffect(() => {
    if (IS_DEMO && !initialText) {
      const loadDemo = async () => {
        try {
          const publicBase = import.meta.env.BASE_URL;
          const res = await axios.get(`${publicBase}demo_data/deep_dive_sample.json`);
          const data = res.data;
          // Map DB keys to Frontend keys with robust parsing
          let tokens = [];
          try {
            const parsed = typeof data.tokens_json === 'string' ? JSON.parse(data.tokens_json) : data.tokens_json;
            tokens = parsed?.tokens || [];
            
            // Aggressive fallback for nested tokens
            if (!tokens || tokens.length === 0) {
              if (parsed?.raw_response) {
                const raw = typeof parsed.raw_response === 'string' ? JSON.parse(parsed.raw_response) : parsed.raw_response;
                tokens = raw?.tokens || [];
              }
            }
            if (!tokens || tokens.length === 0) {
              if (data.identity_response) {
                const id_resp = typeof data.identity_response === 'string' ? JSON.parse(data.identity_response) : data.identity_response;
                tokens = id_resp?.tokens || [];
              }
            }
          } catch (e) { tokens = []; }

          const mappedData = {
            ...data,
            classification: data.predicted_classification || data.classification,
            tokens: tokens
          };
          setResult(mappedData);
          setText(data.text);
        } catch (e) {
          console.error("Failed to load deep dive demo", e);
        }
      };
      loadDemo();
    }
  }, [initialText]);

  // Auto-run if text is passed from metrics tab
  useEffect(() => {
    if (initialText && initialText !== text) {
      setText(initialText);
    }
  }, [initialText]);

  // If text changes from props and we are on this tab, maybe we should auto-classify
  useEffect(() => {
    if (text && text === initialText && !result && !loading && !IS_DEMO) {
      handleClassify();
    }
  }, [text, initialText]);

  const handleClassify = async () => {
    if (IS_DEMO) {
      setError('Live inference is disabled in Demo Mode. Please explore the featured sample.');
      return;
    }
    if (!text.trim()) return;
    
    setLoading(true);
    setError('');
    setResult(null);
    
    try {
      const response = await axios.post('http://127.0.0.1:8004/classify', { text, model });
      const newData = response.data;
      setResult(newData);
      setHistory(prev => {
        const newItem = { text, result: newData, timestamp: new Date() };
        if (prev.length > 0 && prev[0].text === text) return prev;
        const updated = [newItem, ...prev].slice(0, 10);
        localStorage.setItem('deep_dive_history', JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'An error occurred during classification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <div className="main-column" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {IS_DEMO && (
          <div style={{ 
            padding: '12px 20px', backgroundColor: 'var(--primary-container)', 
            color: 'var(--on-primary-container)', borderRadius: '12px', 
            display: 'flex', alignItems: 'center', gap: '12px',
            fontSize: '14px', fontWeight: '500', border: '1px solid rgba(0,0,0,0.1)'
          }}>
            <ShieldAlert size={18} />
            <span><strong>Researcher Demo Mode:</strong> Viewing a pre-calculated high-resolution attribution map. Live inference is disabled.</span>
          </div>
        )}

        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2>Input Data</h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', marginTop: '4px' }}>
                Paste a comment here to evaluate its toxicity and view the model's reasoning...
              </p>
            </div>
            {IS_DEMO && <span style={{ fontSize: '10px', fontWeight: '800', padding: '4px 8px', backgroundColor: 'var(--outline-variant)', borderRadius: '4px', color: 'var(--on-surface-variant)' }}>READ ONLY</span>}
          </div>
          
          <textarea 
            className="form-control"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. I disagree with this approach but I respect your opinion..."
            style={{ minHeight: '140px', width: '100%', marginBottom: '16px' }}
            disabled={IS_DEMO}
          />
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleClassify}
              disabled={loading || !text.trim() || IS_DEMO}
              style={{ gap: '8px', display: 'flex', alignItems: 'center' }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {loading ? 'Evaluating...' : 'Run Interpretability Deep-Dive'}
            </button>
            
            {result && result.debug_data && (
              <button 
                className="btn" 
                onClick={() => setShowDebug(true)} 
                style={{ backgroundColor: 'var(--surface-container-high)', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Code size={16} /> View Raw API Data
              </button>
            )}
          </div>

          {error && (
            <div style={{ color: 'var(--error)', marginTop: '16px', fontSize: '14px', fontWeight: '500' }}>
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className={`prediction-box ${result.classification.toLowerCase()}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ 
                  width: '48px', height: '48px', borderRadius: '12px', 
                  backgroundColor: result.classification === 'Toxic' ? 'rgba(186,26,26,0.1)' : 'rgba(0,108,75,0.1)',
                  color: result.classification === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {result.classification === 'Toxic' ? <ShieldAlert size={28} /> : <ShieldCheck size={28} />}
                </div>
                <div>
                  <div style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: '800', color: 'var(--on-surface-variant)' }}>Model Verdict</div>
                  <div style={{ fontSize: '24px', fontWeight: '800' }}>{result.classification}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: '800', color: 'var(--on-surface-variant)' }}>Confidence</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>{(result.confidence * 100).toFixed(1)}%</div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--outline-variant)' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--on-surface-variant)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--primary)' }} /> Visual Heatmap: Feature Attribution
              </div>
              <InterpretabilityHeatmap tokens={result.tokens} />
            </div>
            
            <div style={{ marginTop: '24px' }}>
              <InterpretabilityPanel 
                tokens={result.tokens} 
                confidence={result.confidence} 
                classification={result.classification} 
              />
            </div>
          </div>
        )}
      </div>

      <div className="side-column">
        <div className="card">
          <div className="card-header">
            <h2>Parameters</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>Target LLM</label>
              <select className="btn" style={{ width: '100%', textAlign: 'left', border: '1px solid var(--outline-variant)' }} value={model} onChange={(e) => setModel(e.target.value)} disabled={IS_DEMO}>
                {AVAILABLE_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>Explanation Method</label>
              <select className="btn" style={{ width: '100%', textAlign: 'left', border: '1px solid var(--outline-variant)' }} disabled={IS_DEMO}>
                <option>Simulated Attention (JSON)</option>
                <option>Causal Perturbation (Future)</option>
              </select>
            </div>
          </div>
        </div>
        
        {history.length > 0 && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Recent Deep Dives</h2>
              <button 
                onClick={() => { setHistory([]); localStorage.removeItem('deep_dive_history'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                title="Clear History"
              >
                <Trash2 size={14} /> Clear
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
              {history.map((h, i) => (
                <div 
                  key={i} 
                  onClick={() => { setText(h.text); setResult(h.result); }}
                  style={{ 
                    padding: '12px', 
                    borderRadius: '8px', 
                    backgroundColor: 'var(--surface-container-low)', 
                    cursor: 'pointer',
                    border: '1px solid var(--outline-variant)',
                    borderLeft: `4px solid ${h.result?.classification === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)'}`,
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-container-high)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface-container-low)'}
                >
                  <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: h.result?.classification === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)' }}>
                        {h.result?.classification || 'Unknown'}
                    </strong>
                    <span style={{ fontSize: '10px' }}>
                        {h.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--on-surface)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    "{h.text}"
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <MethodologyBox />
      </div>

      {showDebug && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div className="card" style={{ maxWidth: '900px', width: '100%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Raw LLM Interpretation Data</h2>
              <button className="btn" onClick={() => setShowDebug(false)} style={{ minWidth: 0, padding: '8px' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', backgroundColor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassificationPanel;
