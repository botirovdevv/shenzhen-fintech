// Color tokens from the approved design (light + dark). Screens read these through useTheme().

export interface Palette {
  bg: string;
  card: string;
  sheet: string;
  fill: string;
  fill2: string;
  label: string;
  secondary: string;
  body: string;
  separator: string;
  chevron: string;
  accent: string;
  onAccent: string;
  accentTint: string;
  accentInk: string;
  accentSoft: string;
  warn: string;
  onWarn: string;
  warnTint: string;
  warnInk: string;
  danger: string;
  dangerTint: string;
  dangerInk: string;
  hero: string;
  strong: string;
  onStrong: string;
  tabActive: string;
  tabInactive: string;
  material: string;
  materialEdge: string;
  categoryShades: readonly [string, string, string, string];
}

export const light: Palette = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  sheet: '#FFFFFF',
  fill: '#F2F2F7',
  fill2: '#E5E5EA',
  label: '#1C1C1E',
  secondary: '#636366',
  body: '#3A3A3C',
  separator: '#E5E5EA',
  chevron: '#AEAEB2',
  accent: '#0E7A4B',
  onAccent: '#FFFFFF',
  accentTint: '#E3F4EA',
  accentInk: '#075C37',
  accentSoft: '#7CC4A0',
  warn: '#B25E00',
  onWarn: '#FFFFFF',
  warnTint: '#FFF1DE',
  warnInk: '#8A4A00',
  danger: '#C62828',
  dangerTint: '#FDECEA',
  dangerInk: '#A11F1F',
  hero: '#0E7A4B',
  strong: '#1C1C1E',
  onStrong: '#FFFFFF',
  tabActive: '#0E7A4B',
  tabInactive: '#6E6E73',
  material: 'rgba(249,249,251,0.8)',
  materialEdge: 'rgba(0,0,0,0.12)',
  categoryShades: ['#0E7A4B', '#2E9A66', '#5DB88A', '#93D2B0'],
};

export const dark: Palette = {
  bg: '#000000',
  card: '#1C1C1E',
  sheet: '#1C1C1E',
  fill: '#2C2C2E',
  fill2: '#3A3A3C',
  label: '#F2F2F7',
  secondary: '#A1A1A6',
  body: '#D1D1D6',
  separator: '#38383A',
  chevron: '#636366',
  accent: '#34C77B',
  onAccent: '#04170D',
  accentTint: '#123D29',
  accentInk: '#8BE3B5',
  accentSoft: '#1F6B44',
  warn: '#E08A1E',
  onWarn: '#1C1000',
  warnTint: '#3A2A12',
  warnInk: '#FFB760',
  danger: '#D93025',
  dangerTint: '#3B1513',
  dangerInk: '#FF8A80',
  hero: '#0B5F3B',
  strong: '#F2F2F7',
  onStrong: '#1C1C1E',
  tabActive: '#34C77B',
  tabInactive: '#98989F',
  material: 'rgba(28,28,30,0.78)',
  materialEdge: 'rgba(255,255,255,0.12)',
  categoryShades: ['#34C77B', '#2A9E62', '#21774B', '#1A5638'],
};
