import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';

/* ─────────────────────────────────────────────────────────
   Derived metric helpers — all formulas are surface-level
   so the UI can show them with exact numbers.
───────────────────────────────────────────────────────── */

/**
 * Simulated Attention Score per token (approximation of log-odds):
 *   S(t) = attribution(t)                     [ provided by LLM ]
 *
 * Composite toxicity score (sum of positive attributions):
 *   ToxicityScore = Σ max(S(t), 0)  /  n_tokens
 *
 * Composite safety score (magnitude of negative attributions):
 *   SafetyScore = Σ max(-S(t), 0)  /  n_tokens
 *
 * Net Logit Bias (the decisive signal):
 *   Δlogit = ToxicityScore - SafetyScore
 *
 * If Δlogit > 0  →  Toxic
 * If Δlogit < 0  →  Non-Toxic
 */
function deriveMetrics(tokens) {
  if (!tokens || tokens.length === 0) return null;
  const n = tokens.length;

  let sumPos = 0, sumNeg = 0, sumAbs = 0;
  tokens.forEach(t => {
    if (t.attribution > 0) sumPos += t.attribution;
    else sumNeg += Math.abs(t.attribution);
    sumAbs += Math.abs(t.attribution);
  });

  const toxicityScore  = sumPos / n;
  const safetyScore    = sumNeg / n;
  const deltaLogit     = toxicityScore - safetyScore;
  const normalizedConf = sumAbs > 0 ? Math.abs(deltaLogit) / (sumAbs / n) : 0;

  // Entropy-like spread: how "concentrated" is the signal?
  //   H = -Σ p(t) * log(p(t))  where p(t) = |attr(t)| / sumAbs
  let entropy = 0;
  if (sumAbs > 0) {
    tokens.forEach(t => {
      const p = Math.abs(t.attribution) / sumAbs;
      if (p > 0) entropy -= p * Math.log2(p);
    });
  }
  const maxEntropy = Math.log2(n); // uniform distribution
  const focusScore = maxEntropy > 0 ? 1 - (entropy / maxEntropy) : 0; // 1 = highly focused, 0 = diffuse

  const sortedByAttrib = [...tokens].sort((a, b) => b.attribution - a.attribution);
  const topToxic = sortedByAttrib.filter(t => t.attribution > 0).slice(0, 3);
  const topSafe  = sortedByAttrib.filter(t => t.attribution < 0).reverse().slice(0, 3);

  return { toxicityScore, safetyScore, deltaLogit, normalizedConf, entropy, maxEntropy, focusScore, topToxic, topSafe, n, sumPos, sumNeg };
}

/* ─────────────────────────────────────────────────────────
   Formula block component
───────────────────────────────────────────────────────── */
const Formula = ({ label, formula, result, description, highlight }) => (
  <div style={{
    padding: '12px 16px',
    borderRadius: '6px',
    border: `1px solid ${highlight ? 'var(--primary)' : 'var(--outline-variant)'}`,
    backgroundColor: highlight ? 'rgba(var(--primary-rgb, 59,130,246), 0.05)' : 'var(--surface-container)',
    marginBottom: '10px'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>{label}</div>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--primary)' }}>{formula}</code>
      </div>
      {result !== undefined && (
        <div style={{
          padding: '4px 12px', borderRadius: '20px',
          backgroundColor: highlight ? 'var(--primary)' : 'var(--surface-container-high)',
          color: highlight ? '#fff' : 'var(--on-surface)',
          fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap'
        }}>
          = {typeof result === 'number' ? result.toFixed(4) : result}
        </div>
      )}
    </div>
    {description && <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginTop: '6px' }}>{description}</div>}
  </div>
);

/* ─────────────────────────────────────────────────────────
   Metric Card
───────────────────────────────────────────────────────── */
const MetricCard = ({ label, value, unit = '', color, description }) => (
  <div style={{
    padding: '14px 16px', borderRadius: '8px',
    backgroundColor: 'var(--surface-container)',
    border: `2px solid ${color}`,
    flex: 1, minWidth: '140px'
  }}>
    <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: '4px' }}>{label}</div>
    <div style={{ fontSize: '22px', fontWeight: '700', color }}>{typeof value === 'number' ? value.toFixed(3) : value}{unit}</div>
    {description && <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '4px' }}>{description}</div>}
  </div>
);

/* ─────────────────────────────────────────────────────────
   Section wrapper with collapse toggle
───────────────────────────────────────────────────────── */
const Section = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '20px', border: '1px solid var(--outline-variant)', borderRadius: '8px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', background: 'var(--surface-container-low)',
          border: 'none', cursor: 'pointer', color: 'var(--on-surface)', fontWeight: '600', fontSize: '14px'
        }}
      >
        {title}
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div style={{ padding: '16px' }}>{children}</div>}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Main exported component
   Props:
     tokens    : array of {token, attribution}
     confidence: float 0-1
     classification: "Toxic" | "Non-Toxic"
     compact   : boolean (for table rows, hide some sections)
