import type { Account } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type IconName } from '@/components/Icon';
import { KeyboardInput, KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, haptic, IconTile, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatMoney, formatWhole, parseWhole } from '@/lib/format';
import { useAccounts, useSetBalance } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const ROWS: { type: Account['type']; label: string; hint: string; icon: IconName }[] = [
  { type: 'card', label: 'On your card', hint: 'What your bank app shows for the card you spend from.', icon: 'card' },
  { type: 'cash', label: 'Cash in your wallet', hint: 'Count it roughly. You can correct it any time.', icon: 'cash' },
  { type: 'savings', label: 'Already saved', hint: 'Money you keep aside and don’t spend.', icon: 'savings' },
];

// After connecting the bank: the user's real starting money, so FeMate starts from the truth instead of zero.
export default function StartingBalances() {
  const cur = useCurrency();
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useAccounts();
  const setBalance = useSetBalance();
  const [values, setValues] = useState<Record<Account['type'], number>>({ card: 0, cash: 0, savings: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = values.card + values.cash + values.savings;
  // Start from what the accounts already hold (opened again from Home, a blank field must not zero an account).
  const [loaded, setLoaded] = useState(false);
  if (!loaded && accounts.data) {
    setLoaded(true);
    const of = (t: Account['type']) => Math.max(0, accounts.data.find((a) => a.type === t)?.balance ?? 0);
    setValues({ card: of('card'), cash: of('cash'), savings: of('savings') });
  }

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // One at a time: each call records its own "Starting balance" row.
      for (const r of ROWS) {
        const now = accounts.data?.find((a) => a.type === r.type)?.balance ?? 0;
        if (values[r.type] !== now) await setBalance.mutateAsync({ account: r.type, balance: values[r.type] });
      }
      haptic('success');
      router.replace('/(tabs)');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen
      style={{ backgroundColor: dark ? c.bg : c.card }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 24,
        paddingHorizontal: 24,
        paddingBottom: insets.bottom + 24,
        gap: 28,
      }}
    >
      <View style={{ gap: 14 }}>
        <IconTile name="wallet" bg={c.accentTint} fg={c.accent} size={64} iconSize={34} rounded={20} />
        <Text variant="title" style={{ fontSize: 30, lineHeight: 35 }} accessibilityRole="header">
          How much do you have right now?
        </Text>
        <Text variant="body" color="secondary" style={{ fontSize: 17, lineHeight: 24 }}>
          FeMate starts from your real money. Nothing is charged; these are just your starting numbers.
        </Text>
      </View>

      {ROWS.map((r) => (
        <View key={r.type} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconTile name={r.icon} bg={c.fill} fg={c.label} size={30} iconSize={17} rounded={9} />
            <Text variant="callout" weight="600">
              {r.label}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 8,
              borderBottomWidth: 2,
              borderBottomColor: c.accent,
              paddingBottom: 6,
            }}
          >
            <KeyboardInput
              accessibilityLabel={r.label}
              value={values[r.type] ? formatWhole(values[r.type], cur) : ''}
              placeholder="0"
              placeholderTextColor={c.secondary}
              onChangeText={(t) => setValues((v) => ({ ...v, [r.type]: parseWhole(t, cur) }))}
              keyboardType="number-pad"
              style={{
                flex: 1,
                fontSize: 30,
                fontWeight: '700',
                letterSpacing: -0.6,
                color: c.label,
                fontVariant: ['tabular-nums'],
                padding: 0,
              }}
            />
            <Text variant="headline" color="secondary" weight="600">
              {cur}
            </Text>
          </View>
          <Text variant="footnote" color="secondary">
            {r.hint}
          </Text>
        </View>
      ))}

      <View style={{ flex: 1 }} />

      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Button
          title={total > 0 ? `Start with ${formatMoney(total, cur)}` : 'Continue'}
          iconRight="arrowRight"
          onPress={save}
          loading={busy}
        />
        <Button title="Skip for now" variant="plain" onPress={() => router.replace('/(tabs)')} disabled={busy} />
      </View>
    </KeyboardScreen>
  );
}
