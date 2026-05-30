import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function UserCard({ user, isFollowing, onToggleFollow, busy, hideFollow }) {
  const router = useRouter();
  const display = user.display_name || user.full_name || user.username || 'Utente';
  const handle = user.username ? `@${user.username}` : null;

  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#111118',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.12)',
        padding: 14,
        marginBottom: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Avatar */}
      {user.avatar_url ? (
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#18181f', overflow: 'hidden' }}>
          {/* Placeholder, avatar reali in fase 2 */}
        </View>
      ) : (
        <View style={{
          width: 52, height: 52, borderRadius: 26,
          backgroundColor: 'rgba(168,85,247,0.18)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#A855F7', fontSize: 22, fontWeight: '800' }}>
            {initialOf(display)}
          </Text>
        </View>
      )}

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{display}</Text>
        {handle && (
          <Text numberOfLines={1} style={{ color: '#64748B', fontSize: 12, marginTop: 1 }}>{handle}</Text>
        )}
        {user.bio ? (
          <Text numberOfLines={1} style={{ color: '#9CA3AF', fontSize: 12, marginTop: 3 }}>{user.bio}</Text>
        ) : user.city ? (
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 3 }}>{user.city}</Text>
        ) : null}
        {Array.isArray(user.interests) && user.interests.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {user.interests.slice(0, 3).map(tag => (
              <View key={tag} style={{
                backgroundColor: 'rgba(168,85,247,0.12)',
                borderRadius: 8,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}>
                <Text style={{ color: '#A855F7', fontSize: 10, fontWeight: '600' }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Follow button */}
      {!hideFollow && onToggleFollow && (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onToggleFollow(); }}
          disabled={busy}
          hitSlop={6}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 18,
            backgroundColor: isFollowing ? 'transparent' : '#7C3AED',
            borderWidth: 1,
            borderColor: isFollowing ? 'rgba(168,85,247,0.35)' : '#7C3AED',
            opacity: busy || pressed ? 0.7 : 1,
            minWidth: 88,
            alignItems: 'center',
          })}
        >
          {busy ? (
            <ActivityIndicator color={isFollowing ? '#A855F7' : '#fff'} size="small" />
          ) : (
            <Text style={{
              color: isFollowing ? '#A855F7' : '#fff',
              fontSize: 12,
              fontWeight: '700',
            }}>
              {isFollowing ? 'Segui già' : 'Segui'}
            </Text>
          )}
        </Pressable>
      )}
    </Pressable>
  );
}
