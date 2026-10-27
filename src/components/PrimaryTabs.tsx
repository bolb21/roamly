import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, sizes, spacing, typography } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The two primary tabs (Visited, Social) as a pill switcher.
 * Route registration lives in src/app/_layout.tsx; these triggers only
 * reference the routes by name, so this component is purely presentational.
 */
export function PrimaryTabs() {
  return (
    <View style={styles.pill} accessibilityRole="tablist">
      <TabTrigger name="index" asChild>
        <TabButton icon="globe-outline" label="Visited" />
      </TabTrigger>
      <TabTrigger name="social" asChild>
        <TabButton icon="people-outline" label="Social" />
      </TabTrigger>
    </View>
  );
}

// `ref` is omitted because its declared type doesn't match Pressable's in RN 0.88.
type TabButtonProps = Omit<TabTriggerSlotProps, 'ref'> & {
  icon: IconName;
  label: string;
};

function TabButton({ icon, label, isFocused, ...pressableProps }: TabButtonProps) {
  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={styles.tab}>
      {isFocused && (
        <LinearGradient
          colors={[colors.primary, colors.primaryDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.activeFill]}
        />
      )}
      <Ionicons name={icon} size={20} color={isFocused ? colors.text : colors.textMuted} />
      <Text style={[styles.label, { color: isFocused ? colors.text : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    padding: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    height: sizes.tabHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
  },
  activeFill: {
    borderRadius: radii.pill,
    shadowColor: colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    ...typography.label,
  },
});
