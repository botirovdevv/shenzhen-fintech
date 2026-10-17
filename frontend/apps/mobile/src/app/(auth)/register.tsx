import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { KeyboardInput, KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, haptic, IconTile, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isAcceptablePassword, passwordStrength, type PasswordLevel } from '@/lib/password';
import { useSession } from '@/store/session';
import { space, useTheme } from '@/theme';

export default function Register() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const signIn = useSession((s) => s.signIn);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);

  const strength = passwordStrength(password);
  const passwordOk = isAcceptablePassword(password);

  const submit = async () => {
    setError(null);
    if (!passwordOk) {
      haptic('warning');
      setError(`Choose a stronger password. ${strength.hint || `Use at least 8 characters.`}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api.register({ name, email, password });
      await signIn(res.token);
      haptic('success');
      router.replace('/appearance');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const bg = dark ? c.bg : c.card;
  const Field = ({ icon, children }: { icon: IconName; children: React.ReactNode }) => (
    <View
      style={{
        height: 52,
        borderRadius: 14,
        backgroundColor: dark ? c.card : c.fill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 14,
      }}
    >
      <Icon name={icon} size={20} color={c.secondary} />
      {children}
    </View>
  );
  const input = { flex: 1, height: 52, fontSize: 17, color: c.label };

  return (
    <KeyboardScreen
      style={{ backgroundColor: bg }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 8,
        paddingHorizontal: 24,
        paddingBottom: insets.bottom + 24,
        gap: space.xl,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        onPress={() => router.back()}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: dark ? c.card : c.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="chevronLeft" size={20} color={c.label} strokeWidth={2.2} />
      </Pressable>
      <View style={{ gap: 12 }}>
        <IconTile name="user" bg={c.accentTint} fg={c.accent} size={64} iconSize={34} rounded={20} />
        <Text variant="title" style={{ fontSize: 30 }} accessibilityRole="header">
          Create your account
        </Text>
        <Text variant="callout" color="secondary">
          Two minutes to set up. You stay in control of every transfer.
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        {Field({
          icon: 'user',
          children: (
            <KeyboardInput
              accessibilityLabel="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={c.secondary}
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              style={input}
            />
          ),
        })}
        {Field({
          icon: 'mail',
          children: (
            <KeyboardInput
              ref={emailRef}
              accessibilityLabel="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={c.secondary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              style={input}
            />
          ),
        })}
        {Field({
          icon: 'lock',
          children: (
            <KeyboardInput
              ref={passRef}
              accessibilityLabel="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password (8+ characters)"
              placeholderTextColor={c.secondary}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={submit}
              style={input}
            />
          ),
        })}
        {strength.level !== 'empty' ? <StrengthMeter level={strength.level} hint={strength.hint} /> : null}
        {error ? (
          <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1 }} />
      <Button title="Continue" iconRight="arrowRight" onPress={submit} loading={busy} disabled={!passwordOk} />
    </KeyboardScreen>
  );
}

const LEVELS = { weak: { bars: 1, label: 'Weak' }, medium: { bars: 2, label: 'Medium' }, strong: { bars: 3, label: 'Strong' } } as const;

function StrengthMeter({ level, hint }: { level: Exclude<PasswordLevel, 'empty'>; hint: string }) {
  const { c } = useTheme();
  const color = { weak: c.danger, medium: c.warn, strong: c.accent }[level];
  const { bars, label } = LEVELS[level];
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`Password strength: ${label}. ${hint}`} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < bars ? color : c.fill }} />
        ))}
      </View>
      <Text variant="footnote" color="secondary">
        <Text variant="footnote" weight="600" style={{ color }}>
          {label}
        </Text>
        {`  ${hint}`}
      </Text>
    </View>
  );
}
