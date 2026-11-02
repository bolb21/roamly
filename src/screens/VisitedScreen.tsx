import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengeBubble } from '@/components/challenge/ChallengeBubble';
import { ChallengeSheet } from '@/components/challenge/ChallengeSheet';
import { Globe } from '@/components/globe/Globe';
import { WorldMap } from '@/components/map/WorldMap';
import { MapControlButton } from '@/components/MapControlButton';
import { VisitedCount } from '@/components/VisitedCount';
import { demoUser, todaysChallenge } from '@/data/challenges';
import { MAP_ZOOM, MIN_ZOOM, stepZoom } from '@/globe/zoom';
import { useVisitedCountries } from '@/state/visitedCountries';
import { colors, spacing, typography } from '@/theme';

type ViewMode = 'globe' | 'map';

const HINTS: Record<ViewMode, string> = {
  globe: 'Drag to spin · pinch to zoom · tap a country',
  map: 'Drag to move · pinch to zoom · tap a country',
};

/**
 * Home / Visited tab.
 *
 * Shows the globe or the flat world map (toggled with the buttons bottom-left).
 * Both zoom (pinch or +/-), and countries can be tapped and marked visited. The
 * locate button does nothing yet.
 */
export function VisitedScreen() {
  const insets = useSafeAreaInsets();

  // Domain data, from the shared store so the globe and the count always agree.
  const { visitedIds, toggleVisited } = useVisitedCountries();

  // Transient UI state
  const [bubbleExpanded, setBubbleExpanded] = useState(true);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [globeArea, setGlobeArea] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<ViewMode>('globe');
  // Each view's zoom is shared by its pinch gesture and the zoom buttons below.
  const globeZoom = useSharedValue(MIN_ZOOM);
  const mapZoom = useSharedValue(MAP_ZOOM.min);

  // Both views stay mounted and stacked (so each keeps its position); the hidden
  // one is transparent and ignores touches. It must stay laid out: hiding a Skia
  // canvas with display: 'none' loses its drawing, and it comes back blank. The
  // shown one fades in.
  const fadeIn = useSharedValue(1);
  const fadeInStyle = useAnimatedStyle(() => ({ opacity: fadeIn.get() }));
  const showMode = (next: ViewMode) => {
    if (next === mode) return;
    setMode(next);
    fadeIn.set(0);
    fadeIn.set(withTiming(1, { duration: 250 }));
  };

  const zoomBy = (direction: 1 | -1) =>
    mode === 'globe' ? stepZoom(globeZoom, direction) : stepZoom(mapZoom, direction, MAP_ZOOM);

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
          <Animated.View
            style={[{ width: globeArea.width, height: globeArea.height }, fadeInStyle]}>
            <View
              style={[StyleSheet.absoluteFill, mode !== 'globe' && styles.hidden]}
              pointerEvents={mode === 'globe' ? 'auto' : 'none'}>
              <Globe
                width={globeArea.width}
                height={globeArea.height}
                zoom={globeZoom}
                visitedIds={visitedIds}
                onToggleVisited={toggleVisited}
              />
            </View>
            <View
              style={[StyleSheet.absoluteFill, mode !== 'map' && styles.hidden]}
              pointerEvents={mode === 'map' ? 'auto' : 'none'}>
              <WorldMap
                width={globeArea.width}
                height={globeArea.height}
                zoom={mapZoom}
                visitedIds={visitedIds}
                onToggleVisited={toggleVisited}
              />
            </View>
          </Animated.View>
        )}
      </View>

      <Text style={styles.previewNote}>{HINTS[mode]}</Text>

      <View style={styles.controlsRow}>
        <View style={styles.controlGroup}>
          <MapControlButton
            icon="globe-outline"
            accessibilityLabel="Globe view"
            active={mode === 'globe'}
            onPress={() => showMode('globe')}
          />
          <MapControlButton
            icon="map-outline"
            accessibilityLabel="Flat map view"
            active={mode === 'map'}
            onPress={() => showMode('map')}
          />
        </View>
        <View style={styles.controlGroup}>
          <MapControlButton
            icon="remove"
            accessibilityLabel="Zoom out"
            onPress={() => zoomBy(-1)}
          />
          <MapControlButton icon="add" accessibilityLabel="Zoom in" onPress={() => zoomBy(1)} />
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
  hidden: {
    opacity: 0,
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
