import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengeBubble } from '@/components/challenge/ChallengeBubble';
import { ChallengeSheet } from '@/components/challenge/ChallengeSheet';
import { Globe } from '@/components/globe/Globe';
import { MapControlButton } from '@/components/MapControlButton';
import { VisitedCount } from '@/components/VisitedCount';
import { demoUser, todaysChallenge } from '@/data/challenges';
import { MIN_ZOOM, stepZoom } from '@/globe/zoom';
import { useVisitedCountries } from '@/state/visitedCountries';
import { colors, spacing, typography } from '@/theme';

/**
 * Home / Visited tab.
 *
 * Current state: the globe rotates, zooms (pinch or +/-), and countries can be
 * tapped and marked visited. The globe/map mode and locate buttons do nothing yet.
 */
export function VisitedScreen() {
  const insets = useSafeAreaInsets();

  // Domain data, from the shared store so the globe and the count always agree.
  const { visitedIds, toggleVisited } = useVisitedCountries();

  // Transient UI state
  const [bubbleExpanded, setBubbleExpanded] = useState(true);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [globeArea, setGlobeArea] = useState({ width: 0, height: 0 });
  // Shared by pinch (inside Globe) and the zoom buttons below.
  const zoom = useSharedValue(MIN_ZOOM);

  const onGlobeAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setGlobeArea({ width: Math.floor(width), height: Math.floor(height) });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.topRow}>
        <VisitedCount count={visitedIds.size} />
        <ChallengeBubble
          firstName={demoUser.firstName}
          challenge={todaysChallenge}
          expanded={bubbleExpanded}
          onOpenChallenge={() => setChallengeOpen(true)}
          onCollapse={() => setBubbleExpanded(false)}
          onExpand={() => setBubbleExpanded(true)}
        />
      </View>

      <View style={styles.globeArea} onLayout={onGlobeAreaLayout}>
        {globeArea.width > 0 && (
          <Globe
            width={globeArea.width}
            height={globeArea.height}
            zoom={zoom}
            visitedIds={visitedIds}
            onToggleVisited={toggleVisited}
          />
        )}
      </View>

      <Text style={styles.previewNote}>Drag to spin · pinch to zoom · tap a country</Text>

      <View style={styles.controlsRow}>
        <View style={styles.controlGroup}>
          <MapControlButton icon="globe-outline" accessibilityLabel="Globe view" active />
          <MapControlButton icon="map-outline" accessibilityLabel="Terrain map view" />
        </View>
        <View style={styles.controlGroup}>
          <MapControlButton
            icon="remove"
            accessibilityLabel="Zoom out"
            onPress={() => stepZoom(zoom, -1)}
          />
          <MapControlButton
            icon="add"
            accessibilityLabel="Zoom in"
            onPress={() => stepZoom(zoom, 1)}
          />
          <MapControlButton icon="navigate-outline" accessibilityLabel="Centre on current area" />
        </View>
      </View>

      <ChallengeSheet
        challenge={todaysChallenge}
        visible={challengeOpen}
        onClose={() => setChallengeOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    // Lets the mascot badge hang over the globe area's empty corner.
    zIndex: 1,
    marginBottom: -spacing.xxl,
  },
  globeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNote: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
