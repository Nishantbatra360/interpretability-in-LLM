import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, Play } from 'lucide-react';
import InterpretabilityHeatmap from './InterpretabilityHeatmap';
import InterpretabilityPanel from './InterpretabilityPanel';

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
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--on-surface)' }}>How this works (Reference Plan Methodology)</h3>
            <p style={{ margin: '0 0 8px 0', lineHeight: 1.5 }}>
              <strong>1. Zero-Shot Classification:</strong> The LLM computes the log-probability of the label "Toxic" vs "Non-Toxic" for the entire sentence without prior training examples. This powers the macro-level Fairness Metrics.
            </p>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              <strong>2. Interpretability Deep-Dive:</strong> After classification, the sentence is broken into individual tokens to compute a <em>Net Logit Bias</em>. This provides a microscopic view of exactly which words causally drove the LLM's final decision.
            </p>
          </div>

          <textarea
            className="input-area"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a comment here to evaluate its toxicity and view the model's reasoning..."
          />
          <button 
            className="btn btn-primary" 
            onClick={handleClassify}
            disabled={loading || !text.trim()}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {loading ? 'Analyzing...' : 'Run Zero-Shot Classification'}
          </button>

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
          <div style={{ marginTop: '24px' }}>
            <InterpretabilityPanel
              tokens={result.tokens}
              confidence={result.confidence}
              classification={result.classification}
              compact={false}
            />
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
    </div>
  );
};

export default ClassificationPanel;
