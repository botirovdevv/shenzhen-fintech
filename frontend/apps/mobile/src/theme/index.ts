import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';
import { dark, light, type Palette } from './colors';

export type { Palette } from './colors';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;

export const type = {
  largeTitle: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.5 },
  title2: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  sectionLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
} as const;

export function useTheme(): { c: Palette; dark: boolean } {
  const system = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const isDark = appearance === 'system' ? system === 'dark' : appearance === 'dark';
  return { c: isDark ? dark : light, dark: isDark };
}
