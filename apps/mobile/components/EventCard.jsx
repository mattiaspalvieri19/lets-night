import { Pressable, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS_BY_CAT, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';

export default function EventCard({ event, onPress }) {
  const colors = COLORS_BY_CAT[event.category] || ['#1a0533', '#0d0d1a', '#c084fc'];
  const accent = colors[2] || '#c084fc';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        backgroundColor: '#111118',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <LinearGradient
        colors={[colors[0], colors[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 96, padding: 10, justifyContent: 'space-between' }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{
            backgroundColor: 'rgba(0,0,0,0.35)',
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
          }}>
            <Text style={{
              color: '#fff', fontSize: 9, fontWeight: '700',
              letterSpacing: 1, textTransform: 'uppercase',
            }}>
              {event.category}
            </Text>
          </View>
          {event.is_sponsored && (
            <View style={{
              backgroundColor: 'rgba(0,0,0,0.45)',
              paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4,
              borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
            }}>
              <Text style={{ color: '#fbbf24', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                SPONSOR
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={{ padding: 12, paddingBottom: 8 }}>
        <Text numberOfLines={1} style={{ color: '#64748B', fontSize: 11, marginBottom: 3 }}>
          {event.venues?.name || 'Locale'}
        </Text>
        <Text numberOfLines={2} style={{
          color: '#fff', fontSize: 14, fontWeight: '600',
          lineHeight: 18, marginBottom: 6, minHeight: 36,
          letterSpacing: -0.2,
        }}>
          {event.title}
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '500', marginBottom: 2 }}>
          {formatDate(event.event_date)} · {formatTime(event.event_time)}
        </Text>
        <Text numberOfLines={1} style={{ color: '#64748B', fontSize: 11 }}>
          {event.venues?.zona}, {event.venues?.city}
        </Text>
      </View>

      <View style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
      }}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
          {getPriceLabel(event.price)}
        </Text>
        <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '600' }}>Prenota</Text>
      </View>
    </Pressable>
  );
}
