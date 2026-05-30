import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { getLoyaltyLevel } from '@lets-night/shared';

export default function LoyaltyBlock({ points = 0, compact }) {
  const router = useRouter();
  const { level, next, progress, pointsToNext } = getLoyaltyLevel(points);

  return (
    <Pressable
      onPress={() => router.push('/loyalty')}
      style={({ pressed }) => ({
        marginHorizontal: 20,
        marginBottom: compact ? 14 : 20,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.4)',
        backgroundColor: '#18181f',
        opacity: pressed ? 0.9 : 1,
      })}
    >
      {/* Top: gradient effect via overlay */}
      <View style={{
        padding: 16,
        backgroundColor: 'rgba(124,58,237,0.18)',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#A855F7', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700' }}>
              La tua carta fedeltà
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6, gap: 6 }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{points}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13, fontWeight: '600' }}>punti</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Text style={{ fontSize: 14 }}>{level.icon}</Text>
              <Text style={{ color: level.color, fontWeight: '700', fontSize: 13 }}>{level.name}</Text>
            </View>
          </View>
          <View style={{
            backgroundColor: '#7C3AED',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
          }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Vedi →</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={{ marginTop: 14 }}>
          <View style={{
            height: 6,
            backgroundColor: 'rgba(168,85,247,0.18)',
            borderRadius: 3,
            overflow: 'hidden',
          }}>
            <View style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              backgroundColor: '#A855F7',
            }} />
          </View>
          <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 6 }}>
            {next
              ? `${pointsToNext} punti al livello ${next.name} ${next.icon}`
              : 'Hai raggiunto il livello massimo 🎉'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
