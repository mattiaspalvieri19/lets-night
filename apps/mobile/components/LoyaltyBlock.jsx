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
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#111118',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View style={{ padding: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{
              color: '#64748B',
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: '600',
            }}>
              Carta fedeltà
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10, gap: 6 }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>{points}</Text>
              <Text style={{ color: '#64748B', fontSize: 12 }}>punti</Text>
            </View>
            <Text style={{ color: level.color, fontWeight: '600', fontSize: 13, marginTop: 4, letterSpacing: 0.2 }}>
              {level.name}
            </Text>
          </View>
          <View style={{
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
          }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 11 }}>Apri</Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <View style={{
            height: 3,
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <View style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              backgroundColor: '#A855F7',
            }} />
          </View>
          <Text style={{ color: '#64748B', fontSize: 11, marginTop: 8 }}>
            {next
              ? `${pointsToNext} punti al livello ${next.name}`
              : 'Livello massimo raggiunto'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
