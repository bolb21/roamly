import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';
import type { DailyChallenge } from '@/types';

type Props = {
  firstName: string;
  challenge: DailyChallenge;
  expanded: boolean;
  onOpenChallenge: () => void;
  onCollapse: () => void;
  onExpand: () => void;
};

/**
 * Compact speech bubble near the top-right of Visited, attached to a small
 * mascot badge. Collapsing hides the text but keeps the badge, so the
 * challenge is always one tap away without crowding the globe.
 */
export function ChallengeBubble({
  firstName,
  challenge,
  expanded,
  onOpenChallenge,
  onCollapse,
  onExpand,
}: Props) {
  return (
    <View style={styles.wrapper}>
      {expanded && (
        <Pressable
          onPress={onOpenChallenge}
          accessibilityRole="button"
          accessibilityHint="Opens today's challenge"
          style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}>
          <Ionicons name="location-sharp" size={16} color={colors.primary} style={styles.pin} />
          <Text style={styles.text}>
            Hey {firstName} 👋{'\n'}
            {challenge.areaLabel ? (
              <>
                Looks like you’re in <Text style={styles.highlight}>{challenge.areaLabel}</Text>.
                Tap to see today’s local challenge.
              </>
            ) : (
              'Tap to see today’s challenge.'
            )}
          </Text>
          <Pressable
            onPress={onCollapse}
            accessibilityRole="button"
            accessibilityLabel="Hide challenge message"
            hitSlop={10}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.tail} />
        </Pressable>
      )}

      <Pressable
        onPress={expanded ? onOpenChallenge : onExpand}
        accessibilityRole="button"
        accessibilityLabel="Daily challenge"
        style={styles.badge}>
        <Text style={styles.badgeEmoji}>🐒</Text>
      </Pressable>
    </View>
  );
}

const BUBBLE_BG = colors.surfaceStrong;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-end',
    maxWidth: 230,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: BUBBLE_BG,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  pressed: {
    opacity: 0.85,
  },
  pin: {
    marginTop: 1,
  },
  text: {
    ...typography.small,
    color: colors.text,
    flex: 1,
  },
  highlight: {
    color: colors.teal,
    fontWeight: '600',
  },
  // Small rotated square peeking out of the bottom edge, pointing at the badge.
  tail: {
    position: 'absolute',
    bottom: -6,
    right: 20,
    width: 12,
    height: 12,
    backgroundColor: BUBBLE_BG,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  badge: {
    marginTop: spacing.sm,
    marginRight: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.teal,
    backgroundColor: colors.surface,
  },
  badgeEmoji: {
    fontSize: 20,
  },
});
