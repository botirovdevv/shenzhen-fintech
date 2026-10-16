import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { space, useTheme } from '@/theme';
import { Text } from './ui';

export const TAB_BAR_HEIGHT = 56;

// Scrollable page with an iOS-style large title. `tabs` leaves room for the floating tab bar.
export function Screen({
  title,
  subtitle,
  right,
  children,
  tabs,
  bottomInset = 0,
  refreshing,
  onRefresh,
  header,
  scrollProps,
}: {
  title?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  tabs?: boolean;
  bottomInset?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  header?: ReactNode;
  scrollProps?: ScrollViewProps;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        {...scrollProps}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}
        contentContainerStyle={{
          paddingTop: insets.top + space.md,
          paddingHorizontal: space.lg,
          // While typing, the keyboard covers the tab bar, so room for the keyboard replaces it.
          paddingBottom: (kb > 0 ? kb : tabs ? insets.bottom + TAB_BAR_HEIGHT : insets.bottom) + space.xxl + bottomInset,
          gap: space.lg,
        }}
      >
        {header}
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: space.xs }}>
            <View style={{ flex: 1, gap: 2 }}>
              {typeof subtitle === 'string' ? (
                <Text variant="callout" color="secondary" weight="500">
                  {subtitle}
                </Text>
              ) : (
                subtitle
              )}
              <Text variant="largeTitle" accessibilityRole="header">
                {title}
              </Text>
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}
