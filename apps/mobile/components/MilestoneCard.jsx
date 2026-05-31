import { View, Text } from 'react-native';

export default function MilestoneCard({ milestone, progress = 0, unlocked }) {
  const goal = Math.max(1, milestone.goal || 1);
  const pct = Math.min(1, (progress || 0) / goal);

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: unlocked ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.12)',
      backgroundColor: unlocked ? 'rgba(124,58,237,0.1)' : '#111118',
      marginBottom: 10,
      opacity: unlocked ? 1 : 0.78,
    }}>
      {/* Icon */}
      <View style={{
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: unlocked ? 'rgba(168,85,247,0.25)' : '#18181f',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: unlocked ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.12)',
      }}>
        <Text style={{ fontSize: 22 }}>{milestone.icon || '🏆'}</Text>
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>
            {milestone.title}
          </Text>
          <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '800', marginLeft: 6 }}>
            +{milestone.points}
          </Text>
        </View>
        {milestone.description && (
          <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2, lineHeight: 15 }} numberOfLines={2}>
            {milestone.description}
          </Text>
        )}

        {/* Progress / unlocked label */}
        {unlocked ? (
          <Text style={{ color: '#4ADE80', fontSize: 11, fontWeight: '700', marginTop: 6 }}>
            ✓ Sbloccato
          </Text>
        ) : goal > 1 ? (
          <View style={{ marginTop: 8 }}>
            <View style={{
              height: 4, backgroundColor: 'rgba(168,85,247,0.15)',
              borderRadius: 2, overflow: 'hidden',
            }}>
              <View style={{
                width: `${Math.round(pct * 100)}%`,
                height: '100%',
                backgroundColor: '#A855F7',
              }} />
            </View>
            <Text style={{ color: '#64748B', fontSize: 10, marginTop: 4 }}>
              {progress || 0}/{goal}
            </Text>
          </View>
        ) : (
          <Text style={{ color: '#64748B', fontSize: 11, marginTop: 6 }}>Bloccato</Text>
        )}
      </View>
    </View>
  );
}
