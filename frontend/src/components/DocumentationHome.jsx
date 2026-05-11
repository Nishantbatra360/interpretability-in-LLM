import React from 'react';
import { BookOpen, Terminal, Code, Zap, Activity, ShieldCheck, Database, Target, AlertTriangle } from 'lucide-react';

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
            <div style={{ color: 'var(--primary)', padding: '4px' }}>
              <BookOpen size={48} strokeWidth={1.5} />
            </div>
            <div>
              <h2 style={{ fontSize: '32px', fontWeight: '800', margin: 0 }}>Implementation Whitepaper</h2>
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '16px', marginTop: '4px' }}>
                Technical architecture for the Bias Lens diagnostic suite.
              </p>
            </div>
          </div>
          <p style={{ color: 'var(--on-surface)', fontSize: '15px', lineHeight: 1.8 }}>
            Bias Lens is an enterprise POC built to audit Large Language Models for subtle biases, 
            toxic alignment gaps, and statistical disparities. The pipeline is broken into three core modules: 
            Bulk Evaluation, Subgroup Fairness, and Interpretability Deep Dive.
          </p>
        </div>

        {/* 1. Zero-Shot Classification */}
        <section style={{ marginBottom: '64px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={28} />
            1. Zero-Shot Bulk Evaluation
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.8, marginBottom: '20px' }}>
            Following the reference plan (§1.2), the LLM outputs raw <strong>log-probabilities</strong> for both labels independently. The server then computes the composite score, classification, and confidence mathematically — making every prediction fully auditable.
          </p>
          
          <CodeBlock
            title="LLM Output → Server-Side Computation"
            code={`// Step 1: LLM returns raw log-probabilities
{
  "log_prob_toxic": -0.35,      // log P(Toxic | x)
  "log_prob_nontoxic": -2.80,   // log P(Non-Toxic | x)
  "detections": { "male": 0, "female": 0, ... },
  "toxicity_rationale": "...",
  "identity_rationale": "..."
}

// Step 2: Server computes classification
s(x)       = log_prob_toxic - log_prob_nontoxic  // = -0.35 - (-2.80) = +2.45
ŷ          = sign(s(x)) > 0 ? "Toxic" : "Non-Toxic"  // = Toxic
confidence = σ(|s(x)|) = 1 / (1 + e^(-2.45))    // = 0.9203`}
          />

          <InfoBox title="Design Decision: Server-Side Math" icon={Zap}>
            By extracting raw log-probabilities from the LLM and computing classification server-side, we eliminate the LLM's own thresholding bias. The user can inspect the exact values (log P(toxic|x), log P(non-toxic|x), s(x), σ) for every single comment by clicking its row. Token-level attribution is reserved for the Deep Dive module.
          </InfoBox>
        </section>

        {/* 2. Interpretability Section */}
        <section style={{ marginBottom: '64px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Code size={28} />
            2. Interpretability Deep-Dive (Per-Token Attribution)
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.8, marginBottom: '20px' }}>
            Following the reference plan (§1.3), the Deep Dive performs <strong>explanation signal extraction</strong> on a single comment. Since true Integrated Gradients (IG) require white-box model access, we implement a <strong>Generative Attribution Proxy</strong>: the LLM decomposes its reasoning into per-word <code>toxic_score</code> and <code>safe_score</code>, which are combined server-side into a single attribution value.
          </p>
          
          <CodeBlock
            title="Attribution Computation (Server-Side)"
            code={`// For each token returned by the LLM:
attribution = toxic_score - safe_score

// toxic_score: How much does this word contribute to toxicity? (0.0 - 1.0)
// safe_score:  How much does this word signal safety/politeness? (0.0 - 1.0)

// Result:
//   attribution > 0  → Token pushes toward TOXIC  (Red in heatmap)
//   attribution < 0  → Token pushes toward SAFE   (Green in heatmap)
//   attribution ≈ 0  → Neutral token              (No highlight)`}
          />
          
          <ul style={{ fontSize: '14px', lineHeight: 1.7, marginBottom: '20px', paddingLeft: '24px' }}>
            <li><strong>Toxicity & Safety Scores:</strong> Computed by averaging the strictly positive and negative attribution values across all tokens.</li>
            <li><strong>Δlogit (Net Bias):</strong> The mathematical difference: <code>ToxicityScore − SafetyScore</code>. Positive = overall toxic signal.</li>
            <li><strong>Diagnostic Anomalies:</strong> When local token-level math contradicts the global model classification (e.g., "terrorist" has high toxic_score but overall comment is Non-Toxic due to political commentary context).</li>
            <li><strong>Focus Score:</strong> Entropy-based metric measuring whether the model relied on a few key words (focused) or distributed attention broadly (diffuse).</li>
          </ul>

          <InfoBox title="Why Two Separate Scores?" icon={AlertTriangle}>
            Small LLMs (8B parameters) confuse "positive/negative attribution" with sentiment polarity — assigning negative scores to harmful words like "bad" because the word has negative sentiment. By asking for independent <code>toxic_score</code> and <code>safe_score</code> and computing attribution server-side, we eliminate this alignment failure entirely.
          </InfoBox>
        </section>

        {/* 3. Fairness Metrics Section */}
        <section style={{ marginBottom: '64px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={28} />
            3. Subgroup Fairness Metrics
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.8, marginBottom: '20px' }}>
            By cross-referencing the LLM's Toxicity classifications against the detected protected identities (Gender, Religion, etc.) and the original dataset's Ground Truth labels, we generate a comprehensive fairness audit.
          </p>

          <ul style={{ fontSize: '14px', lineHeight: 1.7, marginBottom: '24px', paddingLeft: '24px' }}>
            <li><strong>Confusion Matrices:</strong> We calculate True Positives, False Positives, True Negatives, and False Negatives per subgroup to understand exactly where the model fails.</li>
            <li><strong>False Positive Word Clouds:</strong> We extract and aggregate words from comments that the LLM incorrectly flagged as Toxic, highlighting specific linguistic triggers (e.g., AAVE or religious terms) causing systemic bias.</li>
          </ul>

          <FormulaLegend />

        </section>

      </div>
    </div>
  );
};

export default DocumentationHome;
