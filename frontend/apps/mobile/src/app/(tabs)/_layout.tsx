import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, type ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { haptic } from '@/components/ui';
import { useActions } from '@/lib/queries';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={26} color={color} />;
  };
}

export default function TabsLayout() {
  const { c, dark } = useTheme();
  const token = useSession((s) => s.token);
  const hydrated = useSession((s) => s.hydrated);
  const pending = useActions('pending');

  if (hydrated && !token) return <Redirect href="/login" />;

  const pendingCount = pending.data?.length ?? 0;
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic('light') }}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: c.tabActive,
        tabBarInactiveTintColor: c.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.materialEdge,
          backgroundColor: 'transparent',
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView intensity={70} tint={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { backgroundColor: c.material }]} />
        ),
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="add" options={{ title: 'Add', tabBarIcon: tabIcon('plusCircle') }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant', tabBarIcon: tabIcon('chat') }} />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Agent',
          tabBarIcon: tabIcon('shieldCheck'),
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: c.warn, color: c.onWarn, fontSize: 11, fontWeight: '700' },
          tabBarAccessibilityLabel: pendingCount > 0 ? `Agent, ${pendingCount} action waiting` : 'Agent',
        }}
      />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: tabIcon('chart') }} />
    </Tabs>
  );
}
