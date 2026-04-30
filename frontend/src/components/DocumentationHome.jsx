import React from 'react';
import { BookOpen, Terminal, CheckCircle, Code, Zap } from 'lucide-react';

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

const InfoBox = ({ children }) => (
  <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-container-low)', borderRadius: '6px', fontSize: '13px', color: 'var(--on-surface-variant)', borderLeft: '3px solid var(--secondary)', marginTop: '12px' }}>
    {children}
  </div>
);

const DocumentationHome = () => {
  return (
    <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
      <div className="card" style={{ maxWidth: '920px', margin: '0 auto', width: '100%' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--outline-variant)', paddingBottom: '16px', marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '24px' }}>
            <BookOpen size={28} color="var(--primary)" />
            Implementation Reference
          </h2>
          <p style={{ color: 'var(--on-surface-variant)', marginTop: '8px', fontSize: '15px', lineHeight: 1.6 }}>
            This application is built to the specifications of the <em>Evaluating Explanation Consistency in Zero-Shot LLM Toxicity Classification</em> Reference Plan.
            Below is the exact documentation of how each phase is implemented under the hood.
          </p>
        </div>

        {/* Phase 1 */}
        <section style={{ marginBottom: '40px' }}>
          <h3 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} />
            Phase 1: Zero-Shot Classification (Bulk Evaluation)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', marginBottom: '16px', fontStyle: 'italic' }}>
            Focus: Scale, Statistical Performance, and Fairness
          </p>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
            <strong>What it is:</strong> The bulk evaluation feed sends a large batch of comments from the Civil Comments dataset into the LLM without any prior training examples ("zero-shot"). Each comment is classified as <strong>"Toxic"</strong> or <strong>"Non-Toxic"</strong>.
          </p>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
            <strong>How it works (Per the Reference Plan):</strong> Instead of reading the LLM's text output, the backend reads the raw <code>logprobs</code> (log-probabilities) of the very first token the model generates. The scoring rule is:
            <code style={{ display: 'block', margin: '8px 0', padding: '8px', backgroundColor: 'var(--surface-container)', borderRadius: '4px' }}>
              s(x) = log P(Toxic | x) − log P(Non-Toxic | x)
            </code>
            If <code>s(x) &gt; 0</code>, the comment is classified <strong>Toxic</strong>; otherwise <strong>Non-Toxic</strong>. Confidence is derived via softmax over both log-probabilities.
          </p>
          <CodeBlock
            title="Zero-Shot API Prompt (sent to NVIDIA NIM)"
            code={`Classify the following text as toxic or not. Reply with exactly one word — either 'Toxic' or 'Non-Toxic'. No punctuation, no explanation, no other words.

Text: "{comment_text}"

Classification:`}
          />
          <InfoBox>
            <strong>Implementation Detail:</strong> The backend sets <code>max_tokens=10</code>, <code>logprobs=True</code>, and <code>top_logprobs=5</code>. The math reads only the first token's logprobs to compute the score. The raw text response (e.g., <code>"Toxic"</code>) is also captured for the debug viewer. A <strong>Semaphore(1)</strong> + 1-second cooldown enforces sequential processing to respect the NVIDIA NIM free-tier rate limits.
          </InfoBox>
          <InfoBox>
            <strong>Subword Tokenization Note:</strong> Llama's tokenizer splits "Toxic" into subword tokens <code>["To", "xic"]</code>. The logprob parser maps any token starting with <code>"to"</code>, <code>"t"</code>, or <code>"tox"</code> to the Toxic class, and any starting with <code>"non"</code> or <code>"n"</code> to Non-Toxic. This ensures accurate scoring regardless of tokenization.
          </InfoBox>
        </section>

        {/* Phase 2 */}
        <section style={{ marginBottom: '40px' }}>
          <h3 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} />
            Phase 2: Interpretability Deep-Dive (Single Comment)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', marginBottom: '16px', fontStyle: 'italic' }}>
            Focus: Token-Level Causality and "Why"
          </p>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
            <strong>What it is:</strong> A microscopic, granular analysis of how the LLM arrived at its verdict for a single comment. It produces visual heatmaps showing which specific words pulled the prediction toward "Toxic" (positive attribution) or "Non-Toxic" (negative attribution).
          </p>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
            <strong>How it works:</strong> True <em>Integrated Gradients</em> require white-box access to internal model weights. Because this dashboard uses a closed-weights API (Llama 3.1 70B via NVIDIA NIM), a <strong>Generative Token Attribution Proxy</strong> is used. The model is instructed to evaluate each word individually and assign an attribution score. The backend also runs the Phase 1 logprob call concurrently to produce the mathematically rigorous verdict — the proxy's <code>"classification"</code> field is overridden with the true logprob result.
          </p>
          <CodeBlock
            title="Attribution Proxy Prompt (Concurrent with Logprob call)"
            code={`You are an AI auditor trained to classify comments as "Toxic" or "Non-Toxic" and provide an interpretable explanation.

[... dynamic few-shot examples pulled from the database are injected here ...]

Analyze the following text based on the examples above.
Output MUST be a valid JSON object with EXACTLY three fields:
1. "classification": either "Toxic" or "Non-Toxic"
2. "confidence": a float between 0.0 and 1.0
3. "tokens": an array of objects. Break the text into tokens (words). For each
   token, assign an "attribution" score between -1.0 (highly toxic/offensive)
   and 1.0 (highly safe/positive). A score of 0.0 means neutral.

Text to analyze: "{comment_text}"

JSON Output:`}
          />
          <InfoBox>
            <strong>Implementation Detail:</strong> The backend fires <strong>both</strong> prompts concurrently via <code>asyncio.gather()</code>. The Zero-Shot logprob call (<code>max_tokens=10</code>) provides the final verdict &amp; confidence. The Generative Proxy call (<code>max_tokens=1024</code>, <code>response_format=json_object</code>) provides the per-token attribution scores for heatmap rendering. The proxy attribution scores are <strong>inverted</strong> in the backend parser (<code>map_tokens_to_objects</code>) so that the UI's positive values always mean "pulls toward Toxic".
          </InfoBox>
        </section>

        {/* Phase 3 */}
        <section style={{ marginBottom: '40px' }}>
          <h3 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} />
            Phase 3: Subgroup Fairness Metrics
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', marginBottom: '16px', fontStyle: 'italic' }}>
            Focus: Bias Detection Across Demographic Identity Groups
          </p>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '16px' }}>
            The dashboard aggregates Zero-Shot logprob predictions against the Civil Comments demographic columns to calculate disparate impact across identity groups (A=1 vs A=0).
          </p>
          <ul style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--on-surface)', margin: 0, paddingLeft: '24px' }}>
            <li style={{ marginBottom: '8px' }}>
              <strong>Statistical Parity Difference (SPD):</strong>{' '}
              <code>P(Ŷ=1 | A=1) − P(Ŷ=1 | A=0)</code>. Measures the difference in the rate at which comments mentioning a specific identity group are flagged as Toxic compared to comments not mentioning that group. An ideal unbiased model has SPD = 0.
            </li>
            <li>
              <strong>Equal Opportunity Difference (EOpp):</strong>{' '}
              <code>TPR(A=1) − TPR(A=0)</code>. Measures whether the model is equally good at correctly identifying actual toxic comments regardless of which demographic identity is mentioned. An ideal model has EOpp = 0.
            </li>
          </ul>
        </section>

        {/* Debug / Transparency */}
        <section>
          <h3 style={{ fontSize: '18px', color: 'var(--primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} />
            Transparency: API Debug Viewer
          </h3>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--on-surface)', marginBottom: '12px' }}>
            Both the Bulk Evaluation table and the Deep Dive panel expose a <strong>"Logprobs"</strong> / <strong>"View Raw API Data"</strong> button that opens a diagnostic modal showing:
          </p>
          <ul style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--on-surface)', margin: 0, paddingLeft: '24px' }}>
            <li>The exact prompt string sent to NVIDIA NIM</li>
            <li>The raw text response the LLM generated (e.g., <code>"Toxic"</code>)</li>
            <li>The full <code>top_logprobs</code> array used for the mathematical scoring rule</li>
            <li>For Deep Dive: the concurrent Attribution Proxy prompt and its raw JSON response</li>
          </ul>
        </section>

      </div>
    </div>
  );
};

export default DocumentationHome;
