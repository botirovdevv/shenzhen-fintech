import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { Icon, type IconName } from '@/components/Icon';
import { KeyboardInput, KeyboardScreen, useKeyboardHeight } from '@/components/KeyboardScreen';
import { LogoMark, Wordmark } from '@/components/Logo';
import { ProgressRing } from '@/components/ProgressRing';
import { Button, haptic, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/store/session';
import { space, useTheme } from '@/theme';

const HERO_HEIGHT = 380;

function GridPattern({ width, height }: { width: number; height: number }) {
  const step = 28;
  const lines = [];
  for (let x = step; x < width; x += step)
    lines.push(<Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />);
  for (let y = step; y < height; y += step)
    lines.push(<Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />);
  return (
    <Svg width={width} height={height} style={{ position: 'absolute' }}>
      {lines}
    </Svg>
  );
}

// One card of the hero story: rises in, unblurs, settles at a slight angle.
function StoryCard({ delay, rotate, style, children }: { delay: number; rotate: string; style: object; children: React.ReactNode }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) v.setValue(1);
      else Animated.timing(v, { toValue: 1, duration: 650, delay, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          borderRadius: 18,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        style,
        {
          opacity: v,
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
            { rotate },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function GlassIcon({ name }: { name: IconName }) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={20} color="#FFFFFF" />
    </View>
  );
}

export default function Login() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(390);
  const passwordRef = useRef<TextInput>(null);
  const typing = useKeyboardHeight() > 0;
  const heroHeight = typing ? insets.top + 76 : HERO_HEIGHT + insets.top;

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      haptic('warning');
      setError('Enter your email and password, or tap “Use demo account”.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.login({ email: email.trim(), password });
      await signIn(res.token);
      haptic('success');
      router.replace('/(tabs)');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const glass = { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' };
  const bg = dark ? c.bg : c.card;
  const field = {
    height: 52,
    borderRadius: 14,
    backgroundColor: dark ? c.card : c.fill,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingLeft: 14,
  };

  return (
    <KeyboardScreen style={{ backgroundColor: bg }} bounces={false}>
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            height: heroHeight,
            backgroundColor: c.hero,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
            overflow: 'hidden',
          }}
        >
          <GridPattern width={width} height={HERO_HEIGHT + insets.top} />
          <View style={{ position: 'absolute', top: insets.top + 20, left: 24, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LogoMark size={40} variant="white" animated />
            <Wordmark size={24} onBrand />
          </View>

          {typing ? null : (
            <>
              <StoryCard delay={150} rotate="-3deg" style={{ ...glass, top: insets.top + 88, left: 26, width: 250 }}>
                <GlassIcon name="transport" />
                <View style={{ flex: 1 }}>
                  <Text variant="callout" color="#FFFFFF" weight="600">
                    Yandex Go
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.85 }}>
                    <Icon name="sparkleSmall" size={12} color="#FFFFFF" strokeWidth={2.4} />
                    <Text variant="caption" color="#FFFFFF">
                      Sorted as Transport
                    </Text>
                  </View>
                </View>
                <Text variant="callout" color="#FFFFFF" weight="700" tabular>
                  −20 000
                </Text>
              </StoryCard>

              <StoryCard delay={650} rotate="2.5deg" style={{ ...glass, top: insets.top + 168, right: 24, width: 214 }}>
                <ProgressRing value={0.77} size={44} stroke={4} color="#FFFFFF" track="rgba(255,255,255,0.22)" />
                <View>
                  <Text variant="headline" color="#FFFFFF" weight="700" tabular>
                    21 548 UZS
                  </Text>
                  <Text variant="caption" color="#FFFFFF" style={{ opacity: 0.85 }}>
                    left for today
                  </Text>
                </View>
              </StoryCard>

              <StoryCard
                delay={1150}
                rotate="-1deg"
                style={{
                  top: insets.top + 252,
                  left: 20,
                  width: Math.min(310, width - 40),
                  backgroundColor: '#FFFFFF',
                  shadowColor: '#000',
                  shadowOpacity: 0.22,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 8,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: '#E3F4EA',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="shieldCheck" size={20} color="#0E7A4B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="footnote" color="#1C1C1E" weight="600" style={{ fontSize: 14 }}>
                    Move 20 000 to Savings?
                  </Text>
                  <Text variant="caption" color="#636366">
                    Agent asked · you decide
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#0E7A4B',
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 10,
                  }}
                >
                  <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3.2} />
                  <Text variant="caption" color="#FFFFFF" weight="700">
                    Approved
                  </Text>
                </View>
              </StoryCard>
            </>
          )}
        </View>

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: typing ? 18 : 26, paddingBottom: insets.bottom + 24, gap: space.lg }}>
          <View style={{ gap: 6 }}>
            <Text variant="title" style={{ fontSize: 30, lineHeight: 34 }} accessibilityRole="header">
              Spend less.{'\n'}Save on autopilot.
            </Text>
            {typing ? null : (
              <Text variant="callout" color="secondary">
                An AI co-pilot that moves money only when you say so.
              </Text>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <View style={field}>
              <Icon name="mail" size={20} color={c.secondary} />
              <KeyboardInput
                accessibilityLabel="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={c.secondary}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={{ flex: 1, height: 52, fontSize: 17, color: c.label }}
              />
            </View>
            <View style={[field, { paddingRight: 4 }]}>
              <Icon name="lock" size={20} color={c.secondary} />
              <KeyboardInput
                ref={passwordRef}
                accessibilityLabel="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={c.secondary}
                secureTextEntry={!show}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
                style={{ flex: 1, height: 52, fontSize: 17, color: c.label }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={show ? 'Hide password' : 'Show password'}
                onPress={() => setShow((s) => !s)}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name={show ? 'eyeOff' : 'eye'} size={20} color={c.secondary} />
              </Pressable>
            </View>
            {error ? (
              <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </View>

          <View style={{ flex: 1, minHeight: 8 }} />

          <Button title="Sign in" iconRight="arrowRight" onPress={submit} loading={busy} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Text variant="callout" color="secondary">
              New here?
            </Text>
            <Link href="/register" asChild>
              <Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text variant="callout" color="accent" weight="600">
                  Create an account
                </Text>
              </Pressable>
            </Link>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use demo account aziz@femate.uz"
            onPress={() => {
              haptic('light');
              setEmail('aziz@femate.uz');
              setPassword('demo1234');
              setError(null);
            }}
            style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 44, marginTop: -10 }}
          >
            <Icon name="user" size={14} color={c.secondary} strokeWidth={2.2} />
            <Text variant="footnote" color="secondary">
              Use demo account · aziz@femate.uz
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardScreen>
  );
}
