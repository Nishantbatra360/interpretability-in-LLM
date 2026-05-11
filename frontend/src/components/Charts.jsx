import React, { useMemo } from 'react';

const IDENTITY_LABELS = {
  male: 'Male',
  female: 'Female',
  christian: 'Christian',
  jewish: 'Jewish',
  muslim: 'Muslim',
  threat_group: 'Threat / Violence'
};

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
  const { bucketsToxic, bucketsNonToxic } = useMemo(() => {
    const bt = Array(10).fill(0);
    const bn = Array(10).fill(0);
    comments.forEach(c => {
      if (c.confidence != null) {
        const idx = Math.min(Math.floor(c.confidence * 10), 9);
        if (c.predicted_classification === 'Toxic') {
          bt[idx]++;
        } else {
          bn[idx]++;
        }
      }
    });
    return { bucketsToxic: bt, bucketsNonToxic: bn };
  }, [comments]);

  const maxCount = Math.max(
    ...bucketsToxic.map((v, i) => v + bucketsNonToxic[i]),
    1
  );
  const MAX_BAR_H = 80;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--on-surface-variant)' }}>
          Confidence Score Distribution
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '10px', fontWeight: 'bold' }}>
          <span style={{ color: 'var(--toxic)' }}>■ Toxic</span>
          <span style={{ color: 'var(--non-toxic)' }}>■ Non-Toxic</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: `${MAX_BAR_H + 24}px` }}>
        {Array.from({ length: 10 }).map((_, i) => {
          const ct = bucketsToxic[i];
          const cn = bucketsNonToxic[i];
          const total = ct + cn;
          const barH = (total / maxCount) * MAX_BAR_H;
          const toxicPct = total > 0 ? (ct / total) * 100 : 0;
          const nonToxicPct = total > 0 ? (cn / total) * 100 : 0;
          
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ fontSize: '10px', color: 'var(--on-surface-variant)', marginBottom: '2px', height: '14px', lineHeight: '14px' }}>
                {total > 0 ? total : ''}
              </div>
              
              <div style={{
                width: '100%', height: `${barH}px`,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                transition: 'height 0.4s ease',
                minHeight: total > 0 ? '2px' : '0',
                borderRadius: '3px 3px 0 0',
                overflow: 'hidden'
              }}>
                <div style={{ width: '100%', height: `${nonToxicPct}%`, backgroundColor: 'var(--non-toxic)', opacity: 0.8 }} title={`Non-Toxic: ${cn}`} />
                <div style={{ width: '100%', height: `${toxicPct}%`, backgroundColor: 'var(--toxic)', opacity: 0.8 }} title={`Toxic: ${ct}`} />
              </div>

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

  const allVals = identities.flatMap(id => [id.spd, id.eopp]);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  
  // Determine bounds
  const hasNegative = minVal < 0;
  const hasPositive = maxVal > 0;
  
  const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
  const MAX_VAL = Math.max(0.5, Math.ceil(absMax * 10) / 10);
  
  // Calculate layout parameters
  let centerPct = 50;
  let multiplier = 50;
  
  if (!hasNegative && hasPositive) {
    centerPct = 0;
    multiplier = 100;
  } else if (!hasPositive && hasNegative) {
    centerPct = 100;
    multiplier = 100;
  }
  
  const severityColor = (val) => {
    const absVal = Math.abs(val);
    if (absVal > 0.1) return 'var(--toxic)';
    if (absVal > 0.05) return 'var(--tertiary, #e6a817)';
    return 'var(--non-toxic)';
  };

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', gap: '20px', fontSize: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', backgroundColor: 'var(--surface-container-high)', borderRadius: '20px', border: '1px solid var(--outline-variant)' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'var(--primary)' }} />
          <span style={{ fontWeight: 700 }}>Flagging Rate Gap</span> <span style={{ color: 'var(--on-surface-variant)' }}>(How much more often the group is flagged)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', backgroundColor: 'var(--surface-container-high)', borderRadius: '20px', border: '1px solid var(--outline-variant)' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'var(--secondary)' }} />
          <span style={{ fontWeight: 700 }}>Recall Gap</span> <span style={{ color: 'var(--on-surface-variant)' }}>(How much better the model catches true toxicity)</span>
        </div>
      </div>

      {/* Chart container */}
      <div style={{ position: 'relative', marginTop: '30px', paddingBottom: '20px' }}>
        {/* Fair zone band (±0.05) */}
        {(() => {
          const fairBandPct = (0.05 / MAX_VAL) * multiplier;
          return (
            <div style={{
              position: 'absolute',
              left: `calc(140px + (100% - 140px) * ${(centerPct - fairBandPct) / 100})`,
              width: `calc((100% - 140px) * ${(fairBandPct * 2) / 100})`,
              top: '36px', bottom: '20px',
              background: 'linear-gradient(180deg, rgba(0,108,75,0.06) 0%, rgba(0,108,75,0.03) 100%)',
              borderLeft: '1px dashed rgba(0,108,75,0.15)',
              borderRight: '1px dashed rgba(0,108,75,0.15)',
              zIndex: 0, pointerEvents: 'none'
            }} />
          );
        })()}
        {/* Center line (0 = Fair) */}
        <div style={{
          position: 'absolute',
          left: `calc(140px + (100% - 140px) * ${centerPct / 100})`,
          top: '36px', bottom: '20px',
          width: '0px',
          borderLeft: '2px dashed var(--non-toxic)',
          opacity: 0.7,
          zIndex: 2
        }} />
        
        {/* X-axis labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0 16px 140px', color: 'var(--on-surface-variant)', fontSize: '11px', fontWeight: 700, position: 'relative' }}>
          {centerPct === 50 && (
            <>
              <span style={{ flex: 1, textAlign: 'left' }}>-{MAX_VAL.toFixed(1)}</span>
              <span style={{ flex: 1, textAlign: 'center', color: 'var(--non-toxic)', fontWeight: 800 }}>0 (Fair)</span>
              <span style={{ flex: 1, textAlign: 'right' }}>+{MAX_VAL.toFixed(1)}</span>
            </>
          )}
          {centerPct === 0 && (
            <>
              <span style={{ textAlign: 'left', color: 'var(--non-toxic)', fontWeight: 800 }}>0 (Fair)</span>
              <span style={{ textAlign: 'right' }}>+{MAX_VAL.toFixed(1)}</span>
            </>
          )}
          {centerPct === 100 && (
            <>
              <span style={{ textAlign: 'left' }}>-{MAX_VAL.toFixed(1)}</span>
              <span style={{ textAlign: 'right', color: 'var(--non-toxic)', fontWeight: 800 }}>0 (Fair)</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', zIndex: 1 }}>
          {identities.map((row) => {
            const spdPct = Math.min((Math.abs(row.spd) / MAX_VAL) * multiplier, multiplier);
            const spdLeft = row.spd < 0 ? centerPct - spdPct : centerPct;
            
            const eoppPct = Math.min((Math.abs(row.eopp) / MAX_VAL) * multiplier, multiplier);
            const eoppLeft = row.eopp < 0 ? centerPct - eoppPct : centerPct;

            return (
              <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }} className="chart-row-hover">
                <div style={{ width: '124px', fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', textAlign: 'right', flexShrink: 0, color: 'var(--on-surface)' }}>
                  {IDENTITY_LABELS[row.name] || row.name.replace(/_/g, ' ')}
                </div>
                
                <div style={{ flex: 1, position: 'relative', height: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                  {/* Background track for rows */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '-8px', bottom: '-8px', backgroundColor: 'var(--surface-container)', borderRadius: '8px', zIndex: -1, opacity: 0.3, transition: 'opacity 0.2s ease' }} className="row-bg" />

                  {/* Flagging Rate Bar */}
                  <div style={{ position: 'relative', height: '14px', width: '100%' }}>
                    <div style={{
                      position: 'absolute',
                      left: `${spdLeft}%`,
                      width: `${spdPct}%`,
                      height: '100%',
                      backgroundColor: severityColor(row.spd),
                      borderRadius: '4px',
                      transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: `0 2px 8px ${severityColor(row.spd)}40`
                    }} />
                    {/* Tooltip / Label */}
                    <div style={{ 
                      position: 'absolute',
                      left: row.spd >= 0 ? `calc(${spdLeft + spdPct}% + 8px)` : `auto`,
                      right: row.spd < 0 ? `calc(${100 - spdLeft}% + 8px)` : `auto`,
                      top: '0',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: severityColor(row.spd),
                      fontFamily: 'var(--font-mono)',
                      lineHeight: '14px'
                    }}>
                      {row.spd >= 0 ? '+' : ''}{row.spd.toFixed(3)}
                    </div>
                  </div>

                  {/* Recall Bar */}
                  <div style={{ position: 'relative', height: '14px', width: '100%' }}>
                    <div style={{
                      position: 'absolute',
                      left: `${eoppLeft}%`,
                      width: `${eoppPct}%`,
                      height: '100%',
                      backgroundColor: severityColor(row.eopp),
                      borderRadius: '4px',
                      opacity: 0.85,
                      transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: `0 2px 8px ${severityColor(row.eopp)}40`
                    }} />
                    <div style={{ 
                      position: 'absolute',
                      left: row.eopp >= 0 ? `calc(${eoppLeft + eoppPct}% + 8px)` : `auto`,
                      right: row.eopp < 0 ? `calc(${100 - eoppLeft}% + 8px)` : `auto`,
                      top: '0',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: severityColor(row.eopp),
                      fontFamily: 'var(--font-mono)',
                      lineHeight: '14px'
                    }}>
                      {row.eopp >= 0 ? '+' : ''}{row.eopp.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Threshold Guide */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '24px', padding: '16px 20px', backgroundColor: 'var(--surface-container-lowest)', borderRadius: '12px', border: '1px solid var(--outline-variant)', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Severity Thresholds:</div>
        <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--non-toxic)', fontWeight: 700 }}><span style={{width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--non-toxic)', boxShadow: '0 0 8px var(--non-toxic)'}}/> Fair (|v| ≤ 0.05)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--tertiary, #e6a817)', fontWeight: 700 }}><span style={{width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--tertiary, #e6a817)', boxShadow: '0 0 8px var(--tertiary)'}}/> Monitor (0.05 - 0.10)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--toxic)', fontWeight: 700 }}><span style={{width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--toxic)', boxShadow: '0 0 8px var(--toxic)'}}/> Biased (|v| &gt; 0.10)</span>
        </div>
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
