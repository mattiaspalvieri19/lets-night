import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@lets-night/shared';

export default function MilestoneCard({ milestone, progress = 0, unlocked }) {
  const goal = Math.max(1, milestone.goal || 1);
  const pct = Math.min(1, (progress || 0) / goal);

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
      backgroundColor: COLORS.bgElev2,
      marginBottom: 8,
    }}>
      {/* Marker minimal */}
      <View style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: unlocked ? COLORS.brand : 'rgba(255,255,255,0.04)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: unlocked ? 0 : 1,
        borderColor: COLORS.borderSubtle,
      }}>
        {unlocked ? (
          <Ionicons name="checkmark" size={16} color="#fff" />
        ) : (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textDisabled }} />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{
            color: unlocked ? COLORS.textPrimary : COLORS.textSecondary,
            fontWeight: '600',
            fontSize: 14,
            flex: 1,
          }} numberOfLines={1}>
            {milestone.title}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginLeft: 6 }}>
            +{milestone.points}
          </Text>
        </View>
        {milestone.description && (
          <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3, lineHeight: 15 }} numberOfLines={2}>
            {milestone.description}
          </Text>
        )}
        {!unlocked && goal > 1 && (
          <View style={{ marginTop: 8 }}>
            <View style={{
              height: 2,
              backgroundColor: COLORS.borderSubtle,
              borderRadius: 1,
              overflow: 'hidden',
            }}>
              <View style={{
                width: `${Math.round(pct * 100)}%`,
                height: '100%',
                backgroundColor: COLORS.brand,
              }} />
            </View>
            <Text style={{ color: COLORS.textDisabled, fontSize: 10, marginTop: 4 }}>
              {progress || 0}/{goal}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
