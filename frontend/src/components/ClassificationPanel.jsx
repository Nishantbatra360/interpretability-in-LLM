import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, Play, Code, X } from 'lucide-react';
import InterpretabilityHeatmap from './InterpretabilityHeatmap';
import InterpretabilityPanel from './InterpretabilityPanel';
import { AttributionBarChart } from './Charts';

const AVAILABLE_MODELS = [
  { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Recommended)' },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (Fast)' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B (Heavy)' },
  { id: 'mistralai/mistral-large-2-instruct', name: 'Mistral Large 2' },
  { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B' },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B' }
];

const ClassificationPanel = () => {
  const [text, setText] = useState('');
  const [model, setModel] = useState('meta/llama-3.1-70b-instruct');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  const handleClassify = async () => {
    if (!text.trim()) return;
    
    setLoading(true);
    setError('');
    setResult(null);
    
    try {
      const response = await axios.post('http://127.0.0.1:8004/classify', { text, model });
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'An error occurred during classification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <div className="main-column">
        <div className="card">
          <div className="card-header">
            <h2>Input Data</h2>
          </div>
          
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px', borderLeft: '4px solid var(--tertiary)', fontSize: '13px', color: 'var(--on-surface)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--on-surface)' }}>Interpretability Deep-Dive (Single Comment)</h3>
            <div style={{ fontWeight: '600', color: 'var(--primary)', marginBottom: '8px' }}>Focus: Token-Level Causality and "Why"</div>
            <p style={{ margin: '0 0 8px 0', lineHeight: 1.5 }}>
              <strong>What it is:</strong> This is a microscopic, highly granular analysis of exactly how the LLM arrived at its decision for a single specific comment.
            </p>
            <p style={{ margin: '0 0 8px 0', lineHeight: 1.5 }}>
              <strong>How it works:</strong> Instead of just looking at the final "Toxic/Non-Toxic" label, the deep dive computes Explanation Signals. It breaks the sentence down word-by-word (token-by-token) to calculate the "attribution score" or "Net Logit Bias" of each word.
            </p>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              <strong>The Goal:</strong> To understand <em>why</em> a model made a prediction. It produces visual heatmaps showing which specific words pulled the model's prediction toward "Toxic" (positive attribution) and which words pulled it toward "Non-Toxic" (negative attribution). The reference plan emphasizes this to check if the model's logic is actually trustworthy, not just mathematically correct on average.
            </p>
          </div>

          <textarea
            className="input-area"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a comment here to evaluate its toxicity and view the model's reasoning..."
          />
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleClassify}
              disabled={loading || !text.trim()}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {loading ? 'Analyzing...' : 'Run Interpretability Deep-Dive'}
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
            <div style={{ color: 'var(--error)', marginTop: '16px', fontSize: '14px' }}>
              {error}
            </div>
          )}

          {result && (
            <div className={`prediction-box ${result.classification.toLowerCase()}`}>
              <div className="prediction-header">
                <span className="prediction-label">
                  Prediction: {result.classification.toUpperCase()}
                </span>
                <span className="confidence-score">
                  Confidence: {(result.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--on-surface-variant)' }}>
                Based on prompt-based relative probability (log p(toxic|x) - log p(non-toxic|x)).
              </p>
            </div>
          )}
        </div>

        {result && result.tokens && (
          <div style={{ marginTop: '24px' }}>
            <InterpretabilityHeatmap tokens={result.tokens} />
          </div>
        )}

        {result && result.tokens && result.tokens.length > 0 && (
          <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="card" style={{ padding: '20px' }}>
              <AttributionBarChart tokens={result.tokens} />
            </div>
            <div className="card" style={{ padding: '20px' }}>
              <InterpretabilityPanel
                tokens={result.tokens}
                confidence={result.confidence}
                classification={result.classification}
                compact={true}
              />
            </div>
          </div>
        )}
      </div>
      
      <div className="side-column">
        <div className="card">
          <div className="card-header">
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>Model</label>
              <select 
                value={model} 
                onChange={(e) => setModel(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--outline-variant)', marginBottom: '16px' }}
              >
                {AVAILABLE_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>Explanation Method</label>
              <select style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--outline-variant)' }}>
                <option>Simulated Attention (JSON)</option>
              </select>
            </div>
            
            {result && result.examples_used && result.examples_used.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--outline-variant)', paddingTop: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '12px', color: 'var(--on-surface-variant)' }}>
                  Few-Shot Context (from DB)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {result.examples_used.map((ex, idx) => (
                    <div key={idx} style={{ padding: '8px', backgroundColor: 'var(--surface-container)', borderRadius: '4px', fontSize: '12px', borderLeft: `3px solid ${ex.label === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)'}` }}>
                      <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>{ex.label}</span>
                      <span style={{ color: 'var(--on-surface-variant)' }}>"{ex.text.length > 80 ? ex.text.substring(0, 80) + '...' : ex.text}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Raw API Request/Response Modal */}
      {showDebug && result && result.debug_data && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowDebug(false)}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '8px', width: '85%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Deep-Dive API Diagnostic Data</h2>
              <button onClick={() => setShowDebug(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)' }}><X size={20} /></button>
            </div>
            
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingRight: '8px' }}>
              <div style={{ backgroundColor: 'var(--surface-container-low)', padding: '16px', borderRadius: '6px', borderLeft: '4px solid var(--primary)' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--primary)', marginBottom: '12px', marginTop: 0 }}>1. Zero-Shot Logprob Extraction (Verdict)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>PROMPT SENT:</div>
                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: '12px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                      {result.debug_data.zero_shot_prompt || 'N/A'}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>RAW LLM RESPONSE:</div>
                    <pre style={{ backgroundColor: '#1e1e1e', color: '#00ff88', padding: '12px', borderRadius: '4px', fontSize: '16px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                      {result.debug_data.zero_shot_raw_response || 'N/A'}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>LOGPROBS (USED FOR MATHEMATICAL SCORING):</div>
                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '4px', overflowX: 'auto', fontSize: '12px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                      {JSON.stringify(result.debug_data.zero_shot_logprobs, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--surface-container-low)', padding: '16px', borderRadius: '6px', borderLeft: '4px solid var(--secondary)' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--secondary)', marginBottom: '12px', marginTop: 0 }}>2. Generative Token Attribution (Heatmaps)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>PROMPT SENT:</div>
                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: '12px', fontFamily: 'var(--font-mono)', margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
                      {result.debug_data.deep_dive_prompt || 'N/A'}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>RAW JSON RECEIVED:</div>
                    <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: '12px', fontFamily: 'var(--font-mono)', margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
                      {result.debug_data.deep_dive_raw_response || 'N/A'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassificationPanel;
