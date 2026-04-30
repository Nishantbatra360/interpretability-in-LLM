---
name: Analytical Precision
colors:
  surface: '#faf8ff'
  surface-dim: '#d9d9e5'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3fe'
  surface-container: '#ededf9'
  surface-container-high: '#e7e7f3'
  surface-container-highest: '#e1e2ed'
  on-surface: '#191b23'
  on-surface-variant: '#434655'
  inverse-surface: '#2e3039'
  inverse-on-surface: '#f0f0fb'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#943700'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#faf8ff'
  on-background: '#191b23'
  surface-variant: '#e1e2ed'
typography:
  h1:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  data-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-snippet:
    fontFamily: monospace
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  space-xs: 4px
  space-sm: 8px
  space-md: 16px
  space-lg: 24px
  container-margin: 32px
  gutter: 16px
---

## Brand & Style

The design system is engineered for high-stakes AI auditing and model interpretability. The brand personality is objective, clinical, and precise, designed to evoke a sense of trust and absolute clarity for data scientists and policy researchers. 

The aesthetic follows a **Corporate Modern** style with **Minimalist** leanings. It prioritizes information density over decorative elements, using subtle structural lines and a rigorous grid to organize complex datasets. The UI disappears to let the data lead, ensuring that users can identify biases or toxic patterns without visual distraction.

## Colors

The palette is anchored in a neutral range of slate grays and crisp whites to provide a high-contrast canvas for data visualization. 

- **Primary Action:** A vibrant, accessible blue is reserved for primary interactions, selected states, and navigational highlights.
- **Semantic Classification:** To instantly communicate safety levels, 'Toxic' content uses a deep, burnt orange/red, while 'Non-Toxic' content uses a stable emerald green.
- **Heatmap Scale:** For token attribution, the design system utilizes a sequential Yellow-Orange-Red scale. This allows users to visually trace the "intensity" of a model's focus on specific words or features contributing to a toxicity score.
- **Surface Strategy:** Backgrounds utilize a subtle off-white to reduce eye strain during long auditing sessions, with pure white reserved for elevated data cards.

## Typography

This design system utilizes **Inter** as the primary typeface for its exceptional legibility at small sizes and its neutral, systematic character. 

- **Data Tables:** Tabular figures are used to ensure numbers align vertically, aiding in the rapid comparison of weights and metrics.
- **Information Density:** Body sizes are intentionally compact (13px-14px) to maximize the "above-the-fold" data visibility.
- **Monospaced Utility:** A standard monospaced stack is used for tokenized text, JSON outputs, and raw model logs to differentiate machine-readable data from the UI chrome.
- **Hierarchy:** Bold weights are used sparingly for section headers and critical labels to maintain a clean, uncluttered visual field.

## Layout & Spacing

The design system employs a **Fluid Grid** model with a 12-column structure, allowing the dashboard to scale from laptop screens to large monitoring displays. 

- **Spacing Rhythm:** An 8px base grid governs all layout decisions, with a 4px "half-step" used for tight internal component spacing (e.g., icons within buttons).
- **Density:** Padding within data tables and cards is kept tight (12px-16px) to accommodate multiple panels—such as a token heatmap, a fairness chart, and a configuration sidebar—within a single viewport.
- **Zonal Layout:** The interface is divided into functional zones: a persistent navigation rail, a flexible utility sidebar for filters, and a primary central canvas for data visualization.

## Elevation & Depth

To maintain a professional and data-centric feel, the design system avoids heavy shadows and decorative depth. Visual hierarchy is achieved through **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Background):** The base canvas uses the neutral background color (#F8FAFC).
- **Level 1 (Cards/Panels):** Pure white surfaces with a 1px border (#E2E8F0). No shadow is used here to maintain a flat, structured look.
- **Level 2 (Modals/Popovers):** Elements that temporarily float above the UI utilize a soft, ambient shadow (0px 4px 12px rgba(0,0,0,0.05)) to provide focus without breaking the minimalist aesthetic.
- **State Changes:** Hover states on interactive rows or cards are indicated by a subtle background tint (#F1F5F9) rather than an elevation increase.

## Shapes

The design system uses a **Soft** shape language to balance professional rigor with modern UI sensibilities.

- **Standard Radius:** Components like buttons, input fields, and data cards utilize a 0.25rem (4px) radius. This provides a clean, disciplined look that feels more technical than rounded consumer apps.
- **Data Points:** Markers in fairness charts and scatter plots use sharp circles or 2px rounded squares to denote precision.
- **Heatmap Tokens:** Individual word/token highlights in the interpretability view use a 2px radius to create a cohesive "block" look when text wraps, ensuring the highlight feels connected to the character string.

## Components

- **Data Cards:** Uniform containers for high-level metrics. They feature a "label-caps" header, a prominent primary value, and a sparkline or delta indicator for trend analysis.
- **Interactive Tables:** The heart of the dashboard. Rows include hover actions for "Drill Down" and "Explain." Columns are sortable, with integrated mini-bar charts to show distribution directly in the cells.
- **Heatmap Text Display:** A specialized component where text is broken into tokens, each wrapped in a background color corresponding to the attribution scale. On hover, a tooltip reveals the exact numerical weight.
- **Toggle Switches:** Used for switching between explanation methods (e.g., LIME vs. SHAP). These are compact, utilizing the vibrant blue for the 'on' state.
- **Fairness Charts:** Custom visualization components including Parity Plots and Disparate Impact histograms. These use a refined stroke weight and the secondary slate color for grid lines to keep the focus on the data trend.
- **Input Fields:** Minimalist design with a 1px border. The focus state is indicated by a 2px primary blue outer ring to ensure high visibility for keyboard navigation.