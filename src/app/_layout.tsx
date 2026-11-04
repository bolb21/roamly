import { TabList, TabSlot, TabTrigger, Tabs, type TabSlotProps } from 'expo-router/ui';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { PrimaryTabs } from '@/components/PrimaryTabs';
import { ScreenBackground } from '@/components/ScreenBackground';
import { VisitedCountriesProvider } from '@/state/visitedCountries';
import { spacing } from '@/theme';

/**
 * Keeps every opened tab laid out and only makes the inactive one transparent (and
 * untouchable). The default hides it with display: 'none', which wipes the globe's
 * Skia canvas: coming back from Social showed an empty black globe area.
 */
const keepScreensDrawn: NonNullable<TabSlotProps['renderFn']> = (
  descriptor,
  { isFocused, loaded },
) => {
  if (!loaded && !isFocused) return null; // not opened yet
  return (
    <View
      key={descriptor.route.key}
      style={[StyleSheet.absoluteFill, isFocused ? styles.activeScreen : styles.inactiveScreen]}
      pointerEvents={isFocused ? 'auto' : 'none'}
      accessibilityElementsHidden={!isFocused}
      importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}>
      {descriptor.render()}
    </View>
  );
};

/**
 * App shell: background, header, the Visited/Social switcher, and the active screen.
 *
 * Uses Expo Router's headless tabs so the switcher can sit at the top. The hidden
 * TabList below only registers the two routes; PrimaryTabs draws the visible pill.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <VisitedCountriesProvider>
        <Tabs style={styles.root}>
          <StatusBar style="light" />
          <ScreenBackground />
          <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <AppHeader />
            <PrimaryTabs />
            <View style={styles.content}>
              <TabSlot detachInactiveScreens={false} renderFn={keepScreensDrawn} />
            </View>
          </SafeAreaView>

          <TabList style={styles.hidden}>
            <TabTrigger name="index" href="/" />
            <TabTrigger name="social" href="/social" />
          </TabList>
        </Tabs>
      </VisitedCountriesProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    marginTop: spacing.md,
  },
  hidden: {
    display: 'none',
  },
  activeScreen: {
    zIndex: 1,
  },
  inactiveScreen: {
    opacity: 0,
  },
});
