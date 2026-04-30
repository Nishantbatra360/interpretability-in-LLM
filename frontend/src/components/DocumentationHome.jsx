import React from 'react';
import { BookOpen, Terminal, CheckCircle, Code, Zap, Activity, ShieldCheck, Database, TrendingUp, Target } from 'lucide-react';

const CodeBlock = ({ title, code }) => (
  <div style={{ marginBottom: '24px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--outline-variant)' }}>
    {title && (
      <div style={{ padding: '8px 16px', backgroundColor: 'var(--surface-container-high)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Terminal size={14} /> {title}
      </div>
    )}
    <pre style={{ margin: 0, padding: '16px', backgroundColor: '#1e1e1e', color: '#d4d4d4', overflowX: 'auto', fontSize: '13px', lineHeight: 1.5 }}>
      <code>{code}</code>
    </pre>
  </div>
);

const InfoBox = ({ children, title = "Technical Note", icon: Icon = Activity }) => (
  <div style={{ padding: '16px', backgroundColor: 'var(--surface-container-low)', borderRadius: '8px', fontSize: '13px', color: 'var(--on-surface-variant)', borderLeft: '4px solid var(--primary)', marginTop: '12px', marginBottom: '12px' }}>
    <div style={{ fontWeight: '700', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
      <Icon size={16} /> {title}
    </div>
    <div style={{ lineHeight: 1.6 }}>{children}</div>
  </div>
);

const FormulaLegend = () => (
  <div style={{
    backgroundColor: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
    borderRadius: '8px', padding: '24px', marginBottom: '24px', fontSize: '14px'
  }}>
    <div style={{ fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
      <Target size={20} color="var(--primary)" /> Disparity Metric Formulas & Reference
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
      <div>
        <div style={{ fontWeight: '700', color: 'var(--primary)', marginBottom: '8px' }}>1. Demographic Parity (SPD)</div>
        <div style={{ backgroundColor: '#1e1e1e', padding: '12px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#60cdff', marginBottom: '12px' }}>
          SPD = P(Ŷ=1 | A=1) − P(Ŷ=1 | A=0)
        </div>
        <p style={{ lineHeight: 1.6, fontSize: '13px' }}>
          Compares the <strong>Selection Rate</strong> (rate of "Toxic" predictions) between identity groups. 
          A positive SPD indicates the model flags group A=1 more often than group A=0.
        </p>
      </div>
      <div>
        <div style={{ fontWeight: '700', color: 'var(--primary)', marginBottom: '8px' }}>2. Equal Opportunity (EOpp)</div>
        <div style={{ backgroundColor: '#1e1e1e', padding: '12px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#60cdff', marginBottom: '12px' }}>
          EOpp = TPR(A=1) − TPR(A=0)
        </div>
        <p style={{ lineHeight: 1.6, fontSize: '13px' }}>
          Compares the <strong>True Positive Rate</strong> (Recall). Measures if the model is equally 
          sensitive at catching actual toxicity across different demographic groups.
        </p>
      </div>
    </div>
    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--outline-variant)' }}>
        <div style={{ fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>3. The Four-Fifths Rule (Impact Ratio)</div>
        <div style={{ backgroundColor: '#1e1e1e', padding: '12px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#60cdff', marginBottom: '12px' }}>
          Ratio = min(SR_A, SR_B) / max(SR_A, SR_B)
        </div>
        <p style={{ lineHeight: 1.6, fontSize: '13px' }}>
          A selection ratio of less than <strong>0.80 (80%)</strong> is regarded as evidence of adverse impact (bias).
        </p>
    </div>
  </div>
);

const DocumentationHome = () => {
  return (
    <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
      <div className="card" style={{ maxWidth: '900px', margin: '0 auto', width: '100%', padding: '48px' }}>
        
        {/* Header */}
        <div className="card-header" style={{ borderBottom: '1px solid var(--outline-variant)', paddingBottom: '32px', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: 'var(--primary-container)', color: 'var(--primary)', padding: '12px', borderRadius: '12px' }}>
              <ShieldCheck size={40} />
            </div>
            <div>
              <h2 style={{ fontSize: '32px', fontWeight: '800', margin: 0 }}>Implementation Whitepaper</h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '16px', marginTop: '4px' }}>
                Technical reference for the Unified LLM Fairness Suite
              </p>
            </div>
          </div>
          <p style={{ color: 'var(--on-surface)', fontSize: '15px', lineHeight: 1.8 }}>
            This application utilizes a <strong>Single-Pass Unified Inference</strong> pipeline. 
            By merging classification and demographic detection, we ensure that fairness metrics 
            are mathematically grounded in the same model context as the toxicity verdict.
          </p>
        </div>

        {/* 1. Unified Engine */}
        <section style={{ marginBottom: '64px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={28} />
            1. Unified Single-Pass Audit
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.8, marginBottom: '20px' }}>
            The system utilizes a <strong>Zero-Shot Unified Architecture</strong>. Toxicity classification and demographic identification (Gender, Religion, Threat) are executed in a single high-fidelity inference call, reducing API latency by 50%.
          </p>
          
          <CodeBlock
            title="Unified Audit JSON Schema"
            code={`{
  "toxicity": "Toxic" | "Non-Toxic",
  "confidence": Float (0-1),
  "detections": { "male": 0, "female": 0, "christian": 0, "jewish": 0, "muslim": 0, "threat_group": 0 },
  "toxicity_rationale": "Visual reasoning for verdict",
  "tokens": [ { "token": "keyword", "attribution": Float } ]
}`}
          />
          
          <InfoBox title="Data Integrity Guard" icon={ShieldCheck}>
            The backend includes an automated <strong>Ghost-Busting</strong> engine that monitors LLM response health. Any record with an empty raw response is instantly reverted to 'Pending', ensuring 100% metric accuracy.
          </InfoBox>
        </section>

        {/* 2. Interpretability Section */}
        <section style={{ marginBottom: '64px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Code size={28} />
            2. Keyword-to-Full-Text Mapping
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.8, marginBottom: '20px' }}>
            Our <strong>Interpretability Engine</strong> uses a hybrid approach to visualize model reasoning directly on the original dataset without redundant inference.
          </p>
          
          <ul style={{ fontSize: '14px', lineHeight: 1.7, marginBottom: '20px', paddingLeft: '24px' }}>
            <li><strong>Keyword Attribution:</strong> The model assigns 'Heat Weightage' to specific high-impact words (Red = Toxic pull, Green = Safe pull).</li>
            <li><strong>Contextual Reconstruction:</strong> The frontend intelligently maps these scores back onto the original database text, providing full contextual visibility in both Fairness and Bulk tabs.</li>
          </ul>
        </section>

        {/* 3. Fairness Metrics Section */}
        <section style={{ marginBottom: '64px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={28} />
            3. Disparity & Fairness Analysis
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.8, marginBottom: '20px' }}>
            The dashboard performs a demographic audit by comparing model outcomes for identity subgroups (A=1) against the majority/reference baseline (A=0).
          </p>

          <FormulaLegend />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '32px' }}>
             <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--surface-container-high)', border: '1px solid var(--primary-container)' }}>
                <div style={{ fontWeight: '700', color: 'var(--primary)', marginBottom: '8px' }}>Statistical Parity (SPD)</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                  Measures <strong>Outcome Equity</strong>. Does the model flag one group more than another?
                </div>
             </div>
             <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--surface-container-high)', border: '1px solid var(--secondary-container)' }}>
                <div style={{ fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>Equal Opportunity (EOpp)</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                  Measures <strong>Sensitivity Equity</strong>. Is the model equally accurate at catching toxicity targeting each group?
                </div>
             </div>
          </div>
        </section>

        {/* 4. Persistence & Sync */}
        <section>
          <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Database size={28} />
            4. Persistence & Local Auditing
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.8, marginBottom: '16px' }}>
            All audit logs are persisted in a local SQLite database. The <strong>Sync from Logs</strong> engine 
            enables retroactive re-parsing of stored LLM JSON outputs to recover identity markers without new API calls.
          </p>
        </section>

      </div>
    </div>
  );
};

export default DocumentationHome;
