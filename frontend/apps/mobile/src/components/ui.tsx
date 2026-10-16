import * as Haptics from 'expo-haptics';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { radius, space, type, useTheme, type Palette } from '@/theme';
import { Icon, type IconName } from './Icon';

export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'warning') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else void Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

type Variant = keyof typeof type;

export function Text({
  variant = 'body',
  color,
  weight,
  tabular,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: keyof Palette | (string & {}); weight?: TextStyle['fontWeight']; tabular?: boolean }) {
  const { c } = useTheme();
  const resolved = color ? ((c as unknown as Record<string, string>)[color] ?? color) : c.label;
  return (
    <RNText
      {...rest}
      style={[
        type[variant] as TextStyle,
        { color: resolved },
        weight ? { fontWeight: weight } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}

// Feedback on press-in (scale + haptic), the way native controls respond under the finger.
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  hapticOnPress = true,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOnPress?: boolean; children: ReactNode }) {
  const scale = useState(() => new Animated.Value(1))[0];
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (hapticOnPress) haptic('light');
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading,
  disabled,
  style,
  size = 'large',
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'tinted' | 'danger' | 'strong' | 'plain';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'large' | 'medium' | 'small';
}) {
  const { c } = useTheme();
  const colors = {
    primary: [c.accent, c.onAccent],
    secondary: [c.fill, c.label],
    tinted: [c.accentTint, c.accentInk],
    danger: [c.danger, '#FFFFFF'],
    strong: [c.strong, c.onStrong],
    plain: ['transparent', c.accent],
  }[variant];
  const height = { large: 54, medium: 44, small: 36 }[size];
  const font = { large: 17, medium: 15, small: 14 }[size];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        {
          height,
          paddingHorizontal: size === 'large' ? 20 : 16,
          borderRadius: size === 'large' ? 16 : height / 2,
          backgroundColor: colors[0],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[1]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={font + 2} color={colors[1]!} strokeWidth={2.4} /> : null}
          <RNText style={{ color: colors[1], fontSize: font, fontWeight: '600' }}>{title}</RNText>
          {iconRight ? <Icon name={iconRight} size={font + 1} color={colors[1]!} strokeWidth={2.4} /> : null}
        </>
      )}
    </PressableScale>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.card, borderRadius: radius.xl, padding: padded ? space.xl : 0 }, style]}>{children}</View>;
}

export function IconTile({
  name,
  bg,
  fg,
  size = 36,
  iconSize,
  rounded = 10,
}: {
  name: IconName;
  bg: string;
  fg: string;
  size?: number;
  iconSize?: number;
  rounded?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: rounded, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={iconSize ?? Math.round(size * 0.55)} color={fg} />
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="sectionLabel" color="secondary" style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>
      {children}
    </Text>
  );
}

export function Chip({ label, icon, selected, onPress }: { label: string; icon?: IconName; selected?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  const bg = selected ? c.accent : c.fill;
  const fg = selected ? c.onAccent : c.label;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        height: 36,
        paddingHorizontal: 12,
        borderRadius: 18,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? fg : c.accent} strokeWidth={2} /> : null}
      <RNText style={{ color: fg, fontSize: 14, fontWeight: '600' }}>{label}</RNText>
    </PressableScale>
  );
}

export function ProgressBar({ value, color, track, height = 6 }: { value: number; color: string; track: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ height, borderRadius: height / 2, width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }} />
    </View>
  );
}

export function ListRow({
  icon,
  tile,
  title,
  value,
  valueColor,
  onPress,
  last,
  destructive,
  right,
}: {
  icon?: IconName;
  tile?: string;
  title: string;
  value?: string;
  valueColor?: string;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
  right?: ReactNode;
}) {
  const { c } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, gap: 12, minHeight: 52 }}>
      {icon ? <IconTile name={icon} bg={tile ?? c.accent} fg="#FFFFFF" size={30} iconSize={18} rounded={8} /> : null}
      <View
        style={{
          flex: 1,
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingRight: 12,
          borderBottomWidth: last ? 0 : 0.5,
          borderBottomColor: c.separator,
        }}
      >
        <Text variant="body" color={destructive ? c.danger : c.label} weight={destructive ? '500' : undefined}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {value ? (
            <Text variant="body" color={valueColor ?? c.secondary} tabular>
              {value}
            </Text>
          ) : null}
          {right}
          {onPress && !destructive ? <Icon name="chevronRight" size={14} color={c.chevron} strokeWidth={2.6} /> : null}
        </View>
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ backgroundColor: pressed ? c.fill : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c, dark } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 2, borderRadius: 10, backgroundColor: dark ? c.fill : '#E3E3E8' }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic('light');
              onChange(o.value);
            }}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 8,
              backgroundColor: on ? (dark ? '#636366' : '#FFFFFF') : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              ...(on
                ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
                : null),
            }}
          >
            {o.icon ? <Icon name={o.icon} size={14} color={c.label} strokeWidth={2.2} /> : null}
            <RNText style={{ color: c.label, fontSize: 14, fontWeight: '600' }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// Inline load failure with a retry, so a failed request never leaves a spinner turning forever.
export function ErrorRow({ message = 'Couldn’t load this.', onRetry }: { message?: string; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.dangerTint }}
    >
      <Icon name="info" size={18} color={c.dangerInk} strokeWidth={2.2} />
      <Text variant="footnote" color={c.dangerInk} style={{ flex: 1 }}>
        {message}
      </Text>
      <Button title="Try again" icon="refresh" size="small" variant="secondary" onPress={onRetry} style={{ backgroundColor: c.card }} />
    </View>
  );
}

export function Banner({
  tone,
  icon,
  title,
  subtitle,
  onPress,
  action,
}: {
  tone: 'warn' | 'success' | 'danger';
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  action?: ReactNode;
}) {
  const { c } = useTheme();
  const t = {
    warn: { bg: c.warnTint, ink: c.warnInk, dot: c.warn, onDot: c.onWarn },
    success: { bg: c.accentTint, ink: c.accentInk, dot: c.accent, onDot: c.onAccent },
    danger: { bg: c.dangerTint, ink: c.dangerInk, dot: c.danger, onDot: '#FFFFFF' },
  }[tone];
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        paddingHorizontal: 16,
        borderRadius: radius.lg,
        backgroundColor: t.bg,
      }}
    >
      <IconTile name={icon} bg={t.dot} fg={t.onDot} size={36} iconSize={20} rounded={18} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight="600">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color={t.ink}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ?? (onPress ? <Icon name="chevronRight" size={16} color={t.ink} strokeWidth={2.2} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button">
      {body}
    </PressableScale>
  );
}
