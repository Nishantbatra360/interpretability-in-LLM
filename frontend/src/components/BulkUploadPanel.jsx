import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, Play, Loader2, Database, Trash2, Code, X } from 'lucide-react';
import InterpretabilityHeatmap from './InterpretabilityHeatmap';
import InterpretabilityPanel from './InterpretabilityPanel';
import { PredictionDonut, ConfidenceHistogram } from './Charts';

const AVAILABLE_MODELS = [
  { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Recommended)' },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (Fast)' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B (Heavy)' },
  { id: 'mistralai/mistral-large-2-instruct', name: 'Mistral Large 2' },
  { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B' },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B' }
];

const BulkUploadPanel = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [model, setModel] = useState('meta/llama-3.1-70b-instruct');
  
  const [filesList, setFilesList] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  
  const [dbStatus, setDbStatus] = useState({ pending: 0, evaluated: 0 });
  const [evaluatedComments, setEvaluatedComments] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  const [message, setMessage] = useState('');
  const [modalData, setModalData] = useState(null);

  // Live progress during evaluation
  const [progress, setProgress] = useState(null); // { evaluated, pending, batchSize, startEvaluated }

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
      const res = await axios.get('http://127.0.0.1:8004/files');
      setFilesList(res.data);
      if (res.data.length > 0 && selectedFileId === null) {
        setSelectedFileId(res.data[0].id);
      } else if (res.data.length === 0) {
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
      // Single request replaces /db-status + /evaluated-comments
      const res = await axios.get(`http://127.0.0.1:8004/file-state/${selectedFileId}`);
      setDbStatus({ pending: res.data.pending, evaluated: res.data.evaluated });
      setEvaluatedComments(res.data.comments || []);
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
    fetchStatus();
  }, [selectedFileId]);

  // Poll /progress (lightweight) every 1.5s while a batch is running
  useEffect(() => {
    if (!evaluating || !selectedFileId) return;
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`http://127.0.0.1:8004/progress/${selectedFileId}`);
        setProgress(prev => prev ? { ...prev, evaluated: res.data.evaluated, pending: res.data.pending } : prev);
      } catch (e) { /* silent */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [evaluating, selectedFileId]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setMessage('');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('http://127.0.0.1:8004/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage(res.data.message);
      setFile(null);
      await fetchFiles();
    } catch (err) {
      setMessage('Upload failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!selectedFileId) return;
    setEvaluating(true);
    setMessage('');
    // Capture baseline so we know how many THIS batch will evaluate
    setProgress({ evaluated: dbStatus.evaluated, pending: dbStatus.pending, batchSize: parseInt(batchSize), startEvaluated: dbStatus.evaluated });
    try {
      const res = await axios.post('http://127.0.0.1:8004/evaluate-batch', { file_id: selectedFileId, batch_size: parseInt(batchSize), model: model });
      setMessage(res.data.message);
      if (res.data.pending !== undefined) {
        setDbStatus({ pending: res.data.pending, evaluated: res.data.evaluated });
      }
    } catch (err) {
      setMessage('Evaluation failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setEvaluating(false);
      setProgress(null);
      await fetchStatus(); // load newly evaluated comments
    }
  };
  
  const handleDeleteFile = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:8004/files/${id}`);
      if (selectedFileId === id) setSelectedFileId(null);
      fetchFiles();
    } catch (err) {
      console.error("Failed to delete file", err);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="dashboard-grid">
        <div className="main-column" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div className="card">
          <div className="card-header">
            <h2>CSV Data Ingestion</h2>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', marginTop: '4px' }}>
              Upload the Civil Comments CSV dataset. Data will be queued for evaluation.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <input 
              type="file" 
              accept=".csv" 
              onChange={(e) => setFile(e.target.files[0])}
              style={{ padding: '8px', border: '1px dashed var(--outline-variant)', flex: 1, borderRadius: '4px' }}
            />
            <button 
              className="btn btn-primary" 
              onClick={handleUpload}
              disabled={!file || uploading}
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
          
          {message && !uploading && !evaluating && <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--primary)' }}>{message}</div>}
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
                  disabled={evaluating}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--on-surface-variant)' }}>Model</label>
                <select 
                  value={model} 
                  onChange={(e) => setModel(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--outline-variant)', borderRadius: '4px' }}
                  disabled={evaluating}
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
                disabled={evaluating || dbStatus.pending === 0}
              >
                {evaluating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {evaluating ? 'Evaluating...' : 'Run Batch Analysis'}
              </button>
            </div>
            
            {evaluating && progress && (() => {
              const batchTotal   = progress.batchSize;
              const doneInBatch  = Math.max(0, progress.evaluated - progress.startEvaluated);
              const pct          = batchTotal > 0 ? Math.round((doneInBatch / batchTotal) * 100) : 0;
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
                  <PredictionDonut comments={evaluatedComments} />
                  <ConfidenceHistogram comments={evaluatedComments} />
                </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table className="metrics-table" style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Comment Text</th>
                      <th>LLM Prediction</th>
                      <th>Confidence</th>
                      <th>Ground Truth</th>
                      <th>Demographic Sub-Scores</th>
                      <th>API Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluatedComments.map(comment => {
                      return (
                        <React.Fragment key={comment.id}>
                          <tr style={{ backgroundColor: 'transparent' }}>
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
                                {[
                                  { k: 'toxic', v: comment.target },
                                  { k: 'severe', v: comment.severe_toxicity },
                                  { k: 'obscene', v: comment.obscene },
                                  { k: 'threat', v: comment.threat },
                                  { k: 'insult', v: comment.insult },
                                  { k: 'id_atk', v: comment.identity_attack },
                                  { k: 'sexual', v: comment.sexual_explicit },
                                ].filter(x => x.v != null).map(({ k, v }) => (
                                  <div key={k} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--on-surface-variant)', minWidth: '44px' }}>{k}:</span>
                                    <div style={{ height: '6px', borderRadius: '3px', width: `${Math.round(v * 60)}px`, minWidth: '2px',
                                      backgroundColor: v > 0.5 ? 'var(--toxic)' : v > 0.1 ? 'var(--tertiary)' : 'var(--outline-variant)' }} />
                                    <span>{v.toFixed(2)}</span>
                                  </div>
                                ))}
                                {comment.target == null && <span style={{ color: 'var(--on-surface-variant)' }}>—</span>}
                              </div>
                            </td>
                            <td>
                              <button
                                className="btn"
                                style={{ padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--surface-container-high)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  try {
                                    setModalData(JSON.parse(comment.tokens_json || '{}'));
                                  } catch (err) {
                                    setModalData({ error: 'No debug data available.' });
                                  }
                                }}
                              >
                                <Code size={14} /> Logprobs
                              </button>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
            <h2 style={{ margin: 0, fontSize: '18px' }}>Zero-Shot API Request & Logprobs</h2>
            <button onClick={() => setModalData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)' }}><X size={20} /></button>
          </div>
          
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '14px', color: 'var(--on-surface-variant)', marginBottom: '8px' }}>Raw Prompt Sent:</h3>
              <pre style={{ backgroundColor: 'var(--surface-container-low)', color: 'var(--on-surface)', padding: '16px', borderRadius: '6px', whiteSpace: 'pre-wrap', fontSize: '13px', border: '1px solid var(--outline-variant)', margin: 0 }}>
                {modalData.prompt || 'N/A'}
              </pre>
            </div>
            
            <div>
              <h3 style={{ fontSize: '14px', color: 'var(--on-surface-variant)', marginBottom: '8px' }}>Raw LLM Response:</h3>
              <pre style={{ backgroundColor: '#1e1e1e', color: '#00ff88', padding: '16px', borderRadius: '6px', fontSize: '20px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                {modalData.raw_response || 'N/A'}
              </pre>
            </div>

            <div>
              <h3 style={{ fontSize: '14px', color: 'var(--on-surface-variant)', marginBottom: '8px' }}>Logprobs (Used for Mathematical Scoring):</h3>
              <pre style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '16px', borderRadius: '6px', overflowX: 'auto', fontSize: '13px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                {JSON.stringify(modalData.logprobs || modalData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

export default BulkUploadPanel;
