import React, { useMemo } from 'react';

/**
 * AttributionBarChart — horizontal bar chart of token attributions.
 * Positive bars (red) = pulls toward Toxic.
 * Negative bars (green) = pulls toward Non-Toxic.
 */
const AttributionBarChart = ({ tokens }) => {
  if (!tokens || tokens.length === 0) return null;

  const sorted = useMemo(() =>
    [...tokens].sort((a, b) => b.attribution - a.attribution),
    [tokens]
  );

  const maxAbs = Math.max(...tokens.map(t => Math.abs(t.attribution)), 0.001);
  const BAR_MAX_PX = 160;

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--on-surface-variant)', marginBottom: '12px' }}>
        Token Attribution Scores
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sorted.map((t, i) => {
          const pct = t.attribution / maxAbs;
          const isPositive = t.attribution >= 0;
          const barWidth = Math.abs(pct) * BAR_MAX_PX;
          const color = isPositive ? 'var(--toxic)' : 'var(--non-toxic)';
          const bgColor = isPositive ? '#ba1a1a20' : '#006c4b20';

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              {/* Token label */}
              <div style={{
                width: '90px', textAlign: 'right', color: 'var(--on-surface)',
                fontFamily: 'var(--font-mono)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0
              }}>
                {t.token}
              </div>

              {/* Centered bar container */}
              <div style={{ display: 'flex', alignItems: 'center', width: `${BAR_MAX_PX * 2 + 4}px`, flexShrink: 0 }}>
                {/* Negative side (left) */}
                <div style={{ width: `${BAR_MAX_PX}px`, display: 'flex', justifyContent: 'flex-end' }}>
                  {!isPositive && (
                    <div style={{
                      width: `${barWidth}px`, height: '16px', backgroundColor: color,
                      borderRadius: '3px 0 0 3px', transition: 'width 0.3s ease',
                    }} />
                  )}
                </div>

                {/* Center line */}
                <div style={{ width: '2px', height: '20px', backgroundColor: 'var(--outline-variant)', flexShrink: 0 }} />

                {/* Positive side (right) */}
                <div style={{ width: `${BAR_MAX_PX}px`, display: 'flex', justifyContent: 'flex-start' }}>
                  {isPositive && (
                    <div style={{
                      width: `${barWidth}px`, height: '16px', backgroundColor: color,
                      borderRadius: '0 3px 3px 0', transition: 'width 0.3s ease',
                    }} />
                  )}
                </div>
              </div>

              {/* Score */}
              <div style={{
                width: '44px', color, fontFamily: 'var(--font-mono)',
                fontWeight: '600', fontSize: '11px', flexShrink: 0
              }}>
                {t.attribution >= 0 ? '+' : ''}{t.attribution.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '24px', marginTop: '12px', fontSize: '11px' }}>
        <span style={{ color: 'var(--non-toxic)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '20px', height: '8px', backgroundColor: 'var(--non-toxic)', borderRadius: '2px' }} />
          ◀ Non-Toxic
        </span>
        <span style={{ color: 'var(--toxic)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Toxic ▶
          <span style={{ display: 'inline-block', width: '20px', height: '8px', backgroundColor: 'var(--toxic)', borderRadius: '2px' }} />
        </span>
      </div>
    </div>
  );
};

/**
 * PredictionDonut — shows Toxic vs Non-Toxic split as an SVG donut chart.
 */
const PredictionDonut = ({ comments, stats }) => {
  const counts = useMemo(() => {
    if (stats) {
      return { 
        toxic: stats.toxic, 
        nonToxic: stats.non_toxic, 
        total: stats.total 
      };
    }
    const toxic = comments.filter(c => c.predicted_classification === 'Toxic').length;
    const nonToxic = comments.filter(c => c.predicted_classification === 'Non-Toxic').length;
    return { toxic, nonToxic, total: comments.length };
  }, [comments, stats]);

  if (counts.total === 0) return null;

  const SIZE = 140;
  const R = 52;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const STROKE = 22;
  const CIRCUM = 2 * Math.PI * R;

  const toxicPct = counts.toxic / counts.total;
  const nonToxicPct = counts.nonToxic / counts.total;

  const toxicDash = toxicPct * CIRCUM;
  const nonToxicDash = nonToxicPct * CIRCUM;
  const toxicOffset = 0;
  const nonToxicOffset = -toxicDash;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--on-surface-variant)' }}>
        Prediction Distribution
      </div>

      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background ring */}
          <circle cx={CX} cy={CY} r={R} fill="none"
            stroke="var(--surface-container-high)" strokeWidth={STROKE} />
          {/* Non-Toxic arc */}
          <circle cx={CX} cy={CY} r={R} fill="none"
            stroke="var(--non-toxic)" strokeWidth={STROKE}
            strokeDasharray={`${nonToxicDash} ${CIRCUM - nonToxicDash}`}
            strokeDashoffset={nonToxicOffset}
            strokeLinecap="butt" />
          {/* Toxic arc */}
          <circle cx={CX} cy={CY} r={R} fill="none"
            stroke="var(--toxic)" strokeWidth={STROKE}
            strokeDasharray={`${toxicDash} ${CIRCUM - toxicDash}`}
            strokeDashoffset={toxicOffset}
            strokeLinecap="butt" />
        </svg>
        {/* Center label */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', textAlign: 'center'
        }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--on-surface)' }}>
            {counts.total}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--on-surface-variant)' }}>total</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--toxic)', display: 'inline-block' }} />
            Toxic
          </span>
          <strong style={{ color: 'var(--toxic)' }}>{counts.toxic} ({(toxicPct * 100).toFixed(1)}%)</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--non-toxic)', display: 'inline-block' }} />
            Non-Toxic
          </span>
          <strong style={{ color: 'var(--non-toxic)' }}>{counts.nonToxic} ({(nonToxicPct * 100).toFixed(1)}%)</strong>
        </div>
      </div>
    </div>
  );
};

