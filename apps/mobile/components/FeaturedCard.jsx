import { Pressable, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS_BY_CAT, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';

export default function FeaturedCard({ event, onPress }) {
  const colors = COLORS_BY_CAT[event.category] || ['#1a0533', '#0d0d1a', '#c084fc'];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(168,85,247,0.35)',
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <LinearGradient
        colors={[colors[0], colors[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 200, padding: 16, justifyContent: 'space-between' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: 'rgba(124,58,237,0.35)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(168,85,247,0.5)' }}>
            <Text style={{ color: '#A855F7', fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' }}>
              ★ In Evidenza
            </Text>
          </View>
          <View style={{ backgroundColor: colors[2] + '33', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Text style={{ color: colors[2], fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>
              {event.category}
            </Text>
          </View>
        </View>

        <View>
          <Text
            numberOfLines={2}
            style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 27, marginBottom: 10 }}
          >
            {event.title}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 3 }}>
                {event.venues?.name}{event.venues?.zona ? ` · ${event.venues.zona}` : ''}
              </Text>
              <Text style={{ color: '#A855F7', fontSize: 12, fontWeight: '600' }}>
                {formatDate(event.event_date)} · {formatTime(event.event_time)}
              </Text>
            </View>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                {getPriceLabel(event.price)}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
