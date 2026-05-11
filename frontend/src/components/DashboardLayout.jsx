import React, { useState, useEffect } from 'react';
import { Brain, BarChart3, Database, FlaskConical, BookOpen, LayoutDashboard, Moon, Sun } from 'lucide-react';

const DashboardLayout = ({ children, activeTab, setActiveTab }) => {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Brain size={24} color="var(--primary)" />
          <h2>Bias Lens</h2>
        </div>
        <nav className="sidebar-content">
          <h3 style={{ marginTop: '16px' }}>Overview</h3>
          <a 
            className={`nav-item ${activeTab === 'docs' ? 'active' : ''}`}
            onClick={() => setActiveTab('docs')}
          >
            <BookOpen size={18} />
            Implementation Documentation
          </a>
          <h3 style={{ marginTop: '16px' }}>Dataset</h3>
          <a 
            className={`nav-item ${activeTab === 'bulk' ? 'active' : ''}`}
            onClick={() => setActiveTab('bulk')}
          >
            <Database size={18} />
            <span>
              Bulk Evaluation
              <span style={{ display: 'block', fontSize: '11px', opacity: 0.65, fontWeight: 400, marginTop: '1px' }}>Zero-Shot Classification</span>
            </span>
          </a>
          <h3 style={{ marginTop: '16px' }}>Analysis</h3>
          <a 
            className={`nav-item ${activeTab === 'classify' ? 'active' : ''}`}
            onClick={() => setActiveTab('classify')}
          >
            <FlaskConical size={18} />
            Deep Dive — Single Comment
          </a>
          <a 
            className={`nav-item ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <BarChart3 size={18} />
            Subgroup Fairness Metrics
          </a>
        </nav>
      </aside>
      
      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '6px' }}>
                {activeTab === 'docs' && 'Overview / Implementation Documentation'}
                {activeTab === 'bulk' && 'Dataset / Bulk Evaluation'}
                {activeTab === 'classify' && 'Analysis / Deep Dive'}
                {activeTab === 'metrics' && 'Analysis / Subgroup Fairness Metrics'}
              </div>
              <h1 style={{ margin: 0 }}>
              {activeTab === 'docs'     && 'Architecture & Implementation Details'}
              {activeTab === 'bulk'     && 'Bulk Evaluation — Zero-Shot LLM Toxicity Classification'}
              {activeTab === 'classify' && 'Deep Dive — Token Attribution & Interpretability'}
              {activeTab === 'metrics'  && 'Subgroup Fairness Metrics — SPD & EOpp Analysis'}
            </h1>
            </div>
            <button 
              onClick={() => setIsDark(!isDark)} 
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '50%', backgroundColor: 'var(--surface-container)' }}
              title="Toggle Dark Mode"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
