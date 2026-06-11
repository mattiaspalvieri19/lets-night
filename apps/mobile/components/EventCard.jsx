import { Pressable, View, Text, Image } from 'react-native';
import { COLORS_BY_CAT, COLORS, FONT_FAMILY, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';

// Card evento foto-first. Senza foto: fallback tipografico (parola categoria
// in display gigante, ritagliata) — mai gradienti a tutta card.
export default function EventCard({ event, onPress }) {
  const accent = (COLORS_BY_CAT[event.category] || [])[2] || COLORS.brand;
  const photo = event.cover_image || event.venues?.cover_image || null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        backgroundColor: COLORS.bgElev2,
        borderRadius: 16,
        overflow: 'hidden',
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View style={{ height: 132, backgroundColor: COLORS.bgElev1, overflow: 'hidden' }}>
        {photo ? (
          <>
            <Image source={{ uri: photo }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' }} />
          </>
        ) : (
          <Text
            numberOfLines={1}
            style={{
              position: 'absolute', bottom: -14, left: -4,
              fontFamily: FONT_FAMILY.displayHeavy,
              fontSize: 64, letterSpacing: -2,
              color: accent, opacity: 0.16,
            }}
          >
            {(event.category || 'Night').toUpperCase()}
          </Text>
        )}
        <View style={{
          position: 'absolute', top: 10, left: 10,
          backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
          paddingHorizontal: 8, paddingVertical: 4,
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
            {formatDate(event.event_date)}
          </Text>
        </View>
        {event.is_sponsored && (
          <View style={{
            position: 'absolute', top: 10, right: 10,
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
            paddingHorizontal: 7, paddingVertical: 4,
          }}>
            <Text style={{ color: COLORS.warning, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>SPONSOR</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 12 }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: FONT_FAMILY.display,
            color: COLORS.textPrimary, fontSize: 15, lineHeight: 19,
            letterSpacing: -0.2, minHeight: 38, marginBottom: 6,
          }}
        >
          {event.title}
        </Text>
        <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 10 }}>
          {event.venues?.name}{event.venues?.zona ? ` · ${event.venues.zona}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: '500' }}>
            {formatTime(event.event_time)}
          </Text>
          <Text style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' }}>
            {getPriceLabel(event.price)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
