// Central design tokens. This is the single source of truth for the app's
// visual language — the CSS custom properties in src/index.css are the
// Tailwind-facing mirror of these same values (Tailwind v4 reads its theme
// from CSS, so the values must live there for utility classes to work), but
// any TypeScript code that needs a raw color/value — chart fills, inline SVG
// strokes, the attendance calendar's day-cell colors — should import from
// here rather than hardcoding a hex value a second time.
//
// If you rebrand the palette, change both this file and the matching
// `--color-*` block in index.css.

export const color = {
  crate: {
    50: '#F3F8FC',
    100: '#E6F0F8',
    500: '#175E9E',
    600: '#124B80',
    700: '#0E3B65',
  },
  fresh: {
    50: '#EEFBF3',
    100: '#D9F5E3',
    500: '#2F9E68',
    600: '#257F53',
  },
  cream: {
    50: '#FBFDFF',
    100: '#F1F6F5',
  },
  amber: {
    100: '#FBF0DA',
    400: '#E2A63B',
  },
  red: {
    100: '#FEE2E2',
    500: '#EF4444',
  },
  ink: {
    900: '#0B1F1A',
    600: '#445753',
  },
} as const

export const font = {
  display: '"Sora", ui-sans-serif, system-ui, sans-serif',
  body: '"Inter", ui-sans-serif, system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const

// Attendance calendar semantics — the one place "green = present, red =
// absent" is defined, so every screen that renders attendance agrees.
export const attendanceColor = {
  delivered: { bg: color.fresh[100], fg: color.fresh[600], dot: color.fresh[500] },
  modified: { bg: color.fresh[100], fg: color.fresh[600], dot: color.amber[400] },
  skipped: { bg: color.red[100], fg: color.red[500], dot: color.red[500] },
  upcoming: { bg: color.crate[50], fg: color.ink[600], dot: 'transparent' },
  inactive: { bg: '#F4F4F5', fg: '#A1A1AA', dot: 'transparent' },
} as const

export const radius = {
  sm: '0.75rem',
  md: '1rem',
  lg: '1.5rem',
  full: '9999px',
} as const
