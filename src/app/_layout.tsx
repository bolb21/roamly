import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { PrimaryTabs } from '@/components/PrimaryTabs';
import { ScreenBackground } from '@/components/ScreenBackground';
import { spacing } from '@/theme';

/**
 * App shell: background, header, the Visited/Social switcher, and the active screen.
 *
 * Uses Expo Router's headless tabs so the switcher can sit at the top. The hidden
 * TabList below only registers the two routes; PrimaryTabs draws the visible pill.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <Tabs style={styles.root}>
        <StatusBar style="light" />
        <ScreenBackground />
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <AppHeader />
          <PrimaryTabs />
          <View style={styles.content}>
            <TabSlot />
          </View>
        </SafeAreaView>

        <TabList style={styles.hidden}>
          <TabTrigger name="index" href="/" />
          <TabTrigger name="social" href="/social" />
        </TabList>
      </Tabs>
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
});
