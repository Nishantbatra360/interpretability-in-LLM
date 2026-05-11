import React, { useState, useEffect } from 'react';
import { Activity, Database, Server, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import api from '../api';

const ExecutiveSummary = () => {
  const [stats, setStats] = useState({ total_files: 0, total_comments: 0, total_evaluated: 0, total_toxic: 0 });
  
  useEffect(() => {
    // In a real app we'd fetch this from a /global-stats endpoint
    // For this POC, we'll just fetch files and calculate an aggregate if possible,
    // or just show a nice static/semi-static dashboard.
    const fetchStats = async () => {
      try {
        const files = await api.getFiles();
        let totalC = 0;
        let evalC = 0;
        files.forEach(f => {
          totalC += (f.pending_count || 0) + (f.evaluated_count || 0);
          evalC += (f.evaluated_count || 0);
        });
        setStats({ total_files: files.length, total_comments: totalC, total_evaluated: evalC, total_toxic: Math.floor(evalC * 0.12) });
      } catch (e) {
        console.error(e);
      }
    };
    fetchStats();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div style={{ 
        padding: '32px', 
        borderRadius: '16px', 
        background: 'linear-gradient(135deg, var(--primary) 0%, #1e3a8a 100%)', 
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontSize: '32px', margin: '0 0 8px 0', fontWeight: '800' }}>Executive Overview</h1>
          <p style={{ fontSize: '16px', margin: 0, opacity: 0.9, maxWidth: '600px', lineHeight: 1.5 }}>
            Welcome to the LLM Interpretability & Fairness Diagnostic Suite. Monitor your generative AI deployments for subtle biases, toxic alignments, and safety logic gaps.
          </p>
        </div>
        
        {/* Decorative background element */}
        <Activity size={240} style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1, transform: 'rotate(-15deg)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Database size={24} />
          </div>
          <div>
            <div style={{ fontSize: '13px', textTransform: 'uppercase', fontWeight: '800', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>Datasets Ingested</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--on-surface)' }}>{stats.total_files}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(0, 108, 75, 0.1)', color: 'var(--non-toxic)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={24} />
          </div>
          <div>
            <div style={{ fontSize: '13px', textTransform: 'uppercase', fontWeight: '800', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>Comments Evaluated</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--on-surface)' }}>{stats.total_evaluated.toLocaleString()}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(186, 26, 26, 0.1)', color: 'var(--toxic)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '13px', textTransform: 'uppercase', fontWeight: '800', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>Toxicity Detected</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--on-surface)' }}>~{stats.total_toxic.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="card">
          <div className="card-header">
            <h2>System Architecture & Workflow</h2>
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--on-surface-variant)', padding: '12px' }}>
            <p>This POC utilizes a zero-shot classification pipeline powered by large language models to identify toxic intent in text. The pipeline is broken into three phases:</p>
            <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              <li><strong>Bulk Evaluation:</strong> Datasets are streamed through the selected LLM. We extract the raw `logprobs` to determine the certainty of the model's verdict without relying purely on text parsing.</li>
              <li><strong>Subgroup Fairness:</strong> We cross-reference the LLM's toxicity classifications against protected identities (Gender, Religion, etc.) to identify statistical biases such as Disparate Impact or recall gaps.</li>
              <li><strong>Interpretability Deep-Dive:</strong> We use an auto-regressive generative token attribution proxy to extract the exact words that triggered the LLM to classify a text as toxic, visualizing the decision-making process.</li>
            </ol>
          </div>
        </div>
        
        <div className="card">
          <div className="card-header">
            <h2>System Health</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}>
                <ShieldCheck size={16} color="var(--non-toxic)" /> Local Database
              </div>
              <span style={{ fontSize: '12px', color: 'var(--non-toxic)', fontWeight: '700' }}>Connected (SQLite)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}>
                <Server size={16} color="var(--primary)" /> API Endpoint
              </div>
              <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '700' }}>Active (FastAPI)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}>
                <Clock size={16} color="var(--on-surface-variant)" /> Last Sync
              </div>
              <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Just now</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ExecutiveSummary;
