import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  ZoomIn,
  ZoomOut,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, globeColors, radii, spacing, typography } from '@/theme';

/** Where the bubble's tail points, in the globe canvas's coordinates. Updated every frame. */
export type BubbleAnchor = { x: number; y: number; visible: boolean };

type Props = {
  anchor: SharedValue<BubbleAnchor>;
  /** Width of the area the bubble must stay inside (the globe canvas). */
  containerWidth: number;
  /** The selected country, or null to hide the bubble. */
  country: { id: string; name: string; visited: boolean } | null;
  onToggleVisited: () => void;
};

const BUBBLE_WIDTH = 210;
const TAIL_SIZE = 14;
/** Tall enough for a two-line name plus the button. The bubble sits at its bottom. */
const BOX_HEIGHT = 200;
const EDGE_MARGIN = spacing.xs;

/**
 * Name bubble for the selected country, with a button to mark it visited or
 * unvisited. It follows the country as the globe moves and hides when the
 * country turns away or leaves the screen.
 */
export function CountryBubble({ anchor, containerWidth, country, onToggleVisited }: Props) {
  // The box is positioned so its bottom edge (where the tail tip sits) is on the anchor.
  const boxStyle = useAnimatedStyle(() => {
    const { x, y, visible } = anchor.get();
    const left = Math.min(
      Math.max(x - BUBBLE_WIDTH / 2, EDGE_MARGIN),
      containerWidth - BUBBLE_WIDTH - EDGE_MARGIN,
    );
    return {
      opacity: visible ? 1 : 0,
      // Moved far away when hidden, so the invisible button can't be tapped.
      transform: [{ translateX: left }, { translateY: visible ? y - BOX_HEIGHT : -10000 }],
    };
  });

  // Keeps the tail on the country even when the bubble is pushed in from a screen edge.
  const tailStyle = useAnimatedStyle(() => {
    const { x } = anchor.get();
    const left = Math.min(
      Math.max(x - BUBBLE_WIDTH / 2, EDGE_MARGIN),
      containerWidth - BUBBLE_WIDTH - EDGE_MARGIN,
    );
    const offset = Math.min(
      Math.max(x - left - TAIL_SIZE / 2, radii.md),
      BUBBLE_WIDTH - radii.md - TAIL_SIZE,
    );
    return { marginLeft: offset };
  });

  return (
    <Animated.View pointerEvents="box-none" style={[styles.box, boxStyle]}>
      {country && (
        // Keyed by country so picking another one pops a fresh bubble.
        <Animated.View
          key={country.id}
          entering={ZoomIn.springify().dampingRatio(0.6)}
          exiting={ZoomOut.duration(150)}>
          <View style={styles.bubble}>
            <Text style={styles.name} numberOfLines={2}>
              {country.name}
            </Text>
            <View style={styles.statusRow}>
              <Ionicons
                name={country.visited ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={country.visited ? globeColors.visited : colors.textMuted}
              />
              <Text style={[styles.status, country.visited && styles.statusVisited]}>
                {country.visited ? 'Visited' : 'Not visited yet'}
              </Text>
            </View>
            <Pressable
              onPress={onToggleVisited}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                country.visited ? styles.buttonSecondary : styles.buttonPrimary,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.buttonText}>
                {country.visited ? 'Mark as unvisited' : 'Mark as visited'}
              </Text>
            </Pressable>
          </View>
          <Animated.View style={[styles.tail, tailStyle]} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BUBBLE_WIDTH,
    height: BOX_HEIGHT,
    justifyContent: 'flex-end',
  },
  bubble: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  name: {
    ...typography.label,
    fontSize: 17,
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  status: {
    ...typography.small,
    color: colors.textMuted,
  },
  statusVisited: {
    color: globeColors.visited,
  },
  button: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  buttonText: {
    ...typography.label,
    fontSize: 14,
    color: colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  tail: {
    width: TAIL_SIZE,
    height: TAIL_SIZE,
    // Overlaps the bubble's bottom border so the tail looks attached.
    marginTop: -TAIL_SIZE / 2 - 1,
    marginBottom: TAIL_SIZE / 2,
    transform: [{ rotate: '45deg' }],
    backgroundColor: colors.surfaceStrong,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
});
