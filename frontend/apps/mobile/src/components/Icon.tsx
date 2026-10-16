import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// One stroke icon set (24×24, round caps) shared with the design canvas.
const paths = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  plusCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8',
  plus: 'M12 5v14M5 12h14',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  sparkleSmall: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
  shieldCheck: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  shieldAlert: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM12 8v5M12 16h.01',
  chart: 'M5 20V12M10 20V6M15 20v-9M20 20V4',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDownRight: 'M7 7l10 10M17 9v8H9',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  gauge: 'M12 14l4-4M4.9 19a9 9 0 1 1 14.2 0',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  monitor: 'M4 5h16v11H4zM8 20h8M12 16v4',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 7l12-4v4M16 14h.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  savings: 'M12 3v10M8 9l4 4 4-4M4 15v4h16v-4',
  cash: 'M3 7h18v10H3zM6 10v4M18 10v4M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  bank: 'M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18',
  transport: 'M4 16V12l2-5h12l2 5v4zM4 16v2M20 16v2M7.5 12.5h.01M16.5 12.5h.01',
  bus: 'M6 17h12M6 17V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11M6 17v2M18 17v2M6 11h12M9 14h.01M15 14h.01',
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3',
  utilities: 'M13 2 4 14h7l-1 8 9-12h-7z',
  shopping: 'M6 8h12l-1 13H7zM9 8V6a3 3 0 0 1 6 0v2',
  health: 'M12 21s-7-4.5-9-9a5 5 0 0 1 9-4 5 5 0 0 1 9 4c-2 4.5-9 9-9 9z',
  entertainment: 'M4 6h16v12H4zM10 9l5 3-5 3z',
  education: 'M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5',
  transfer: 'M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
  coffee: 'M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3',
  mic: 'M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3',
  wave: 'M4 12h2M8 8v8M12 5v14M16 8v8M20 12h0',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff:
    'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.2M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6a9 9 0 0 0 4.4-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  rocket: 'M12 2c3 2 5 5.5 5 10l-2 4H9l-2-4c0-4.5 2-8 5-10zM12 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM9 16l-2 5 3-2M15 16l2 5-3-2',
  target: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1M13 11l8-8M17 3h4v4',
  calendar: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
  receipt: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h3M8 16h6',
  power: 'M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0',
  pause: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 9v6M14 9v6',
  refresh: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  cpu: 'M5 5h14v14H5zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  send: 'M21 4L3 11l6 2 2 6 3-4 5 4zM9 13l12-9',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
  ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  trend: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  tune: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  hand: 'M9 11V5a2 2 0 0 1 4 0v6M13 10a2 2 0 0 1 4 0v2M17 11a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L4 14a2 2 0 0 1 3.4-2L9 14',
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 22,
  color,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={paths[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
