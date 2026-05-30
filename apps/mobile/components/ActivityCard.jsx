import { View, Text, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDate } from '@lets-night/shared';

const ACTIVITY_META = {
  booking_made:    { icon: '🎟️', label: 'ha prenotato' },
  going_to:        { icon: '🎉', label: 'andrà a' },
  was_at:          { icon: '✨', label: 'è stato a' },
  photo_uploaded:  { icon: '📸', label: 'ha caricato una foto da' },
  badge_unlocked:  { icon: '🏆', label: 'ha sbloccato' },
  venue_favorited: { icon: '❤️', label: 'ha aggiunto ai preferiti' },
  table_organized: { icon: '🍾', label: 'ha organizzato un tavolo a' },
};

function ago(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'adesso';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}g`;
  return formatDate(iso.split('T')[0]);
}

export default function ActivityCard({ activity, hideAuthor }) {
  const router = useRouter();
  const meta = ACTIVITY_META[activity.type] || { icon: '•', label: activity.type };
  const target = activity.events?.title
    || activity.venues?.name
    || activity.milestone_title
    || '—';
  const navigateTarget = () => {
    if (activity.event_id) router.push(`/event/${activity.event_id}`);
    else if (activity.venue_id) router.push(`/venue/${activity.venue_id}`);
  };
  const author = activity.profiles?.display_name
    || activity.profiles?.full_name
    || activity.profiles?.username
    || 'Utente';

  return (
    <Pressable
      onPress={navigateTarget}
      style={({ pressed }) => ({
        backgroundColor: '#111118',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.12)',
        padding: 14,
        marginBottom: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: 'rgba(168,85,247,0.15)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 13, lineHeight: 19 }}>
            {!hideAuthor && (
              <Text
                style={{ fontWeight: '800' }}
                onPress={() => activity.user_id && router.push(`/user/${activity.user_id}`)}
              >
                {author}{' '}
              </Text>
            )}
            <Text style={{ color: '#9CA3AF' }}>{meta.label} </Text>
            <Text style={{ color: '#A855F7', fontWeight: '700' }}>{target}</Text>
          </Text>
          {activity.caption && (
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 6, lineHeight: 17 }}>
              {activity.caption}
            </Text>
          )}
          {activity.image_url && (
            <Image
              source={{ uri: activity.image_url }}
              style={{ width: '100%', height: 180, borderRadius: 10, marginTop: 8, backgroundColor: '#18181f' }}
              resizeMode="cover"
            />
          )}
          <Text style={{ color: '#475569', fontSize: 11, marginTop: 8 }}>{ago(activity.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}
