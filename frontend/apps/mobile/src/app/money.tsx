import type { Account } from '@femate/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { Button, Chip, haptic, IconTile, PressableScale, Segmented, Text } from '@/components/ui';
import { errorMessage, usingMock } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount, formatMoney, formatWhole, parseAmountInput } from '@/lib/format';
import { useAccounts, useCard, useDeposit, useSetBalance, useTransfer } from '@/lib/queries';
import { space, useTheme } from '@/theme';

type Mode = 'add' | 'move' | 'set';
type AccountType = Account['type'];

const ACCOUNT_ICON: Record<AccountType, IconName> = { card: 'card', savings: 'savings', cash: 'cash' };
const TYPES: AccountType[] = ['card', 'cash', 'savings'];

// Common moves, one tap each.
const SHORTCUTS: { label: string; icon: IconName; from: AccountType; to: AccountType }[] = [
  { label: 'ATM withdrawal', icon: 'cash', from: 'card', to: 'cash' },
  { label: 'Savings → card', icon: 'card', from: 'savings', to: 'card' },
  { label: 'Card → savings', icon: 'savings', from: 'card', to: 'savings' },
  { label: 'Cash → card', icon: 'bank', from: 'cash', to: 'card' },
];

const ADD_NOTES: Record<AccountType, string[]> = {
  card: [],
  cash: ['Salary', 'Gift', 'Sold something'],
  savings: ['Salary', 'Gift'],
};

function AccountPicker({
  value,
  onChange,
  accounts,
  exclude,
}: {
  value: AccountType;
  onChange: (t: AccountType) => void;
  accounts: Account[];
  exclude?: AccountType;
}) {
  const { c } = useTheme();
  const cur = useCurrency();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {TYPES.map((t) => {
        const a = accounts.find((x) => x.type === t);
        const on = t === value;
        const off = t === exclude;
        // PressableScale's style lands inside its Pressable, so a wrapper takes the row's space.
        return (
          <View key={t} style={{ flex: 1 }}>
            <PressableScale
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: off }}
              accessibilityLabel={a?.name ?? t}
              disabled={off}
              onPress={() => {
                haptic('light');
                onChange(t);
              }}
              style={{
                flexGrow: 1,
                padding: 12,
                gap: 6,
                borderRadius: 14,
                borderWidth: 2,
                borderColor: on ? c.accent : 'transparent',
                backgroundColor: c.card,
                opacity: off ? 0.4 : 1,
              }}
            >
              <Icon name={ACCOUNT_ICON[t]} size={20} color={on ? c.accent : c.label} />
              <View>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {a?.name ?? t}
                </Text>
                <Text variant="callout" weight="600" tabular numberOfLines={1} adjustsFontSizeToFit>
                  {formatAmount(a?.balance ?? 0, cur)}
                </Text>
              </View>
            </PressableScale>
          </View>
        );
      })}
    </View>
  );
}

