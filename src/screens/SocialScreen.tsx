import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography } from '@/theme';

/**
 * Social tab.
 *
 * Current state: placeholder panel only. The terrain-style map with fictional
 * traveller markers is PRD step 7.
 */
export function SocialScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}>
      <LinearGradient
        colors={['#0B3A4A', '#0A2A3F', '#061A33']}
        style={styles.mapPanel}>
        <Ionicons name="people-outline" size={44} color={colors.teal} />
        <Text style={styles.title}>Traveller map</Text>
        <Text style={styles.body}>
          A terrain-style map of fictional travellers will appear here.
        </Text>
      </LinearGradient>

      <Text style={styles.note}>All traveller profiles in this demo are fictional.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  mapPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  note: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
