import { Text } from 'react-native';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

// Scala tipografica dell'app — direzione editoriale.
// Display* usa Bricolage Grotesque (caricato in app/_layout); il body resta font di sistema.

export function Display({ style, ...props }) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 }, style]}
    />
  );
}

export function Heading({ style, ...props }) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 }, style]}
    />
  );
}

export function CardTitle({ style, ...props }) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 }, style]}
    />
  );
}

export function Body({ style, ...props }) {
  return <Text {...props} style={[{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 }, style]} />;
}

// Meta: data/luogo/prezzo in piccolo. UNICO posto dove è ammesso il maiuscolo spaziato.
export function Meta({ style, ...props }) {
  return (
    <Text
      {...props}
      style={[{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }, style]}
    />
  );
}
