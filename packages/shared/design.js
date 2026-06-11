// Design tokens condivisi tra web e mobile — direzione "Editoriale notturna".
// Regole d'uso (non solo valori):
// - Il viola è SOLO accento: CTA, stati attivi, link. Mai bordi decorativi o sfondi di sezione.
// - Gerarchia data da tipografia (display) e spazio, non da bordi/gradienti.
// - Niente emoji come icone: Ionicons (mobile) / SVG (web).
// - Foto protagoniste dove esistono (events.cover_image, venues.cover_image);
//   fallback tipografico, mai gradienti di categoria a tutta card.

export const COLORS = {
  // Backgrounds — neri neutri (niente dominante blu)
  bg:           '#0A0A0C',
  bgElev1:      '#101013',
  bgElev2:      '#131316',
  bgElev3:      '#1A1A1F',

  // Text — scala zinc neutra
  textPrimary:   '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted:     '#71717A',
  textDisabled:  '#52525B',

  // Brand — un solo accento, uso parco
  brand:         '#A855F7',
  brandStrong:   '#7C3AED',
  brandSubtle:   'rgba(168,85,247,0.12)',
  brandBorder:   'rgba(168,85,247,0.3)',

  // Borders
  borderSubtle: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',

  // Overlay fotografico (scrim per leggibilità testo su immagine)
  scrim:        'rgba(0,0,0,0.55)',

  // Status
  success:      '#4ADE80',
  warning:      '#F59E0B',
  danger:       '#F87171',
};

// Famiglie font. Mobile: caricate in app/_layout via expo-font.
// Web: caricare con next/font e mappare sulle stesse CSS variables.
export const FONT_FAMILY = {
  display:      'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  displayMedium:'BricolageGrotesque_600SemiBold',
  // body = font di sistema (niente fontFamily): più leggibile e zero peso
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
