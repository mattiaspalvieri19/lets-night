import { Pressable, View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS_BY_CAT, COLORS, FONT_FAMILY, formatTime, DATE_NAMES } from '@lets-night/shared';
import { useI18n } from '../lib/i18n';

// Card evento a colonna singola, copertina protagonista (per gli eventi sponsorizzati
// che avranno cover_image). Senza foto: poster tipografico (categoria gigante ritagliata +
// tint di categoria) → mai un box vuoto. Stile/colori dell'app, niente gradienti arcobaleno.
export default function EventCard({ event, onPress }) {
  const { t, lang, fmtPrice } = useI18n();
  const accent = (COLORS_BY_CAT[event.category] || [])[2] || COLORS.brand;
  const photo = event.cover_image || null;

  const [, m, d] = (event.event_date || '').split('-').map(Number);
  const dayNum = d || '';
  const monthAbbr = m ? (DATE_NAMES[lang] || DATE_NAMES.it).monthsShort[m - 1].toUpperCase() : '';
  const timeStr = event.end_time
    ? `${formatTime(event.event_time)} – ${formatTime(event.end_time)}`
    : formatTime(event.event_time);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: COLORS.bgElev2,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.borderSubtle,
        overflow: 'hidden',
        marginBottom: 18,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      {/* Header: locale + orario · data prominente */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text numberOfLines={1} style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 }}>
            {event.venues?.name || t('common.venue')}
          </Text>
          {!!timeStr && (
            <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
              {timeStr}{event.venues?.zona ? ` · ${event.venues.zona}` : ''}
            </Text>
          )}
        </View>
        <View style={{ alignItems: 'center', minWidth: 40 }}>
          <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 23, lineHeight: 25, letterSpacing: -0.5 }}>{dayNum}</Text>
          <Text style={{ color: accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{monthAbbr}</Text>
        </View>
      </View>

      {/* Copertina */}
      <View style={{ marginHorizontal: 12, borderRadius: 14, overflow: 'hidden', height: 196, backgroundColor: COLORS.bgElev1 }}>
        {photo ? (
          <>
            <Image source={{ uri: photo }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} locations={[0.55, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          </>
        ) : (
          <>
            {/* tint di categoria sottile + parola categoria ritagliata */}
            <View style={{ position: 'absolute', top: -50, right: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: accent, opacity: 0.1 }} />
            <Text numberOfLines={1} style={{ position: 'absolute', bottom: -12, left: -2, fontFamily: FONT_FAMILY.displayHeavy, fontSize: 92, letterSpacing: -3, color: accent, opacity: 0.18 }}>
              {(event.category || 'NIGHT').toUpperCase()}
            </Text>
          </>
        )}
        {event.is_sponsored && (
          <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: COLORS.warning, fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>SPONSOR</Text>
          </View>
        )}
      </View>

      {/* Footer: titolo + luogo · prezzo */}
      <View style={{ paddingHorizontal: 16, paddingTop: 13, paddingBottom: 16 }}>
        <Text numberOfLines={2} style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 19, lineHeight: 23, letterSpacing: -0.3, marginBottom: 9 }}>
          {event.title}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 12, flex: 1, marginRight: 12 }}>
            {[event.venues?.zona, event.venues?.city || 'Milano'].filter(Boolean).join(', ')}
          </Text>
          <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' }}>{fmtPrice(event.price)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
