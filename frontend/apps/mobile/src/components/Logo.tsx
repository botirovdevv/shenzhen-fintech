import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View, type StyleProp, type ViewStyle } from 'react-native';

// FeMate mark, from the logo canvas (120×120 grid): an F of rounded bars, with a coin sitting where
// the short bar is missing — the money you didn't spend. Built from Views so each piece can animate.
const BRAND = { green: '#0E7A4B', greenDark: '#12A066', coin: '#F5A623', coinRing: '#C47D0E', ink: '#10201A', feDark: '#3DDC97' };

type Variant = 'tile' | 'white' | 'bare';

const BAR = 8.5; // bar corner radius in grid units

export function LogoMark({
  size = 64,
  variant = 'tile',
  dark = false,
  animated = false,
  keepTile = false,
  onDone,
  style,
}: {
  size?: number;
  variant?: Variant;
  dark?: boolean;
  animated?: boolean;
  /** Tile already on screen (e.g. handed over from the native splash): animate only the F and coin. */
  keepTile?: boolean;
  onDone?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const k = size / 120;
  const [t] = useState(() => ({
    tile: new Animated.Value(animated && !keepTile ? 0 : 1),
    stem: new Animated.Value(animated ? 0 : 1),
    top: new Animated.Value(animated ? 0 : 1),
    mid: new Animated.Value(animated ? 0 : 1),
    slot: new Animated.Value(animated ? 0 : 1),
    coin: new Animated.Value(animated ? 0 : 1),
  }));

  useEffect(() => {
    if (!animated) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        Object.values(t).forEach((v) => v.setValue(1));
        onDone?.();
        return;
      }
      const ease = Easing.bezier(0.32, 0.72, 0, 1);
      const grow = (v: Animated.Value, duration: number) =>
        Animated.timing(v, { toValue: 1, duration, easing: ease, useNativeDriver: true });
      Animated.sequence([
        grow(t.tile, keepTile ? 0 : 320),
        Animated.stagger(110, [grow(t.stem, 300), grow(t.top, 280), grow(t.mid, 240), grow(t.slot, 200)]),
        Animated.spring(t.coin, { toValue: 1, useNativeDriver: true, damping: 11, stiffness: 160, mass: 0.8 }),
      ]).start(({ finished }) => finished && onDone?.());
    });
    return () => {
      cancelled = true;
    };
    // Plays once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tileColor = variant === 'white' ? '#FFFFFF' : dark ? BRAND.greenDark : BRAND.green;
  const barColor = variant === 'tile' ? '#FFFFFF' : dark && variant === 'bare' ? BRAND.feDark : BRAND.green;
  const slotColor = variant === 'tile' ? 'rgba(255,255,255,0.45)' : 'rgba(14,122,75,0.45)';

  const box = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: x * k,
    top: y * k,
    width: w * k,
    height: h * k,
  });

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="FeMate" style={[{ width: size, height: size }, style]}>
      {variant !== 'bare' ? (
        <Animated.View
          style={[
            box(0, 0, 120, 120),
            {
              borderRadius: 30 * k,
              backgroundColor: tileColor,
              opacity: t.tile,
              transform: [{ scale: t.tile.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            },
          ]}
        />
      ) : null}
      {/* The "saved" slot the coin drops into. */}
      <Animated.View
        style={[
          box(56, 53, 30, 17),
          { borderRadius: BAR * k, borderWidth: Math.max(1, 2 * k), borderStyle: 'dashed', borderColor: slotColor, opacity: t.slot },
        ]}
      />
      <Animated.View
        style={[
          box(30, 28, 17, 64),
          { borderRadius: BAR * k, backgroundColor: barColor, transformOrigin: 'top', transform: [{ scaleY: t.stem }] },
        ]}
      />
      <Animated.View
        style={[
          box(30, 28, 56, 17),
          { borderRadius: BAR * k, backgroundColor: barColor, transformOrigin: 'left', transform: [{ scaleX: t.top }] },
        ]}
      />
      <Animated.View
        style={[
          box(30, 53, 30, 17),
          { borderRadius: BAR * k, backgroundColor: barColor, transformOrigin: 'left', transform: [{ scaleX: t.mid }] },
        ]}
      />
      <Animated.View
        style={[
          box(69, 53, 17, 17),
          {
            borderRadius: 8.5 * k,
            backgroundColor: BRAND.coin,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: t.coin.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateY: t.coin.interpolate({ inputRange: [0, 1], outputRange: [-46 * k, 0] }) },
              { rotate: t.coin.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) },
            ],
          },
        ]}
      >
        {size >= 48 ? (
          <View
            style={{ width: 8 * k, height: 8 * k, borderRadius: 4 * k, borderWidth: Math.max(1, 1.8 * k), borderColor: BRAND.coinRing }}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

// "Fe" in brand green + "Mate" in ink (white on dark). Sora Bold once loaded, system bold before that.
export function Wordmark({ size = 28, dark = false, onBrand = false }: { size?: number; dark?: boolean; onBrand?: boolean }) {
  const [loaded] = useFonts({ Sora_700Bold });
  const fe = onBrand ? '#B8F0D3' : dark ? BRAND.feDark : BRAND.green;
  const mate = onBrand || dark ? '#FFFFFF' : BRAND.ink;
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: loaded ? 'Sora_700Bold' : undefined,
        fontWeight: loaded ? undefined : '800',
        fontSize: size,
        letterSpacing: -size * 0.035,
        color: mate,
      }}
    >
      <Text style={{ color: fe }}>Fe</Text>Mate
    </Text>
  );
}

export const brand = BRAND;
