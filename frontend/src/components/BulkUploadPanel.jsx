import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, Play, Loader2, Database, Trash2, Code, X } from 'lucide-react';
import InterpretabilityHeatmap from './InterpretabilityHeatmap';
import InterpretabilityPanel from './InterpretabilityPanel';
import { PredictionDonut, ConfidenceHistogram, TokenHeatmap } from './Charts';

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
      setGlobalStats(res.data.stats || null);
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

  const handleEvaluate = () => {
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
    };
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
          
          {message && !uploading && !isEvaluating && <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--primary)' }}>{message}</div>}
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
                              <td colSpan="6" style={{ padding: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                  <div>
                                    <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--on-surface)', marginBottom: '12px' }}>
                                      {(() => {
                                        const p = JSON.parse(comment.tokens_json || '{}');
                                        // Robust key checking
                                        const rat = p.toxicity_rationale || p.rationale || p.toxicity || (p.raw_response ? JSON.parse(p.raw_response).toxicity_rationale : null);
                                        const tks = p.tokens || (p.raw_response ? JSON.parse(p.raw_response).tokens : []);
                                        
                                        return (
                                          <>
                                            <div style={{ marginBottom: '8px' }}>{rat || 'No rationale available for this record.'}</div>
                                            <TokenHeatmap tokens={tks} fullText={comment.text} />
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Identity Detections</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                      {(() => {
                                        const p = JSON.parse(comment.tokens_json || '{}');
                                        const raw_dets = p.raw_response ? JSON.parse(p.raw_response).detections : (p.detections || {});
                                        
                                        const idents = [
                                          { label: 'MALE', val: comment.male || raw_dets.male },
                                          { label: 'FEMALE', val: comment.female || raw_dets.female },
                                          { label: 'CHRISTIAN', val: comment.christian || raw_dets.christian },
                                          { label: 'JEWISH', val: comment.jewish || raw_dets.jewish },
                                          { label: 'MUSLIM', val: comment.muslim || raw_dets.muslim },
                                          { label: 'THREAT', val: comment.threat_group || raw_dets.threat_group },
                                        ].filter(i => i.val > 0.5);

                                        if (idents.length === 0) return <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>No protected identities detected.</span>;

                                        return idents.map(i => (
                                          <span key={i.label} style={{ 
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', 
                                            backgroundColor: 'var(--surface-container-high)', color: 'var(--secondary)',
                                            border: '1px solid var(--secondary)'
                                          }}>
                                            {i.label}
                                          </span>
                                        ));
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
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
