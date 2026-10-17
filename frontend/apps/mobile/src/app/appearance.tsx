import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, IconTile, PressableScale, Text } from '@/components/ui';
import { useSettings } from '@/store/settings';
import { space, useTheme } from '@/theme';
import { dark as darkPalette, light as lightPalette, type Palette } from '@/theme/colors';

const OPTIONS = [
  { id: 'light', label: 'Light', hint: 'White background', palette: lightPalette },
  { id: 'dark', label: 'Dark', hint: 'Black background', palette: darkPalette },
] as const;

// Right after sign-up: pick the app's background. Light is preselected and is what you get if you just continue.
export default function AppearanceSetup() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { appearance, setAppearance } = useSettings();
  const selected = appearance === 'dark' ? 'dark' : 'light';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
        gap: space.xl,
      }}
    >
      <View style={{ gap: 12 }}>
        <IconTile name="sun" bg={c.accentTint} fg={c.accent} size={64} iconSize={34} rounded={20} />
        <Text variant="title" style={{ fontSize: 30 }} accessibilityRole="header">
          Choose your look
        </Text>
        <Text variant="callout" color="secondary">
          Pick the background colour for FeMate. You can change it any time in Settings → Appearance.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => {
          const on = selected === o.id;
          return (
            <View key={o.id} style={{ flex: 1 }}>
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${o.label}: ${o.hint}`}
                onPress={() => setAppearance(o.id)}
                style={{
                  borderRadius: 22,
                  borderWidth: 2.5,
                  borderColor: on ? c.accent : c.separator,
                  padding: 10,
                  gap: 12,
                  backgroundColor: c.card,
                }}
              >
                <Preview p={o.palette} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingBottom: 4 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: on ? c.accent : c.chevron,
                      backgroundColor: on ? c.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {on ? <Icon name="check" size={13} color={c.onAccent} strokeWidth={3} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="headline">{o.label}</Text>
                    <Text variant="caption" color="secondary">
                      {o.hint}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            </View>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      <Button title="Continue" iconRight="arrowRight" onPress={() => router.replace('/onboarding')} />
    </View>
  );
}

/** A tiny Home screen drawn in the palette, so the choice shows what the app will look like. */
function Preview({ p }: { p: Palette }) {
  const bar = (w: number | `${number}%`, color: string, h = 6) => (
    <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: color }} />
  );
  return (
    <View style={{ height: 180, borderRadius: 14, backgroundColor: p.bg, padding: 10, gap: 8, overflow: 'hidden' }}>
      {bar('45%', p.label, 8)}
      <View style={{ backgroundColor: p.card, borderRadius: 10, padding: 10, gap: 8, alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 5, borderColor: p.accent }} />
        {bar('60%', p.secondary)}
      </View>
      <View style={{ backgroundColor: p.card, borderRadius: 10, padding: 10, gap: 6 }}>
        {bar('80%', p.label)}
        {bar('50%', p.secondary)}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1, height: 22, borderRadius: 11, backgroundColor: p.accent }} />
        <View style={{ flex: 1, height: 22, borderRadius: 11, backgroundColor: p.fill }} />
      </View>
    </View>
  );
}