/**
 * ConfidenceHistogram — distribution of confidence scores in 10% buckets.
 */
const ConfidenceHistogram = ({ comments, stats }) => {
  const buckets = useMemo(() => {
    if (stats?.confidence_bins) return stats.confidence_bins;
    
    const b = Array(10).fill(0);
    comments.forEach(c => {
      if (c.confidence != null) {
        const idx = Math.min(Math.floor(c.confidence * 10), 9);
        b[idx]++;
      }
    });
    return b;
  }, [comments, stats]);

  const maxCount = Math.max(...buckets, 1);
  const MAX_BAR_H = 80;

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--on-surface-variant)', marginBottom: '12px' }}>
        Confidence Score Distribution
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: `${MAX_BAR_H + 24}px` }}>
        {buckets.map((count, i) => {
          const barH = (count / maxCount) * MAX_BAR_H;
          const label = `${i * 10}–${i * 10 + 10}%`;
          const isHigh = i >= 8;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ fontSize: '10px', color: 'var(--on-surface-variant)', marginBottom: '2px', height: '14px', lineHeight: '14px' }}>
                {count > 0 ? count : ''}
              </div>
              <div style={{
                width: '100%', height: `${barH}px`,
                backgroundColor: isHigh ? 'var(--primary)' : 'var(--surface-container-high)',
                borderRadius: '3px 3px 0 0',
                border: '1px solid var(--outline-variant)',
                transition: 'height 0.4s ease',
                minHeight: count > 0 ? '2px' : '0'
              }} />
              <div style={{ fontSize: '9px', color: 'var(--on-surface-variant)', marginTop: '2px', textAlign: 'center' }}>
                {i * 10}%
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)', marginTop: '4px', textAlign: 'center' }}>
        Higher bars on the right = model is more decisive
      </div>
    </div>
  );
};

/**
 * SPDEOppChart — grouped bar chart of SPD and EOpp per identity group.
 */
