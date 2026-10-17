import { CURRENCIES, convertMoney, fromUzs, toMajor, toMinor, type Currency } from '@femate/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { KeyboardInput, KeyboardScreen } from '@/components/KeyboardScreen';
import { Button, Chip, IconTile, Text } from '@/components/ui';
import { useCurrency } from '@/lib/currency';
import { formatMoney, formatWhole, parseWhole } from '@/lib/format';
import { useMe, useUpdateMe } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const STEPS: { title: string; hint: string; label: string; chips: number[]; icon: IconName }[] = [
  {
    title: 'What is your monthly income?',
    hint: 'Salary and any regular income after tax. FeMate uses it to set a daily limit.',
    label: 'Monthly income',
    chips: [3_000_000, 4_000_000, 6_000_000],
    icon: 'wallet',
  },
  {
    title: 'Fixed monthly costs?',
    hint: 'Rent, internet, phone and loans: things you pay every month no matter what.',
    label: 'Fixed costs per month',
    chips: [300_000, 600_000, 1_000_000],
    icon: 'home',
  },
  {
    title: 'How much do you want to save?',
    hint: 'The agent works toward this goal and suggests moving leftovers to Savings.',
    label: 'Savings goal per month',
    chips: [300_000, 500_000, 800_000],
    icon: 'target',
  },
];

/** A UZS preset in `c`, rounded to two significant digits: 3 000 000 UZS -> $250. */
function preset(uzs: number, c: Currency): number {
  const major = toMajor(fromUzs(uzs, c), c);
  const step = 10 ** Math.max(0, Math.floor(Math.log10(major)) - 1);
  return toMinor(Math.round(major / step) * step, c);
}

function daysInMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function Onboarding() {
  const saved = useCurrency();
  const [cur, setCur] = useState<Currency>('UZS');
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const updateMe = useUpdateMe();
  const me = useMe();
  const editing = useLocalSearchParams<{ mode?: string }>().mode === 'edit';
  const [step, setStep] = useState(0);
  const [values, setValues] = useState([4_000_000, 600_000, 500_000]); // minor units of `cur`
  const [loaded, setLoaded] = useState(false);

  // When editing from Settings, start from the saved numbers (adjusting state during render, once).
  if (editing && me.data && !loaded) {
    setLoaded(true);
    setCur(me.data.currency);
    setValues([me.data.monthlyIncome, me.data.fixedCostsMonthly, me.data.savingsGoalMonthly]);
  }
  // A new account starts in the currency it already has (so'm unless changed).
  if (!editing && me.data && !loaded) {
    setLoaded(true);
    if (saved !== 'UZS') pickCurrency(saved);
  }
  const q = STEPS[step]!;
  const value = values[step] ?? 0;
  const days = daysInMonth();
  const allowance = Math.max(0, Math.floor(((values[0] ?? 0) - (values[1] ?? 0) - (values[2] ?? 0)) / days));
  const last = step === STEPS.length - 1;

  const set = (v: number) => setValues((vs) => vs.map((x, i) => (i === step ? v : x)));
  function pickCurrency(next: Currency) {
    setValues((vs) => vs.map((v) => toMinor(Math.round(toMajor(convertMoney(v, cur, next), next)), next)));
    setCur(next);
  }
  const next = async () => {
    if (!last) return setStep(step + 1);
    await updateMe.mutateAsync({
      ...(editing ? {} : { currency: cur }),
      monthlyIncome: values[0],
      fixedCostsMonthly: values[1],
      savingsGoalMonthly: values[2],
    });
    if (editing) router.back();
    else router.push('/connect-bank');
  };
  const back = () => (step === 0 ? router.back() : setStep(step - 1));

  // Android back goes to the previous step instead of leaving onboarding.
  useEffect(() => {
    if (step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep((s) => Math.max(0, s - 1));
      return true;
    });
    return () => sub.remove();
  }, [step]);
  const bg = dark ? c.bg : c.card;

  return (
    <KeyboardScreen
      style={{ backgroundColor: bg }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 8,
        paddingHorizontal: 24,
        paddingBottom: insets.bottom + 24,
        gap: 28,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={step === 0 ? 'Back' : 'Previous step'}
          onPress={back}
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
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step + 1} of 3`}>
          {STEPS.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.fill2 }} />
          ))}
        </View>
        <Text variant="callout" color="secondary" tabular style={{ width: 32, textAlign: 'right' }}>
          {step + 1}/3
        </Text>
      </View>

      <View style={{ gap: 14 }}>
        <IconTile name={q.icon} bg={c.accentTint} fg={c.accent} size={64} iconSize={34} rounded={20} />
        <Text variant="title" style={{ fontSize: 30, lineHeight: 35 }} accessibilityRole="header">
          {q.title}
        </Text>
        <Text variant="body" color="secondary" style={{ fontSize: 17, lineHeight: 24 }}>
          {q.hint}
        </Text>
      </View>

      {step === 0 && !editing ? (
        <View style={{ gap: 8 }}>
          <Text variant="footnote" color="secondary" weight="600">
            Currency
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CURRENCIES.map((x) => (
              <Chip key={x} label={x} selected={x === cur} onPress={() => pickCurrency(x)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text variant="footnote" color="secondary" weight="600">
          {q.label}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 8,
            borderBottomWidth: 2,
            borderBottomColor: c.accent,
            paddingBottom: 8,
          }}
        >
          <KeyboardInput
            accessibilityLabel={q.label}
            value={formatWhole(value, cur)}
            onChangeText={(t) => set(parseWhole(t, cur))}
            keyboardType="number-pad"
            returnKeyType="next"
            onSubmitEditing={next}
            style={{
              flex: 1,
              fontSize: 40,
              fontWeight: '700',
              letterSpacing: -0.8,
              color: c.label,
              fontVariant: ['tabular-nums'],
              padding: 0,
            }}
          />
          <Text variant="title2" color="secondary" weight="600">
            {cur}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 }}>
          {q.chips.map((uzs) => {
            const n = preset(uzs, cur);
            return <Chip key={uzs} label={formatWhole(n, cur)} selected={value === n} onPress={() => set(n)} />;
          })}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ backgroundColor: c.accentTint, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconTile name="receipt" bg={c.accent} fg={c.onAccent} size={40} iconSize={22} rounded={12} />
        <View style={{ gap: 2 }}>
          <Text variant="footnote" color="accentInk" weight="600">
            Your daily allowance
          </Text>
          <Text variant="title2" color="accentInk" tabular style={{ fontSize: 24 }}>
            {formatMoney(allowance, cur)}
          </Text>
          <Text variant="caption" color="accentInk">
            (income − fixed − goal) ÷ {days} days
          </Text>
        </View>
      </View>

      <Button
        title={last ? (editing ? 'Save budget' : 'Connect your bank') : 'Continue'}
        iconRight={last && editing ? undefined : 'arrowRight'}
        icon={last && editing ? 'check' : undefined}
        onPress={next}
        loading={updateMe.isPending}
        style={{ marginTop: -space.sm }}
      />
    </KeyboardScreen>
  );
}
