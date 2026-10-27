import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

type Props = {
  count: number;
};

/** Compact count of visited countries. The value is always derived from state. */
export function VisitedCount({ count }: Props) {
  return (
    <View style={styles.chip} accessibilityLabel={`${count} countries visited`}>
      <Text style={styles.number}>{count}</Text>
      <Text style={styles.label}>{count === 1 ? 'COUNTRY\nVISITED' : 'COUNTRIES\nVISITED'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  number: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  label: {
    ...typography.caption,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.textMuted,
  },
});
