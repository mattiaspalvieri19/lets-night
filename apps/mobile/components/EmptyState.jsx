import { View, Text, Pressable } from 'react-native';

export default function EmptyState({ icon = '🌙', title, subtitle, actionLabel, onAction, compact }) {
  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingVertical: compact ? 32 : 64,
    }}>
      <Text style={{ fontSize: compact ? 36 : 48, marginBottom: 14 }}>{icon}</Text>
      {title && (
        <Text style={{
          color: '#fff',
          fontSize: compact ? 16 : 18,
          fontWeight: '800',
          textAlign: 'center',
          marginBottom: 6,
        }}>
          {title}
        </Text>
      )}
      {subtitle && (
        <Text style={{
          color: '#64748B',
          fontSize: 13,
          textAlign: 'center',
          lineHeight: 19,
          marginBottom: actionLabel ? 22 : 0,
        }}>
          {subtitle}
        </Text>
      )}
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => ({
            backgroundColor: '#7C3AED',
            borderRadius: 12,
            paddingHorizontal: 28,
            paddingVertical: 12,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
