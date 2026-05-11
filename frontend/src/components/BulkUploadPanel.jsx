import React, { useState, useEffect } from 'react';
import { UploadCloud, Play, Loader2, Database, Trash2, Code, X, ShieldAlert, BookOpen, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import InterpretabilityHeatmap from './InterpretabilityHeatmap';
import InterpretabilityPanel from './InterpretabilityPanel';
import { Section, Formula } from './InterpretabilityPanel';
import { PredictionDonut, ConfidenceHistogram, TokenHeatmap } from './Charts';
import api, { IS_DEMO } from '../api';
import axios from 'axios';

const AVAILABLE_MODELS = [
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (Fastest)' },
  { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Recommended)' },
  { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3' },
  { id: 'mistralai/mistral-small-4-119b-2603', name: 'Mistral Small 4' },
  { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B (State of the Art)' },
  { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B' },
  { id: 'google/gemma-2-2b-it', name: 'Gemma 2 2B' }
];

const BulkUploadPanel = ({ isEvaluating, setIsEvaluating, evaluatingFileId, setEvaluatingFileId, progress, setProgress }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [model, setModel] = useState('meta/llama-3.1-8b-instruct');
  
  const [filesList, setFilesList] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  
  const [dbStatus, setDbStatus] = useState({ pending: 0, evaluated: 0 });
  const [globalStats, setGlobalStats] = useState(null);
  const [evaluatedComments, setEvaluatedComments] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  const [message, setMessage] = useState('');
  const [modalData, setModalData] = useState(null);
  
  // Pagination & Filtering
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [sortBy, setSortBy] = useState('');
  const limit = 50; // Use 50 items per page for better performance


  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getTopDrivers = (tokensJson) => {
    try {
      const tokens = JSON.parse(tokensJson);
      if (!tokens || tokens.length === 0) return { toxic: null, safe: null };
      
      let maxToxic = tokens[0];
      let maxSafe = tokens[0];
      
      tokens.forEach(t => {
        if (t.attribution > maxToxic.attribution) maxToxic = t;
        if (t.attribution < maxSafe.attribution) maxSafe = t;
      });
      
      return { 
        toxic: maxToxic.attribution > 0.1 ? maxToxic : null, 
        safe: maxSafe.attribution < -0.1 ? maxSafe : null 
      };
    } catch (e) {
      return { toxic: null, safe: null };
    }
  };

  const fetchFiles = async () => {
    try {
      const data = await api.getFiles();
      setFilesList(data);
      if (data.length > 0 && selectedFileId === null) {
        setSelectedFileId(data[0].id);
      } else if (data.length === 0) {
        setSelectedFileId(null);
        setDbStatus({ pending: 0, evaluated: 0 });
        setEvaluatedComments([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStatus = async () => {
    if (!selectedFileId) return;
    try {
      const data = await api.getFileState(selectedFileId);
      setDbStatus({ pending: data.pending, evaluated: data.evaluated });
      setGlobalStats(data.stats || null);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchComments = async (pageNum = 0) => {
    if (!selectedFileId) return;
    try {
      const data = await api.getEvaluatedComments(selectedFileId, pageNum * limit, limit, searchQuery, filterClass, sortBy);
      setEvaluatedComments(data.items || []);
      setTotalPages(Math.ceil((data.total || 0) / limit));
      if (pageNum === 0 && !searchQuery && !filterClass && !sortBy && data.items && data.items.length > 0) {
        localStorage.setItem('last_evaluated_comment', data.items[0].text);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // Fetch status once on mount + when selectedFileId changes
  useEffect(() => {
    if (!selectedFileId) return;
    setPage(0);
    fetchStatus();
    fetchComments(0);
  }, [selectedFileId]);

  // Fetch comments when page, search, filter, or sort changes
  useEffect(() => {
    if (!selectedFileId) return;
    const delay = setTimeout(() => fetchComments(page), 300);
    return () => clearTimeout(delay);
  }, [page, searchQuery, filterClass, sortBy]);


  const handleUpload = async () => {
    if (IS_DEMO) {
      setMessage('Demo Mode: Uploading is disabled in this preview.');
      return;
    }
    if (!file) return;
    setUploading(true);
    setMessage('');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.uploadFile(formData);
      setMessage("File uploaded successfully.");
      setFile(null);
      await fetchFiles();
    } catch (err) {
      setMessage('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleEvaluate = () => {
    if (IS_DEMO) {
      setMessage('Demo Mode: Live LLM evaluation is disabled. Use existing data below.');
      return;
    }
    if (!selectedFileId || isEvaluating) return;
    
    setIsEvaluating(true);
    setEvaluatingFileId(selectedFileId);
    setMessage('');
    
    // Initial baseline for progress
    setProgress({ 
      evaluated: dbStatus.evaluated, 
      pending: dbStatus.pending, 
      batchSize: parseInt(batchSize), 
      startEvaluated: dbStatus.evaluated 
    });

    const eventSource = new EventSource(`http://127.0.0.1:8004/stream-evaluate/${selectedFileId}?batch_size=${batchSize}&model=${model}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'start') {
        // Updated total from server
      } else if (data.type === 'progress') {
        setProgress(prev => prev ? { 
          ...prev, 
          evaluated: data.processed + prev.startEvaluated, 
          pending: data.total - data.processed 
        } : prev);
        // Refresh the table live
        fetchStatus();
      } else if (data.type === 'complete' || data.done) {
        eventSource.close();
        setIsEvaluating(false);
        setEvaluatingFileId(null);
        setProgress(null);
        fetchStatus();
        fetchComments(page);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Streaming evaluation failed:', err);
      eventSource.close();
      setIsEvaluating(false);
      setEvaluatingFileId(null);
      setProgress(null);
      setMessage('Evaluation stream interrupted.');
      fetchStatus();
      fetchComments(page);
    };
  };
  
  const handleDeleteFile = async (id) => {
    if (IS_DEMO) {
      setMessage('Demo Mode: Deletion is disabled in this preview.');
      return;
    }
    try {
      await api.deleteFile(id);
      if (selectedFileId === id) setSelectedFileId(null);
      fetchFiles();
    } catch (err) {
      console.error("Failed to delete file", err);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {IS_DEMO && (
          <div style={{ 
            padding: '12px 20px', backgroundColor: 'var(--primary-container)', 
            color: 'var(--on-primary-container)', borderRadius: '12px', 
            display: 'flex', alignItems: 'center', gap: '12px',
            fontSize: '14px', fontWeight: '500', border: '1px solid rgba(0,0,0,0.1)'
          }}>
            <ShieldAlert size={18} />
            <span><strong>Researcher Demo Mode:</strong> You are viewing a static snapshot of the audit results. Actions like file upload and live LLM evaluation are disabled.</span>
          </div>
        )}

        <div className="dashboard-grid">
        <div className="main-column" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2>CSV Data Ingestion</h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', marginTop: '4px' }}>
                Upload the Civil Comments CSV dataset. Data will be queued for evaluation.
              </p>
            </div>
            {IS_DEMO && <span style={{ fontSize: '10px', fontWeight: '800', padding: '4px 8px', backgroundColor: 'var(--outline-variant)', borderRadius: '4px', color: 'var(--on-surface-variant)' }}>READ ONLY</span>}
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <input 
              type="file" 
              accept=".csv" 
              onChange={(e) => setFile(e.target.files[0])}
              style={{ padding: '8px', border: '1px dashed var(--outline-variant)', flex: 1, borderRadius: '4px' }}
              disabled={IS_DEMO}
            />
            <button 
              className="btn btn-primary" 
              onClick={handleUpload}
              disabled={!file || uploading || IS_DEMO}
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
              {uploading ? 'Uploading...' : 'Upload to Database'}
            </button>
          </div>
          
          {uploading && (
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '4px', borderLeft: '3px solid var(--primary)' }}>
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: '14px', color: 'var(--on-surface-variant)' }}>
                Parsing CSV, generating default demographics, and inserting into SQLite Database...
              </span>
            </div>
          )}
          
          {message && !uploading && !isEvaluating && <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--primary)', fontWeight: '500' }}>{message}</div>}
        </div>

        {selectedFileId && (
          <div className="card">
            <div className="card-header">
              <h2>Batch Evaluation Queue</h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', marginTop: '4px' }}>
                Run the NVIDIA NIM LLM zero-shot pipeline on pending database records to generate ground-truth predictions and metrics.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--surface-container)', borderRadius: '4px', flex: 1 }}>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: 600 }}>Pending Evaluation</div>
                <div style={{ fontSize: '24px', fontWeight: 500 }}>{dbStatus.pending}</div>
              </div>
              <div style={{ padding: '16px', backgroundColor: 'var(--surface-container)', borderRadius: '4px', flex: 1 }}>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: 600 }}>Evaluated Successfully</div>
                <div style={{ fontSize: '24px', fontWeight: 500 }}>{dbStatus.evaluated}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>Batch Size</label>
                <input 
                  type="number" 
                  min="1" 
                  max="35" 
                  value={batchSize} 
                  onChange={(e) => setBatchSize(Math.min(35, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--outline-variant)', borderRadius: '4px' }}
                  disabled={isEvaluating}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>Model</label>
                <select 
                  value={model} 
                  onChange={(e) => setModel(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--outline-variant)', borderRadius: '4px' }}
                  disabled={isEvaluating}
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <button 
                className="btn" 
                style={{ backgroundColor: 'var(--inverse-surface)', color: 'var(--inverse-on-surface)' }}
                onClick={handleEvaluate}
                disabled={isEvaluating || dbStatus.pending === 0}
              >
                {isEvaluating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {isEvaluating ? 'Evaluating...' : 'Run Batch Analysis'}
              </button>
            </div>
            
            {isEvaluating && progress && (() => {
              const batchTotal   = (progress?.batchSize) || 10;
              const currentEval  = (progress?.evaluated) || 0;
              const startEval    = (progress?.startEvaluated) || 0;
              const doneInBatch  = Math.max(0, currentEval - startEval);
              const pct          = batchTotal > 0 ? Math.min(100, Math.round((doneInBatch / batchTotal) * 100)) : 0;
              const pendingTotal = (progress?.pending) || 0;
              return (
                <div style={{ marginTop: '16px', padding: '14px 16px', backgroundColor: 'rgba(0,74,198,0.05)', border: '1px solid var(--primary)', borderRadius: '6px' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--primary)' }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>
                        Batch Evaluation Running
                      </span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: '700', color: 'var(--primary)' }}>
                      {doneInBatch} / {batchTotal}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--outline-variant)', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{
                      height: '100%', borderRadius: '4px',
                      width: `${pct}%`,
                      backgroundColor: 'var(--primary)',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                    <span>✓ <strong style={{ color: 'var(--non-toxic)' }}>{doneInBatch}</strong> evaluated this batch</span>
                    <span>⏳ <strong style={{ color: 'var(--tertiary)' }}>{batchTotal - doneInBatch}</strong> remaining</span>
                    <span>📊 <strong>{progress.pending}</strong> total pending in dataset</span>
                    <span style={{ marginLeft: 'auto', fontWeight: '700', color: pct === 100 ? 'var(--non-toxic)' : 'var(--primary)' }}>{pct}%</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
      
      <div className="side-column">
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Database size={20} /> Datasets</h2>
          </div>
          {filesList.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>No datasets uploaded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filesList.map(f => (
                <div 
                  key={f.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: `1px solid ${selectedFileId === f.id ? 'var(--primary)' : 'var(--outline-variant)'}`,
                    backgroundColor: selectedFileId === f.id ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface-container)'
                  }}
                  onClick={() => setSelectedFileId(f.id)}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: '500', fontSize: '13px', color: 'var(--on-surface)' }}>{f.filename}</div>
                    <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>{new Date(f.upload_time).toLocaleString()}</div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }}
                    style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Zero-Shot Methodology Section */}
    <div className="card" style={{ marginTop: '0' }}>
      <div className="card-header" style={{ borderBottom: '1px solid var(--outline-variant)', paddingBottom: '16px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={22} style={{ color: 'var(--primary)' }} />
          Zero-Shot Classification Methodology
        </h2>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', marginTop: '4px' }}>
          How the bulk evaluation pipeline classifies toxicity without fine-tuning or token-level attribution.
        </p>
      </div>

      <Section title="📐 Scoring Rule: Log-Probability Classification" defaultOpen={true}>
        <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
          Each comment is classified using a <strong>zero-shot prompt</strong>. The LLM is asked to output a binary verdict (Toxic or Non-Toxic) along with a confidence score that proxies the log-probability difference between the two competing labels. No token-level attribution is computed at this stage — that's reserved for the <strong>Deep Dive</strong>.
        </p>

        <Formula
          label="Core Scoring Rule (Reference Plan §1.2)"
          formula="s(x) = log P(Toxic | x) − log P(Non-Toxic | x)"
          description="If s(x) > 0, the model prefers Toxic. If s(x) < 0, it prefers Non-Toxic. The magnitude indicates strength of preference."
          highlight
        />
        <Formula
          label="Prediction Rule"
          formula="ŷ = 1 (Toxic)  if s(x) > 0,   else  0 (Non-Toxic)"
          description="A simple sign test on the composite score determines the predicted label."
        />
        <Formula
          label="Confidence Mapping"
          formula="confidence = σ(|s(x)|) ≈ P(predicted_label | x)"
          description="The absolute magnitude of s(x) is mapped to a 0–1 confidence via the LLM's own calibration."
        />
      </Section>

      <Section title="🏷️ Ground Truth: Civil Comments Dataset" defaultOpen={false}>
        <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
          The dataset provides a continuous toxicity score (0.0–1.0) for each comment, aggregated from multiple human annotators. We binarize this into a label for evaluation:
        </p>
        <Formula
          label="Ground Truth Binarization"
          formula="y_true = 1 (Toxic)  if target > 0.5,   else  0 (Non-Toxic)"
          description="The 0.5 threshold converts continuous annotator scores into a binary label for accuracy, F1, TPR, and FPR computation."
          highlight
        />
        <Formula
          label="Accuracy"
          formula="Accuracy = (TP + TN) / N_labeled"
          description="Fraction of labeled comments where the predicted classification matches ground truth. Only comments with a valid target score are included."
        />
        <Formula
          label="F1 Score"
          formula="F1 = 2 × Precision × Recall / (Precision + Recall)"
          description="Harmonic mean of precision and recall. Balances false positives and false negatives."
        />
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--surface-container)', borderRadius: '6px', borderLeft: '4px solid var(--tertiary)', fontSize: '13px', marginTop: '8px', color: 'var(--on-surface-variant)' }}>
          <strong style={{ color: 'var(--tertiary)' }}>Note:</strong> Comments without a ground truth label (<code>target = -1.0</code>) are excluded from accuracy/F1/TPR/FPR computation but still count toward the Positive Prediction Rate (PPR) for fairness analysis.
        </div>
      </Section>

      <Section title="🔍 Identity Detection & Fairness" defaultOpen={false}>
        <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
          Alongside toxicity, the zero-shot prompt detects <strong>protected demographic identities</strong> (male, female, christian, jewish, muslim, threat_group). These are stored as binary flags and used for subgroup fairness analysis in the <strong>Fairness Metrics</strong> tab.
        </p>
        <Formula
          label="Statistical Parity Difference (SPD)"
          formula="SPD = P(ŷ=Toxic | A=1) − P(ŷ=Toxic | A=0)"
          description="Measures whether comments mentioning an identity group are more likely to be flagged as toxic. SPD = 0 means no disparity."
        />
        <Formula
          label="Equal Opportunity Difference (EOpp)"
          formula="EOpp = TPR(A=1) − TPR(A=0)"
          description="Measures whether truly toxic comments are detected at equal rates across groups. Requires ground truth labels."
        />
      </Section>

      <Section title="⚡ Zero-Shot vs. Deep Dive: What's the Difference?" defaultOpen={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surface-container-high)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', fontWeight: '700', color: 'var(--on-surface-variant)', borderBottom: '2px solid var(--outline-variant)' }}>Aspect</th>
                <th style={{ padding: '10px 14px', fontWeight: '700', color: 'var(--primary)', borderBottom: '2px solid var(--primary)' }}>Zero-Shot (This Page)</th>
                <th style={{ padding: '10px 14px', fontWeight: '700', color: 'var(--tertiary)', borderBottom: '2px solid var(--tertiary)' }}>Deep Dive</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Purpose', 'Batch classification of 100s of comments', 'Detailed analysis of a single comment'],
                ['Output', 'Toxic/Non-Toxic verdict + confidence + identities', 'Per-token toxic_score & safe_score → heatmap'],
                ['Token Attribution', '❌ Not computed (fast)', '✅ Full per-word attribution map'],
                ['Speed', '~1–2s per comment (300 max tokens)', '~3–5s per comment (512 max tokens)'],
                ['Reference Plan', '§1.2 — Log-probability scoring', '§1.3 — Explanation signal extraction (IG proxy)'],
                ['Use Case', 'Screening large datasets for patterns', 'Investigating why a specific comment was flagged'],
              ].map(([aspect, zs, dd], i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                  <td style={{ padding: '8px 14px', fontWeight: '600', color: 'var(--on-surface)' }}>{aspect}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--on-surface-variant)' }}>{zs}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--on-surface-variant)' }}>{dd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>

    {selectedFileId && (
        <div className="card">
            <div className="card-header">
              <h2>Evaluated Comments</h2>
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--surface-container-low)', borderLeft: '3px solid var(--secondary)', borderRadius: '4px', fontSize: '13px', color: 'var(--on-surface-variant)' }}>
                <strong>Zero-Shot Performance:</strong> This table shows the raw logprob-based classification results without the heavy token attribution calculation. To view token-level causality and heatmaps for any specific comment, copy its text and use the <strong>Deep Dive</strong> tab.
              </div>
            </div>
            {evaluatedComments.length === 0 ? (
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>No evaluated comments to display.</p>
            ) : (
              <>
                {/* Visual Summary Charts */}
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '24px', padding: '16px 0', borderBottom: '1px solid var(--outline-variant)', marginBottom: '20px' }}>
                  <PredictionDonut comments={evaluatedComments} stats={globalStats} />
                  <ConfidenceHistogram comments={evaluatedComments} stats={globalStats} />
                </div>
              
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="Search comments..." 
                  className="form-control" 
                  value={searchQuery} 
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }} 
                  style={{ flex: 1 }}
                />
                <select 
                  className="btn" 
                  style={{ border: '1px solid var(--outline-variant)' }}
                  value={filterClass} 
                  onChange={(e) => { setFilterClass(e.target.value); setPage(0); }}
                >
                  <option value="">All Verdicts</option>
                  <option value="Toxic">Toxic Only</option>
                  <option value="Non-Toxic">Non-Toxic Only</option>
                </select>
                <select 
                  className="btn" 
                  style={{ border: '1px solid var(--outline-variant)' }}
                  value={sortBy} 
                  onChange={(e) => { setSortBy(e.target.value); setPage(0); }}
                >
                  <option value="">Sort by: ID (Default)</option>
                  <option value="confidence_asc">Confidence (Low to High)</option>
                  <option value="confidence_desc">Confidence (High to Low)</option>
                  <option value="prediction">Prediction (A-Z)</option>
                  <option value="ground_truth">Ground Truth (A-Z)</option>
                </select>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="metrics-table" style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Comment Text</th>
                      <th>LLM Prediction</th>
                      <th>Confidence</th>
                      <th>Ground Truth</th>
                      <th>Toxicity Sub-Types</th>
                      <th>API Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluatedComments.map(comment => {
                      return (
                        <React.Fragment key={comment.id}>
                          <tr 
                            onClick={() => setExpandedRows(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                            style={{ backgroundColor: 'transparent', cursor: 'pointer' }}
                          >
                            <td>
                              <div style={{ padding: '8px 0', lineHeight: '1.5' }}>
                                {comment.text}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ 
                                  padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', display: 'inline-block',
                                  backgroundColor: comment.predicted_classification === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)',
                                  color: '#fff'
                                }}>
                                  {comment.predicted_classification}
                                </span>
                              </div>
                            </td>
                            <td>{comment.confidence != null ? (comment.confidence * 100).toFixed(1) + '%' : '—'}</td>
                            <td>
                              {comment.ground_truth_label ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{
                                    padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', display: 'inline-block',
                                    backgroundColor: comment.ground_truth_label === 'Toxic' ? '#ba1a1a33' : '#006c4b33',
                                    color: comment.ground_truth_label === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)',
                                    border: `1px solid ${comment.ground_truth_label === 'Toxic' ? 'var(--toxic)' : 'var(--non-toxic)'}`
                                  }}>
                                    {comment.ground_truth_label}
                                  </span>
                                  <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)' }}>
                                    score: {comment.target?.toFixed(3)}
                                  </span>
                                  {comment.predicted_classification && comment.ground_truth_label && (
                                    <span style={{ fontSize: '11px', fontWeight: '700',
                                      color: comment.predicted_classification === comment.ground_truth_label ? 'var(--non-toxic)' : 'var(--toxic)' }}>
                                      {comment.predicted_classification === comment.ground_truth_label ? '✓ Correct' : '✗ Wrong'}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--on-surface-variant)', fontSize: '12px' }}>No label</span>
                              )}
                            </td>
                            <td>
                              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                {(() => {
                                  const subTypes = [
                                    { k: 'severe', v: comment.severe_toxicity },
                                    { k: 'obscene', v: comment.obscene },
                                    { k: 'threat', v: comment.threat },
                                    { k: 'insult', v: comment.insult },
                                    { k: 'id_atk', v: comment.identity_attack },
                                    { k: 'sexual', v: comment.sexual_explicit },
                                  ].filter(x => x.v != null && x.v > 0);
                                  
                                  if (subTypes.length === 0) return <span style={{ color: 'var(--on-surface-variant)' }}>None</span>;
                                  
                                  return subTypes.map(({ k, v }) => (
                                    <div key={k} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                      <span style={{ color: 'var(--on-surface-variant)', minWidth: '44px' }}>{k}:</span>
                                      <div style={{ height: '6px', borderRadius: '3px', width: `${Math.round(v * 60)}px`, minWidth: '2px',
                                        backgroundColor: v > 0.5 ? 'var(--toxic)' : v > 0.1 ? 'var(--tertiary)' : 'var(--outline-variant)' }} />
                                      <span>{v.toFixed(2)}</span>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </td>
                            <td>
                              <button
                                className="btn"
                                style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--surface-container-high)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  try {
                                    setModalData(comment);
                                  } catch (err) {
                                    setModalData({ error: 'No debug data available.' });
                                  }
                                }}
                              >
                                <Code size={14} /> Audit
                              </button>
                            </td>
                          </tr>
                          {expandedRows[comment.id] && (
                            <tr style={{ backgroundColor: 'var(--surface-container-lowest)' }}>
                              <td colSpan="6" style={{ padding: '20px' }}>
                                {(() => {
                                  const p = JSON.parse(comment.tokens_json || '{}');
                                  const rat = p.toxicity_rationale || p.rationale || p.toxicity || 'No rationale available.';
                                  const logT = p.log_prob_toxic;
                                  const logNT = p.log_prob_nontoxic;
                                  const score = p.score;
                                  const hasLogProbs = logT !== undefined && logNT !== undefined && score !== undefined;
                                  
                                  // Parse raw response for identity detections
                                  let raw_dets = {};
                                  try { raw_dets = p.raw_response ? JSON.parse(p.raw_response).detections : (p.detections || {}); } catch(e) {}
                                  
                                  const idents = [
                                    { label: 'MALE', val: comment.male || raw_dets.male },
                                    { label: 'FEMALE', val: comment.female || raw_dets.female },
                                    { label: 'CHRISTIAN', val: comment.christian || raw_dets.christian },
                                    { label: 'JEWISH', val: comment.jewish || raw_dets.jewish },
                                    { label: 'MUSLIM', val: comment.muslim || raw_dets.muslim },
                                    { label: 'THREAT', val: comment.threat_group || raw_dets.threat_group },
                                  ].filter(i => i.val > 0.5);

                                  const isToxic = comment.predicted_classification === 'Toxic';
                                  const predColor = isToxic ? 'var(--toxic)' : 'var(--non-toxic)';

                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                      {/* Rationale */}
                                      <div style={{ 
                                        padding: '12px 16px', backgroundColor: 'var(--surface-container)', 
                                        borderRadius: '6px', borderLeft: `4px solid ${predColor}`,
                                        fontSize: '13px', lineHeight: '1.6', color: 'var(--on-surface)'
                                      }}>
                                        <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '6px' }}>LLM Rationale</div>
                                        {rat}
                                      </div>

                                      {/* Formula Calculations */}
                                      {hasLogProbs ? (
                                        <div style={{ 
                                          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'
                                        }}>
                                          {/* Left: Step-by-step formulas */}
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <Zap size={14} /> Zero-Shot Score Derivation
                                            </div>

                                            <Formula
                                              label="Step 1: Log-Probability (Toxic)"
                                              formula={`log P(Toxic | x) = ${logT.toFixed(4)}`}
                                              description="LLM's estimated log-probability that this text is toxic."
                                            />
                                            <Formula
                                              label="Step 2: Log-Probability (Non-Toxic)"
                                              formula={`log P(Non-Toxic | x) = ${logNT.toFixed(4)}`}
                                              description="LLM's estimated log-probability that this text is safe."
                                            />
                                            <Formula
                                              label="Step 3: Composite Score s(x)"
                                              formula={`s(x) = ${logT.toFixed(4)} − ${logNT >= 0 ? '' : '('}${logNT.toFixed(4)}${logNT >= 0 ? '' : ')'} = ${score.toFixed(4)}`}
                                              description={`s(x) ${score > 0 ? '> 0 → Model prefers Toxic' : score < 0 ? '< 0 → Model prefers Non-Toxic' : '= 0 → Borderline case'}`}
                                              highlight
                                            />
                                          </div>

                                          {/* Right: Verdict derivation */}
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>
                                              📊 Verdict Derivation
                                            </div>

                                            <Formula
                                              label="Step 4: Classification Rule"
                                              formula={`ŷ = ${score > 0 ? '1 (Toxic)' : '0 (Non-Toxic)'}  ← sign(${score.toFixed(4)})`}
                                              description="Binary prediction from the sign of s(x)."
                                              highlight
                                            />
                                            <Formula
                                              label="Step 5: Confidence"
                                              formula={`σ(|${score.toFixed(4)}|) = 1 / (1 + e^(-${Math.abs(score).toFixed(4)})) = ${comment.confidence?.toFixed(4) || 'N/A'}`}
                                              description="Sigmoid of absolute score maps to calibrated confidence."
                                            />

                                            {/* Identity tags */}
                                            <div style={{ marginTop: '8px' }}>
                                              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Identity Detections</div>
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {idents.length === 0 
                                                  ? <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>No protected identities detected.</span>
                                                  : idents.map(i => (
                                                    <span key={i.label} style={{ 
                                                      padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', 
                                                      backgroundColor: 'var(--surface-container-high)', color: 'var(--secondary)',
                                                      border: '1px solid var(--secondary)'
                                                    }}>
                                                      {i.label}
                                                    </span>
                                                  ))
                                                }
                                              </div>
                                            </div>

                                            {/* Ground truth comparison if available */}
                                            {comment.target !== -1.0 && comment.target !== null && (
                                              <div style={{ 
                                                marginTop: '8px', padding: '10px 14px', borderRadius: '6px',
                                                backgroundColor: (isToxic === (comment.target > 0.5)) 
                                                  ? 'rgba(0,108,75,0.08)' : 'rgba(186,26,26,0.08)',
                                                border: `1px solid ${(isToxic === (comment.target > 0.5)) ? 'var(--non-toxic)' : 'var(--toxic)'}`,
                                                fontSize: '12px'
                                              }}>
                                                <strong>Ground Truth:</strong> target = {comment.target?.toFixed(3)} → {comment.target > 0.5 ? 'Toxic' : 'Non-Toxic'}{' '}
                                                {isToxic === (comment.target > 0.5) 
                                                  ? <span style={{ color: 'var(--non-toxic)', fontWeight: '700' }}>✓ Correct</span>
                                                  : <span style={{ color: 'var(--toxic)', fontWeight: '700' }}>✗ {isToxic ? 'False Positive' : 'False Negative'}</span>
                                                }
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        /* Fallback for older records without log-probs */
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
                                            <em>Log-probability data not available for this record (evaluated before formula update). Re-evaluate to see formula breakdown.</em>
                                          </div>
                                          <div>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Identity Detections</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                              {idents.length === 0 
                                                ? <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>No protected identities detected.</span>
                                                : idents.map(i => (
                                                  <span key={i.label} style={{ 
                                                    padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', 
                                                    backgroundColor: 'var(--surface-container-high)', color: 'var(--secondary)',
                                                    border: '1px solid var(--secondary)'
                                                  }}>
                                                    {i.label}
                                                  </span>
                                                ))
                                              }
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '16px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px', border: '1px solid var(--outline-variant)' }}>
                  <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
                    Showing page <strong>{page + 1}</strong> of <strong>{totalPages}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn" 
                      style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid var(--outline-variant)', backgroundColor: 'var(--surface)' }}
                      disabled={page === 0}
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                    >
                      Previous
                    </button>
                    <button 
                      className="btn" 
                      style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid var(--outline-variant)', backgroundColor: 'var(--surface)' }}
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        )}
    </div>

    {/* Raw API Request/Response Modal */}
    {modalData && (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setModalData(null)}>
        <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '8px', width: '80%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Technical Audit: Raw LLM Data</h2>
            <button onClick={() => setModalData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)' }}><X size={20} /></button>
          </div>
          
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
             {/* LLM Technical Audit Trail */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Code size={14} /> 
              {modalData.tokens_json && JSON.parse(modalData.tokens_json).raw_response 
                ? 'Unified Inference: Raw JSON Audit Log' 
                : 'Technical Audit: Raw LLM Data'}
            </div>
            
            <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginBottom: '12px', fontStyle: 'italic' }}>
              {modalData.tokens_json && JSON.parse(modalData.tokens_json).raw_response 
                ? 'This log shows the model\'s unified classification and identity detection in one pass. Mathematical token attribution is available in the Deep Dive tab.' 
                : 'This view shows the raw API data received from the model. Mathematical token attribution is available in the Deep Dive tab.'}
            </div>

            <div style={{ backgroundColor: 'var(--surface-container-highest)', padding: '16px', borderRadius: '8px', border: '1px solid var(--outline-variant)' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', marginBottom: '4px', textTransform: 'uppercase' }}>Raw Prompt Sent:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--on-surface)', fontFamily: 'var(--font-mono)', lineHeight: '1.5', maxHeight: '200px', overflowY: 'auto', marginBottom: '16px' }}>
                {modalData.identity_prompt || (modalData.tokens_json && JSON.parse(modalData.tokens_json).prompt) || modalData.prompt || 'N/A'}
              </pre>

              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', marginBottom: '4px', textTransform: 'uppercase' }}>Raw LLM Response:</div>
              <pre style={{ 
                margin: 0, 
                whiteSpace: 'pre-wrap', 
                fontSize: '12px', 
                color: '#4CAF50', 
                backgroundColor: '#1a1c1e', 
                padding: '12px', 
                borderRadius: '4px', 
                fontFamily: 'var(--font-mono)', 
                lineHeight: '1.5', 
                maxHeight: '300px', 
                overflowY: 'auto' 
              }}>
                {(() => {
                  // Strategy: Find the most "raw" content available
                  if (modalData.identity_response) return modalData.identity_response;
                  
                  const tokens = modalData.tokens_json ? JSON.parse(modalData.tokens_json) : null;
                  if (tokens?.raw_response) return tokens.raw_response;
                  if (modalData.raw_response) return modalData.raw_response;
                  
                  // Fallback to the full tokens_json if it's all we have
                  if (modalData.tokens_json) return modalData.tokens_json;
                  
                  return 'No raw response logs found for this record.';
                })()}
              </pre>
            </div>
          </div>
        </div>
        </div>
      </div>
    )}
  </>
  );
};

export default BulkUploadPanel;
