import { View, Text, Pressable } from 'react-native';

export default function EmptyState({ title, subtitle, actionLabel, onAction, compact }) {
  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: compact ? 36 : 56,
    }}>
      {/* Linea sottile decorativa al posto dell'emoji */}
      <View style={{
        width: 32, height: 1,
        backgroundColor: 'rgba(168,85,247,0.3)',
        marginBottom: 18,
      }} />
      {title && (
        <Text style={{
          color: '#fff',
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
          color: '#64748B',
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
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
