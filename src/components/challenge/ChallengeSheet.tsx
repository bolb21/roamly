import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { DetailSheet } from '@/components/DetailSheet';
import { colors, radii, spacing, typography } from '@/theme';
import type { DailyChallenge } from '@/types';

type Props = {
  challenge: DailyChallenge;
  visible: boolean;
  onClose: () => void;
};

export function ChallengeSheet({ challenge, visible, onClose }: Props) {
  return (
    <DetailSheet visible={visible} title={challenge.title} onClose={onClose}>
      <Text style={styles.eyebrow}>TODAY’S CHALLENGE</Text>

      {challenge.areaLabel && (
        <View style={styles.areaRow}>
          <Ionicons name="location-sharp" size={16} color={colors.primary} />
          <Text style={styles.area}>{challenge.areaLabel}</Text>
        </View>
      )}

      <Text style={styles.description}>{challenge.description}</Text>

      <View style={styles.demoNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={styles.demoText}>
          Demo content. The location shown is sample data, not your real location.
        </Text>
      </View>
    </DetailSheet>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...typography.caption,
    color: colors.teal,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  area: {
    ...typography.label,
    color: colors.text,
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  demoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  demoText: {
    ...typography.small,
    color: colors.textMuted,
    flex: 1,
  },
});
