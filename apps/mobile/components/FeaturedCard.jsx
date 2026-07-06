import { Pressable, View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS_BY_CAT, COLORS, FONT_FAMILY, formatTime } from '@lets-night/shared';
import { useI18n } from '../lib/i18n';

// Card "in evidenza" editoriale: foto a tutta card con scrim per il testo.
// Senza foto: fondo neutro + categoria in display gigante.
export default function FeaturedCard({ event, onPress }) {
  const { t, tLabel, fmtDate, fmtPrice } = useI18n();
  const accent = (COLORS_BY_CAT[event.category] || [])[2] || COLORS.brand;
  const photo = event.cover_image || null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height: 240,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: COLORS.bgElev2,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      {photo ? (
        <Image source={{ uri: photo }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <Text
          numberOfLines={1}
          style={{
            position: 'absolute', top: 44, left: -6,
            fontFamily: FONT_FAMILY.displayHeavy,
            fontSize: 110, letterSpacing: -4,
            color: accent, opacity: 0.13,
          }}
        >
          {(tLabel(event.category) || 'Night').toUpperCase()}
        </Text>
      )}
      {/* Scrim fotografico: garantisce la leggibilità del testo in basso */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']}
        locations={[0.35, 0.65, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View style={{ flex: 1, padding: 18, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {t('home.featured')} · {tLabel(event.category)}
            </Text>
          </View>
        </View>

        <View>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
            {fmtDate(event.event_date)} · {formatTime(event.event_time)}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              fontFamily: FONT_FAMILY.displayHeavy,
              color: '#fff', fontSize: 27, lineHeight: 31, letterSpacing: -0.6,
              marginBottom: 10,
            }}
          >
            {event.title}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, flex: 1, marginRight: 12 }}>
              {event.venues?.name}{event.venues?.zona ? ` · ${event.venues.zona}` : ''}
            </Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: '#0A0A0C', fontSize: 14, fontWeight: '800' }}>
                {fmtPrice(event.price)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
