import React from 'react';

// Maps -1.0 to 1.0 to a color.
// -1.0 is dark green, 0 is white/gray, 1.0 is dark red.
const getColorForAttribution = (score) => {
  if (score > 0) {
    // Toxic: Yellow-Orange-Red scale
    const intensity = Math.min(score * 255, 255);
    return `rgba(186, 26, 26, ${score * 0.5})`; // Using the error color variable #ba1a1a
  } else if (score < 0) {
    // Non-toxic: Green scale
    const intensity = Math.min(Math.abs(score) * 255, 255);
    return `rgba(0, 108, 75, ${Math.abs(score) * 0.5})`; // Using the success color variable #006c4b
  }
  return 'transparent';
};

const InterpretabilityHeatmap = ({ tokens }) => {
  if (!tokens || tokens.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Token Attribution Heatmap</h2>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', marginTop: '4px' }}>
          Visualizing internal model routing and focus. Hover over tokens to see exact attribution weights.
        </p>
      </div>
      <div className="heatmap-container">
        {tokens.map((tokenObj, idx) => (
          <span
            key={idx}
            className="token"
            style={{ backgroundColor: getColorForAttribution(tokenObj.attribution) }}
            data-tooltip={`Weight: ${tokenObj.attribution.toFixed(3)}`}
          >
            {tokenObj.token}
          </span>
        ))}
      </div>
    </div>
  );
};

export default InterpretabilityHeatmap;
