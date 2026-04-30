import { Brain, BarChart3, Database, FlaskConical, BookOpen } from 'lucide-react';

const DashboardLayout = ({ children, activeTab, setActiveTab }) => {
  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Brain size={24} color="var(--primary)" />
          <h2>LLM Interpretability</h2>
        </div>
        <nav className="sidebar-content">
          <h3 style={{ marginTop: '16px' }}>Overview</h3>
          <a 
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
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
          <h1>
            {activeTab === 'home'     && 'Architecture & Implementation Details'}
            {activeTab === 'bulk'     && 'Bulk Evaluation — Zero-Shot LLM Toxicity Classification'}
            {activeTab === 'classify' && 'Deep Dive — Token Attribution & Interpretability'}
            {activeTab === 'metrics'  && 'Subgroup Fairness Metrics — SPD & EOpp Analysis'}
          </h1>
        </header>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