export default function MoneySheet() {
  const cur = useCurrency();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: Mode; account?: AccountType; from?: AccountType; to?: AccountType }>();
  const accounts = useAccounts().data ?? [];
  const sandbox = useCard().data?.sandbox ?? true;
  const deposit = useDeposit();
  const transfer = useTransfer();
  const setBalance = useSetBalance();

  const [mode, setMode] = useState<Mode>(params.mode ?? 'add');
  const [to, setTo] = useState<AccountType>(params.to ?? params.account ?? 'card');
  const [from, setFrom] = useState<AccountType>(params.from ?? 'card');
  const [moveTo, setMoveTo] = useState<AccountType>(params.to ?? 'cash');
  const [target, setTarget] = useState<AccountType>(params.account ?? 'cash');
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedSet, setLoadedSet] = useState(false);

  const balanceOf = (t: AccountType) => accounts.find((a) => a.type === t)?.balance ?? 0;
  const nameOf = (t: AccountType) => accounts.find((a) => a.type === t)?.name ?? t;
  const amount = parseAmountInput(text, cur);

  // "Set balance" starts from what the app thinks is there (adjusting state during render, once).
  if (mode === 'set' && !loadedSet && accounts.length) {
    setLoadedSet(true);
    setText(formatWhole(balanceOf(target), cur));
  }

  const busy = deposit.isPending || transfer.isPending || setBalance.isPending;
  const tooMuch = mode === 'move' && amount > balanceOf(from);
  const canSubmit = mode === 'set' ? text.trim() !== '' : amount > 0 && !tooMuch && (mode !== 'move' || from !== moveTo);

  const submit = async () => {
    setError(null);
    try {
      if (mode === 'add') await deposit.mutateAsync({ to, amount, ...(note ? { description: note } : {}) });
      else if (mode === 'move') await transfer.mutateAsync({ from, to: moveTo, amount });
      else await setBalance.mutateAsync({ account: target, balance: amount });
      haptic('success');
      // Opened from a link, there's nothing to go back to.
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };

  const pickFrom = (t: AccountType) => {
    setFrom(t);
    if (t === moveTo) setMoveTo(TYPES.find((x) => x !== t)!);
  };

  const title = { add: 'Add money', move: 'Move money', set: 'Update balance' }[mode];
  const buttonTitle =
    mode === 'add'
      ? `Add ${amount > 0 ? formatMoney(amount, cur) : ''} to ${nameOf(to)}`.replace('  ', ' ')
      : mode === 'move'
        ? `Move ${amount > 0 ? formatMoney(amount, cur) : ''}`.trim()
        : `Set ${nameOf(target)} to ${formatMoney(amount, cur)}`;

  let hint: string;
  if (mode === 'add') {
    hint =
      to === 'card'
        ? sandbox || usingMock
          ? 'Sandbox top-up: no real card is charged. The money is spendable with your FeMate card right away.'
          : 'The amount is added to your card balance.'
        : to === 'cash'
          ? 'Cash you got from outside your accounts, like salary paid in cash or a gift. Taking cash from an ATM is a move, not this.'
          : 'Money paid straight into Savings from outside.';
  } else if (mode === 'move') {
    hint = 'Only between your own accounts. It’s not counted as spending.';
  } else {
    const diff = amount - balanceOf(target);
    hint =
      diff === 0
        ? `Count what’s really in your ${target === 'cash' ? 'wallet' : nameOf(target)} and type it here.`
        : `That’s ${diff > 0 ? '+' : '−'}${formatMoney(Math.abs(diff), cur)}. FeMate records the difference as a correction, not as spending.`;
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: c.sheet }}
      contentContainerStyle={{ paddingTop: space.xl, paddingHorizontal: space.lg, paddingBottom: insets.bottom + 24, gap: space.lg }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile
          name={mode === 'add' ? 'plusCircle' : mode === 'move' ? 'transfer' : 'tune'}
          bg={c.accentTint}
          fg={c.accent}
          size={44}
          iconSize={24}
          rounded={13}
        />
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
      </View>

      <Segmented<Mode>
        options={[
          { value: 'add', label: 'Add' },
          { value: 'move', label: 'Move' },
          { value: 'set', label: 'Set balance' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setNote(null);
          if (m === 'set') setText(formatWhole(balanceOf(target), cur));
          else if (mode === 'set') setText('');
        }}
      />

      {mode === 'add' ? (
        <View style={{ gap: 8 }}>
          <Text variant="footnote" color="secondary" weight="600">
            To
          </Text>
          <AccountPicker value={to} onChange={(t) => (setTo(t), setNote(null))} accounts={accounts} />
        </View>
      ) : null}

      {mode === 'move' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SHORTCUTS.map((s) => (
              <Chip
                key={s.label}
                label={s.label}
                icon={s.icon}
                selected={from === s.from && moveTo === s.to}
                onPress={() => {
                  setFrom(s.from);
                  setMoveTo(s.to);
                }}
              />
            ))}
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="footnote" color="secondary" weight="600">
              From
            </Text>
            <AccountPicker value={from} onChange={pickFrom} accounts={accounts} />
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="footnote" color="secondary" weight="600">
              To
            </Text>
            <AccountPicker value={moveTo} onChange={setMoveTo} accounts={accounts} exclude={from} />
          </View>
        </>
      ) : null}

      {mode === 'set' ? (
        <View style={{ gap: 8 }}>
          <Text variant="footnote" color="secondary" weight="600">
            Account
          </Text>
          <AccountPicker
            value={target}
            onChange={(t) => {
              setTarget(t);
              setText(formatWhole(balanceOf(t), cur));
            }}
            accounts={accounts}
          />
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text variant="footnote" color="secondary" weight="600">
          {mode === 'set' ? `What’s in ${nameOf(target)} right now` : 'Amount'}
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
          <TextInput
            accessibilityLabel="Amount"
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(null);
            }}
            placeholder="0"
            placeholderTextColor={c.secondary}
            keyboardType="decimal-pad"
            autoFocus={mode !== 'set'}
            selectTextOnFocus
            style={{
              flex: 1,
              fontSize: 36,
              fontWeight: '700',
              letterSpacing: -0.6,
              color: c.label,
              fontVariant: ['tabular-nums'],
              padding: 0,
            }}
          />
          <Text variant="title2" color="secondary" weight="600">
            {cur}
          </Text>
        </View>
        {mode === 'move' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="footnote" color={tooMuch ? 'danger' : 'secondary'}>
              {tooMuch ? 'More than you have in ' : 'Available in '}
              {nameOf(from)}: {formatMoney(balanceOf(from), cur)}
            </Text>
            {balanceOf(from) > 0 ? (
              <Button title="All" size="small" variant="tinted" onPress={() => setText(formatWhole(balanceOf(from), cur))} />
            ) : null}
          </View>
        ) : null}
        {mode === 'add' && ADD_NOTES[to].length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
            {ADD_NOTES[to].map((n) => (
              <Chip key={n} label={n} selected={note === n} onPress={() => setNote(note === n ? null : n)} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Icon name="info" size={18} color={c.secondary} />
        <Text variant="footnote" color="secondary" style={{ flex: 1 }}>
          {hint}
        </Text>
      </View>

      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}

      <Button title={buttonTitle} icon="check" onPress={submit} loading={busy} disabled={!canSubmit || busy} />
    </ScrollView>
  );
}
