import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import { colors } from '@/theme';

/** Full-screen dark navy gradient used behind every screen. */
export function ScreenBackground() {
  return (
    <LinearGradient
      colors={[colors.backgroundTop, colors.background, colors.backgroundBottom]}
      locations={[0, 0.55, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
}
