// Design tokens condivisi tra web e mobile.
// Su web usare anche le CSS variables definite in globals.css.
// Su mobile importare e usare i valori inline negli StyleSheet.

export const COLORS = {
  // Backgrounds
  bg:           '#09090f',
  bgElev1:      '#0f0f17',
  bgElev2:      '#111118',
  bgElev3:      '#18181f',

  // Text
  textPrimary:   '#ffffff',
  textSecondary: '#94A3B8',
  textMuted:     '#64748B',
  textDisabled:  '#475569',

  // Brand
  brand:         '#A855F7',
  brandStrong:   '#7C3AED',
  brandSubtle:   'rgba(168,85,247,0.12)',
  brandBorder:   'rgba(168,85,247,0.3)',

  // Borders
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',

  // Status
  success:      '#4ADE80',
  warning:      '#F59E0B',
  danger:       '#F87171',
};

export const RADIUS = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 14,
  '3xl': 18,
  full: 999,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
};

export const FONT = {
  // sizes
  xs: 10,
  sm: 11,
  md: 13,
  base: 14,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 38,
  // weight
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};
