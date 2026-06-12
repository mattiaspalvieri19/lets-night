import { View, Text, Pressable } from 'react-native';
import { COLORS } from '@lets-night/shared';

export default function EmptyState({ title, subtitle, actionLabel, onAction, compact }) {
  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: compact ? 36 : 56,
    }}>
      {/* Linea sottile decorativa */}
      <View style={{
        width: 32, height: 1,
        backgroundColor: COLORS.borderStrong,
        marginBottom: 18,
      }} />
      {title && (
        <Text style={{
          color: COLORS.textPrimary,
          fontSize: 15,
          fontWeight: '600',
          textAlign: 'center',
          marginBottom: 6,
          letterSpacing: -0.2,
        }}>
          {title}
        </Text>
      )}
      {subtitle && (
        <Text style={{
          color: COLORS.textMuted,
          fontSize: 13,
          textAlign: 'center',
          lineHeight: 19,
          marginBottom: actionLabel ? 22 : 0,
          maxWidth: 320,
        }}>
          {subtitle}
        </Text>
      )}
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => ({
            paddingHorizontal: 22,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: COLORS.borderStrong,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
