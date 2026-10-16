import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Text } from '@/components/ui';

import { queryClient } from '@/lib/queries';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

// Shown instead of a white screen when a screen throws while rendering.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Icon name="info" size={40} color={c.secondary} />
      <Text variant="title2" style={{ textAlign: 'center' }}>
        Something went wrong on this screen
      </Text>
      <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }} selectable>
        {error.message}
      </Text>
      <Button title="Try again" icon="refresh" size="medium" onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  const hydrate = useSession((s) => s.hydrate);
  const { c, dark } = useTheme();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="connect-bank" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="transactions" />
          <Stack.Screen
            name="action/[id]"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.86],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              contentStyle: { backgroundColor: c.sheet },
            }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