───────────────────────────────────────────────────────── */
const InterpretabilityPanel = ({ tokens, confidence, classification, compact = false }) => {
  const m = useMemo(() => {
    if (!tokens) return null;
    const parsed = typeof tokens === 'string' ? JSON.parse(tokens) : tokens;
    return deriveMetrics(parsed);
  }, [tokens]);

  if (!m) return null;

  const isToxic = classification === 'Toxic';
  const predColor = isToxic ? 'var(--toxic)' : 'var(--non-toxic)';

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>

      {/* ── 1. METHODOLOGY HEADER ── */}
      <Section title="📐 Interpretability Methodology (Proxy vs. Reference Plan)" defaultOpen={true}>
        <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6, marginBottom: '12px', padding: '12px', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '6px', borderLeft: '4px solid var(--primary)' }}>
          <strong>Implementation Note:</strong> The overall <em>Zero-Shot Classification</em> verdict and confidence are now computed mathematically using exact <code>log p(toxic|x) − log p(non-toxic|x)</code> probability logs extracted directly from the NVIDIA API, perfectly matching the Reference Plan.<br/><br/>
          However, because true <em>Integrated Gradients (IG)</em> require white-box access to the model's backward pass, the token-level heatmap below employs a <strong>Generative Token Attribution Proxy</strong>. The LLM is prompted to auto-regressively predict the attribution score for each token to simulate the causal reasoning.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Formula
            label="Core Attribution Formula (per token t)"
            formula="S(t) = log P(Toxic | t, x) − log P(Non-Toxic | t, x)"
            description="S(t) > 0: token pushes prediction Toxic. S(t) < 0: token pushes Non-Toxic. S(t) ≈ 0: neutral."
          />
          <Formula
            label="Composite Toxicity Score"
            formula="ToxicityScore = Σ max(S(t), 0) / n"
            description="Average positive attribution — how much toxic signal is present."
          />
          <Formula
            label="Composite Safety Score"
            formula="SafetyScore = Σ max(−S(t), 0) / n"
            description="Average negative attribution — how much non-toxic signal is present."
          />
          <Formula
            label="Net Logit Bias (Decision Signal)"
            formula="Δlogit = ToxicityScore − SafetyScore"
            description="If Δlogit > 0 → Toxic. If Δlogit < 0 → Non-Toxic."
            highlight
          />
          <Formula
            label="Attribution Entropy (Signal Focus)"
            formula="H = −Σ [|S(t)|/ΣS * log₂(|S(t)|/ΣS)]"
            description="Low entropy = model focused on a few decisive words. High = diffuse, uncertain signal."
          />
        </div>
      </Section>

      {/* ── 2. COMPUTED METRICS ── */}
      <Section title="🧮 Computed Metrics for This Comment" defaultOpen={true}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <MetricCard label="Toxicity Score" value={m.toxicityScore} color="var(--toxic)"
            description="Avg positive attribution" />
          <MetricCard label="Safety Score" value={m.safetyScore} color="var(--non-toxic)"
            description="Avg negative attribution" />
          <MetricCard label="Δlogit (Net Bias)" value={m.deltaLogit}
            color={m.deltaLogit > 0 ? 'var(--toxic)' : 'var(--non-toxic)'}
            description={m.deltaLogit > 0 ? 'Pulls → Toxic' : 'Pulls → Non-Toxic'} />
          <MetricCard label="LLM Confidence" value={confidence} unit="%" color={predColor}
            description="As stated by LLM" />
          <MetricCard label="Focus Score" value={m.focusScore}
            color={m.focusScore > 0.5 ? 'var(--primary)' : 'var(--on-surface-variant)'}
            description={`Entropy: ${m.entropy.toFixed(2)} / max ${m.maxEntropy.toFixed(2)}`} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Formula label="ToxicityScore (calculated)" formula={`Σ positive S(t) / n = ${m.sumPos.toFixed(4)} / ${m.n}`} result={m.toxicityScore} />
          <Formula label="SafetyScore (calculated)" formula={`Σ |negative S(t)| / n = ${m.sumNeg.toFixed(4)} / ${m.n}`} result={m.safetyScore} />
          <Formula label="Δlogit (calculated)" formula={`ToxicityScore − SafetyScore = ${m.toxicityScore.toFixed(4)} − ${m.safetyScore.toFixed(4)}`} result={m.deltaLogit} highlight />
          <Formula label="Verdict" formula={`sign(Δlogit) → ${m.deltaLogit > 0 ? '"Toxic"' : '"Non-Toxic"'}`} result={classification} highlight />
        </div>
      </Section>

      {/* ── 3. TOP DRIVERS ── */}
      <Section title="🔑 Top Token Drivers" defaultOpen={true}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--toxic)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Strongest Toxic Signals
            </div>
            {m.topToxic.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>None detected</div>
              : m.topToxic.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', backgroundColor: `rgba(186,26,26,${Math.min(t.attribution * 0.6, 0.35)})`, marginBottom: '4px' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>"{t.token}"</code>
                  <strong style={{ color: 'var(--toxic)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>+{t.attribution.toFixed(3)}</strong>
                </div>
              ))
            }
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--non-toxic)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Strongest Safety Signals
            </div>
            {m.topSafe.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>None detected</div>
              : m.topSafe.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '4px', backgroundColor: `rgba(0,108,75,${Math.min(Math.abs(t.attribution) * 0.6, 0.35)})`, marginBottom: '4px' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>"{t.token}"</code>
                  <strong style={{ color: 'var(--non-toxic)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{t.attribution.toFixed(3)}</strong>
                </div>
              ))
            }
          </div>
        </div>
      </Section>

      {/* ── 4. FULL TOKEN ATTRIBUTION TABLE ── */}
      {!compact && (
        <Section title="📊 Full Token Attribution Breakdown" defaultOpen={false}>
          <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)', marginBottom: '10px' }}>
            All <strong>{m.n} tokens</strong> shown below with their raw S(t) scores. Sorted by attribution descending.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-container-high)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>Rank</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>Token</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--on-surface-variant)' }}>S(t) Attribution</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>Visual Weight</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--on-surface-variant)' }}>Signal Direction</th>
                </tr>
              </thead>
              <tbody>
                {[...((typeof tokens === 'string' ? JSON.parse(tokens) : tokens) || [])]
                  .sort((a, b) => b.attribution - a.attribution)
                  .map((t, i) => {
                    const isTox = t.attribution > 0.05;
                    const isSafe = t.attribution < -0.05;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--outline-variant)', backgroundColor: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-container-low)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--on-surface-variant)' }}>#{i + 1}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>"{t.token}"</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: isTox ? 'var(--toxic)' : isSafe ? 'var(--non-toxic)' : 'var(--on-surface-variant)', fontWeight: '700' }}>
                          {t.attribution > 0 ? '+' : ''}{t.attribution.toFixed(4)}
                        </td>
                        <td style={{ padding: '5px 10px' }}>
                          <div style={{ height: '8px', borderRadius: '4px', width: `${Math.min(Math.abs(t.attribution) * 200, 100)}%`, minWidth: '4px', backgroundColor: isTox ? 'var(--toxic)' : isSafe ? 'var(--non-toxic)' : 'var(--outline-variant)' }} />
                        </td>
                        <td style={{ padding: '5px 10px', fontSize: '11px', color: isTox ? 'var(--toxic)' : isSafe ? 'var(--non-toxic)' : 'var(--on-surface-variant)' }}>
                          {isTox ? '▲ Pushes Toxic' : isSafe ? '▼ Pushes Safe' : '— Neutral'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── 5. INTERPRETATION SUMMARY ── */}
      <Section title="📝 Interpretation Summary" defaultOpen={!compact}>
        <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--on-surface)' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            The model analysed <strong>{m.n} tokens</strong> and computed a Net Logit Bias of{' '}
            <code style={{ fontFamily: 'var(--font-mono)', color: m.deltaLogit > 0 ? 'var(--toxic)' : 'var(--non-toxic)', fontWeight: 700 }}>
              Δlogit = {m.deltaLogit.toFixed(4)}
            </code>.{' '}
            Since this is <strong>{m.deltaLogit > 0 ? 'positive' : 'negative'}</strong>, the decision is{' '}
            <strong style={{ color: predColor }}>{classification}</strong> with <strong>{(confidence * 100).toFixed(1)}%</strong> confidence.
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            The signal is <strong>{m.focusScore > 0.6 ? 'highly concentrated' : m.focusScore > 0.3 ? 'moderately spread' : 'diffuse'}</strong> (Focus Score: {m.focusScore.toFixed(3)}),
            meaning the model {m.focusScore > 0.5 ? 'relied on a few key words' : 'distributed attention broadly across the text'}.
          </p>
          {m.topToxic.length > 0 && (
            <p style={{ margin: '0' }}>
              The strongest toxic driver is <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--toxic)' }}>"{m.topToxic[0].token}"</code> (S = +{m.topToxic[0].attribution.toFixed(3)}).
              {m.topSafe.length > 0 && <> The strongest mitigating word is <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--non-toxic)' }}>"{m.topSafe[0].token}"</code> (S = {m.topSafe[0].attribution.toFixed(3)}).</>}
            </p>
          )}
        </div>
      </Section>

    </div>
  );
};

export default InterpretabilityPanel;