const SPDEOppChart = ({ identities }) => {
  if (!identities || identities.length === 0) return null;

  const MAX_VAL = 0.3;
  const BAR_MAX_PX = 120;
  const scale = (v) => Math.min(Math.abs(v) / MAX_VAL, 1) * BAR_MAX_PX;

  const severityColor = (absVal) => {
    if (absVal > 0.1) return 'var(--toxic)';
    if (absVal > 0.05) return 'var(--tertiary, #e6a817)';
    return 'var(--non-toxic)';
  };

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--on-surface-variant)', marginBottom: '16px' }}>
        Disparity per Identity Group (SPD &amp; EOpp)
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', marginBottom: '12px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'var(--primary)', display: 'inline-block' }} />
          SPD (Statistical Parity Difference)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'var(--secondary, #6200ea)', display: 'inline-block', opacity: 0.8 }} />
          EOpp (Equal Opportunity Difference)
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {identities.map((row) => {
          const spdAbs = Math.abs(row.spd);
          const eoppAbs = Math.abs(row.eopp);

          return (
            <div key={row.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>{row.name}</span>
              </div>

              {/* SPD bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <div style={{ width: '42px', fontSize: '10px', color: 'var(--on-surface-variant)', textAlign: 'right', flexShrink: 0 }}>SPD</div>
                <div style={{ flex: 1, height: '14px', backgroundColor: 'var(--surface-container)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${(spdAbs / MAX_VAL) * 100}%`,
                    maxWidth: '100%',
                    backgroundColor: severityColor(spdAbs),
                    borderRadius: '3px',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
                <div style={{ width: '52px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: severityColor(spdAbs), flexShrink: 0 }}>
                  {row.spd >= 0 ? '+' : ''}{row.spd.toFixed(3)}
                </div>
              </div>

              {/* EOpp bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '42px', fontSize: '10px', color: 'var(--on-surface-variant)', textAlign: 'right', flexShrink: 0 }}>EOpp</div>
                <div style={{ flex: 1, height: '14px', backgroundColor: 'var(--surface-container)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${(eoppAbs / MAX_VAL) * 100}%`,
                    maxWidth: '100%',
                    backgroundColor: severityColor(eoppAbs),
                    borderRadius: '3px',
                    opacity: 0.75,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
                <div style={{ width: '52px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: severityColor(eoppAbs), flexShrink: 0 }}>
                  {row.eopp >= 0 ? '+' : ''}{row.eopp.toFixed(3)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Threshold guide */}
      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--on-surface-variant)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--non-toxic)' }}>● Low |v| ≤ 0.05</span>
        <span style={{ color: 'var(--tertiary, #e6a817)' }}>● Medium 0.05–0.10</span>
        <span style={{ color: 'var(--toxic)' }}>● High |v| &gt; 0.10</span>
      </div>
    </div>
  );
};

/**
 * TokenHeatmap — visualizes word-level attribution scores mapped onto original text.
 * Red = Toxic pull, Green = Safe pull.
 */
const TokenHeatmap = ({ tokens, fullText }) => {
  if (!fullText) return null;
  
  // Clean tokens for easier matching
  const tokenMap = (tokens || []).reduce((acc, t) => {
    acc[t.token.toLowerCase()] = t.attribution;
    return acc;
  }, {});

  // Split original text into words/tokens
  const words = fullText.split(/(\s+)/); // Keep whitespace
  
  return (
    <div style={{ 
      padding: '12px', 
      backgroundColor: 'var(--surface-container-lowest)', borderRadius: '6px',
      border: '1px solid var(--outline-variant)', marginTop: '8px',
      lineHeight: 1.8,
      whiteSpace: 'pre-wrap',
      textAlign: 'left'
    }}>
      {words.map((w, i) => {
        if (w.trim() === '') return <span key={i}>{w}</span>;

        // Clean the word for matching (remove punctuation)
        const cleanW = w.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
        
        // Find match in token map
        let attribution = 0;
        if (tokenMap[cleanW]) {
          attribution = tokenMap[cleanW];
        } else {
          // Try partial matches
          const matchKey = Object.keys(tokenMap).find(k => k.includes(cleanW) || cleanW.includes(k));
          if (matchKey) attribution = tokenMap[matchKey];
        }

        const abs = Math.abs(attribution);
        const opacity = Math.min(abs * 0.8 + 0.05, 0.9);
        const color = attribution > 0 
          ? `rgba(186, 26, 26, ${opacity})` // Toxic Red
          : attribution < 0 
            ? `rgba(0, 108, 75, ${opacity})`  // Non-Toxic Green
            : 'transparent';
        
        return (
          <span key={i} 
            className="token"
            data-tooltip={attribution !== 0 ? `Weight: ${attribution.toFixed(3)}` : undefined}
            style={{
              backgroundColor: color,
              color: attribution !== 0 && opacity > 0.5 ? 'white' : 'var(--on-surface)',
              fontWeight: attribution !== 0 ? '700' : '400',
              display: 'inline',
              whiteSpace: 'pre-wrap',
              borderBottom: attribution !== 0 ? `2px solid ${color}` : 'none'
            }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

export { AttributionBarChart, PredictionDonut, ConfidenceHistogram, SPDEOppChart, TokenHeatmap };
