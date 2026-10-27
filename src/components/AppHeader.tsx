import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

/** Logo + wordmark. Intentionally no bell/avatar: those aren't features yet. */
export function AppHeader() {
  return (
    <View style={styles.row} accessibilityRole="header">
      <MaterialCommunityIcons name="image-filter-hdr" size={40} color={colors.primary} />
      <View>
        <Text style={styles.wordmark}>Roamly</Text>
        <Text style={styles.tagline}>EXPLORE · CONNECT · COLLECT</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  wordmark: {
    ...typography.wordmark,
    color: colors.text,
  },
  tagline: {
    ...typography.tagline,
    color: colors.textMuted,
    marginTop: -2,
  },
});
