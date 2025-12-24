// Shared theme constants for Strategy Assembly widget

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
  // Background colors
  bg: {
    primary: '#0b0611',
    column: 'rgb(22, 18, 31)',
    cellActive: '#686b8214',
    cellDisabled: 'rgb(22, 18, 31)',
    header: 'rgba(104, 107, 130, 0.08)',
    headerHover: 'rgba(104, 107, 130, 0.1)',
    overlay: 'rgba(104, 107, 130, 0.05)',
  },

  // Border colors
  border: {
    neutral: '#e5e7eb',
    dimmed: 'rgba(229, 231, 235, 0.2)',
    disabled: 'transparent',
    transparent: 'transparent',
  },

  // Text colors
  text: {
    primary: 'rgba(255, 255, 255, 1)',
    secondary: 'rgba(255, 255, 255, 0.8)',
    tertiary: 'rgba(255, 255, 255, 0.6)',
    muted: 'rgba(255, 255, 255, 0.5)',
    dimmed: 'rgba(255, 255, 255, 0.3)',
    placeholder: 'rgba(104, 107, 130, 0.5)',
  },

  // Accent colors (purple theme)
  accent: {
    primary: '#855bfb',
    secondary: '#8a61ff',
    outline: '#7132f5',
    glow: 'rgba(133, 91, 251, 0.4)',
    glowStrong: 'rgba(133, 91, 251, 0.8)',
    bgSubtle: 'rgba(133, 91, 251, 0.2)',
    bgHover: 'rgba(133, 91, 251, 0.3)',
  },

  // Entry/Exit (Buy/Sell) tints
  entry: {
    tint: 'rgba(100, 200, 100, 0.08)',
    header: 'rgba(100, 200, 100, 0.15)',
    badge: 'rgba(100, 200, 100, 0.25)',
    badgeBorder: 'rgba(100, 200, 100, 0.5)',
    text: 'rgba(150, 255, 150, 0.9)',
  },
  exit: {
    tint: 'rgba(200, 100, 100, 0.08)',
    header: 'rgba(200, 100, 100, 0.15)',
  },

  // Conditional badge colors
  conditional: {
    badge: 'rgba(200, 150, 50, 0.25)',
    badgeBorder: 'rgba(200, 150, 50, 0.5)',
    text: 'rgba(255, 200, 100, 0.9)',
  },

  // White variants for effects
  white: {
    full: 'rgba(255, 255, 255, 1)',
    high: 'rgba(255, 255, 255, 0.8)',
    medium: 'rgba(255, 255, 255, 0.5)',
    low: 'rgba(255, 255, 255, 0.3)',
    subtle: 'rgba(255, 255, 255, 0.2)',
    faint: 'rgba(255, 255, 255, 0.1)',
  },
} as const;

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  xxs: '2px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  xxl: '24px',

  // Specific spacing values
  gap: {
    columns: '6px',
    cells: '4px',
  },
  padding: {
    cell: '8px',
    header: '8px',
    container: '16px',
  },
} as const;

// =============================================================================
// BORDERS
// =============================================================================

export const borders = {
  radius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
  width: {
    default: '1px',
    medium: '2px',
  },
} as const;

// =============================================================================
// LAYOUT CONSTANTS
// =============================================================================

export const layout = {
  // Grid cell layout
  cell: {
    minHeight: '220px',
    bottomPadding: 20, // pixels
    blockHeight: 40, // pixels
    headerHeight: 36, // pixels
  },

  // Provider column
  provider: {
    minWidth: '90px',
    width: '110px',
  },

  // Grid columns
  column: {
    minWidth: '180px',
  },

  // Container
  container: {
    maxWidth: '520px',
  },
} as const;

// =============================================================================
// ANIMATIONS
// =============================================================================

export const animations = {
  // Breathing animation for grid cells
  cellBreathing: `
    @keyframes breathing {
      0%, 100% {
        border-color: rgba(255, 255, 255, 0.5);
        box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.1);
      }
      50% {
        border-color: rgba(255, 255, 255, 1);
        box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.2);
      }
    }
  `,

  // Breathing animation for blocks
  blockBreathing: `
    @keyframes blockBreathing {
      0%, 100% {
        border-color: rgba(255, 255, 255, 0.5);
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
      }
      50% {
        border-color: rgba(255, 255, 255, 1);
        box-shadow: 0 0 15px rgba(255, 255, 255, 0.5);
      }
    }
  `,

  // Timing
  duration: {
    fast: '0.2s',
    normal: '0.3s',
    slow: '0.5s',
    breathing: '1.5s',
  },

  easing: {
    default: 'ease',
    easeOut: 'ease-out',
    easeIn: 'ease-in',
    easeInOut: 'ease-in-out',
  },
} as const;

// =============================================================================
// TRANSITIONS
// =============================================================================

export const transitions = {
  default: 'all 0.2s ease',
  border: 'border-color 0.2s ease',
  background: 'background-color 0.2s ease',
  boxShadow: 'box-shadow 0.2s ease',
  gridCell: `
    border-color 0.2s,
    box-shadow 0.2s,
    background-image 0.3s ease-out,
    background-color 0.2s
  `,
} as const;

// =============================================================================
// GRID PATTERNS (for hover effects)
// =============================================================================

export const gridPatterns = {
  active: `
    linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
  `,
  valid: `
    linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
  `,
  size: '20px 20px',
} as const;

// =============================================================================
// Z-INDEX LAYERS
// =============================================================================

export const zIndex = {
  base: 1,
  dropdown: 10,
  tooltip: 100,
  modal: 200,
  dragging: 1000,
} as const;

// =============================================================================
// EXPORT COMBINED THEME
// =============================================================================

export const theme = {
  colors,
  spacing,
  borders,
  layout,
  animations,
  transitions,
  gridPatterns,
  zIndex,
} as const;

export type Theme = typeof theme;
