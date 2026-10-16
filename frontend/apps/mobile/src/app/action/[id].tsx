import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { Button, haptic, IconTile, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import { useAccounts, useActions, useApproveAction, usePermissions, useRejectAction } from '@/lib/queries';
import { space, useTheme } from '@/theme';

function minutesLeft(iso?: string) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000));
}

export default function ActionSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const actions = useActions();
  const accounts = useAccounts();
  const perms = usePermissions();
  const approve = useApproveAction();
  const reject = useRejectAction();
  const [error, setError] = useState<string | null>(null);

  const a = actions.data?.find((x) => x.id === id);
  if (!a) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sheet }}>
        {actions.isLoading ? <ActivityIndicator color={c.accent} /> : <Text color="secondary">This action no longer exists.</Text>}
      </View>
    );
  }

  const card = accounts.data?.find((x) => x.type === 'card');
  const savings = accounts.data?.find((x) => x.type === 'savings');
  const p = perms.data;
  const amount = a.amount ?? 0;
  const isTransfer = a.type === 'transfer_to_savings';
  const left = minutesLeft(a.expiresAt);
  const done = a.status !== 'pending';

  const checks: { ok: boolean; text: string }[] = isTransfer
    ? [
        { ok: true, text: 'Your own accounts only (Card → Savings)' },
        { ok: !!p && amount <= p.perActionLimit, text: `Under the ${formatAmount(p?.perActionLimit ?? 0)} per-action limit` },
        { ok: !!p && amount <= p.dailyLimit, text: `Today’s agent total stays under ${formatAmount(p?.dailyLimit ?? 0)}` },
        { ok: (card?.balance ?? 0) >= amount, text: 'Card balance covers the amount' },
      ]
    : [{ ok: true, text: 'Budgets never move money' }];

  const onApprove = async () => {
    setError(null);
    try {
      await approve.mutateAsync(a.id);
      haptic('success');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };
  const onReject = async () => {
    setError(null);
    await reject.mutateAsync(a.id);
    haptic('light');
  };

  const statusBadge: Record<string, { label: string; icon: IconName; bg: string; fg: string }> = {
    pending: { label: 'Needs your approval', icon: 'clock', bg: c.warnTint, fg: c.warnInk },
    executed: { label: 'Executed', icon: 'check', bg: c.accentTint, fg: c.accentInk },
    approved: { label: 'Approved', icon: 'check', bg: c.accentTint, fg: c.accentInk },
    rejected: { label: 'Rejected', icon: 'x', bg: c.fill, fg: c.secondary },
    blocked: { label: 'Blocked by policy', icon: 'ban', bg: c.dangerTint, fg: c.dangerInk },
    expired: { label: 'Expired', icon: 'clock', bg: c.fill, fg: c.secondary },
  };
  const badge = statusBadge[a.status]!;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.sheet }}
      contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: insets.bottom + 20, gap: 18 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: badge.bg,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
          }}
        >
          <Icon name={badge.icon} size={13} color={badge.fg} strokeWidth={2.4} />
          <Text variant="footnote" weight="600" color={badge.fg}>
            {badge.label}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="sparkleSmall" size={13} color={c.secondary} strokeWidth={2.2} />
          <Text variant="footnote" color="secondary">
            Agent · {p?.level ?? 'L2'}
          </Text>
        </View>
      </View>

      {done && (a.status === 'executed' || a.status === 'rejected') ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }} accessibilityLiveRegion="polite">
          <IconTile
            name={a.status === 'executed' ? 'check' : 'x'}
            bg={a.status === 'executed' ? c.accentTint : c.fill}
            fg={a.status === 'executed' ? c.accent : c.secondary}
            size={88}
            iconSize={44}
            rounded={44}
          />
          <Text variant="title" style={{ fontSize: 24 }}>
            {a.status === 'executed' ? (isTransfer ? 'Moved to Savings' : 'Budget set') : 'Nothing was moved'}
          </Text>
          <Text variant="callout" color="secondary" style={{ textAlign: 'center' }} tabular>
            {a.status === 'executed'
              ? isTransfer
                ? `${formatAmount(amount)} UZS is in Savings. New balance: ${formatAmount(savings?.balance ?? 0)} UZS.`
                : 'Food is capped at 800 000 UZS a month.'
              : 'The agent won’t retry this today.'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="file" size={14} color={c.secondary} strokeWidth={2} />
            <Text variant="footnote" color="secondary">
              Saved to the audit log
            </Text>
          </View>
          <Button title="Done" variant="strong" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: space.lg }} />
        </View>
      ) : (
        <>
          <View style={{ gap: 4 }}>
            <Text variant="headline" color="secondary">
              {isTransfer ? 'Move to Savings' : 'Set a monthly budget'}
            </Text>
            <Text variant="largeTitle" tabular style={{ fontSize: 44, lineHeight: 50 }}>
              {isTransfer ? formatAmount(amount) : '800 000'}{' '}
              <Text variant="title2" color="secondary" style={{ fontSize: 22 }}>
                UZS
              </Text>
            </Text>
          </View>

          {isTransfer ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: 14, padding: 12, gap: 6 }}>
                <Icon name="card" size={20} color={c.label} />
                <Text variant="caption" color="secondary">
                  From
                </Text>
                <Text variant="callout" weight="600">
                  {card?.name ?? 'Card'}
                </Text>
                <Text variant="caption" color="secondary" tabular>
                  {formatAmount(card?.balance ?? 0)}
                </Text>
              </View>
              <IconTile name="arrowRight" bg={c.fill} fg={c.secondary} size={32} iconSize={18} rounded={16} />
              <View style={{ flex: 1, backgroundColor: c.accentTint, borderRadius: 14, padding: 12, gap: 6 }}>
                <Icon name="savings" size={20} color={c.accentInk} />
                <Text variant="caption" color="accentInk">
                  To
                </Text>
                <Text variant="callout" weight="600" color="accentInk">
                  Savings
                </Text>
                <Text variant="caption" color="accentInk" tabular>
                  {formatAmount(savings?.balance ?? 0)}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Icon name="bulb" size={18} color={c.accent} strokeWidth={2} />
            <Text variant="callout" color="body" style={{ flex: 1 }}>
              {a.reason}
            </Text>
          </View>

          <View style={{ backgroundColor: c.fill, borderRadius: 16, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="shield" size={15} color={c.secondary} strokeWidth={2} />
              <Text variant="footnote" color="secondary" weight="600">
                Policy Guard checks
              </Text>
            </View>
            {checks.map((ch) => (
              <View key={ch.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name={ch.ok ? 'check' : 'x'} size={18} color={ch.ok ? c.accent : c.dangerInk} strokeWidth={2.6} />
                <Text variant="footnote" style={{ fontSize: 14 }}>
                  {ch.text}
                </Text>
              </View>
            ))}
          </View>

          {a.status === 'blocked' || error ? (
            <View
              style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.dangerTint, padding: 12, borderRadius: 12 }}
            >
              <Icon name="ban" size={18} color={c.dangerInk} strokeWidth={2.2} />
              <Text variant="footnote" color="dangerInk" style={{ flex: 1 }}>
                {error ?? a.reason}
              </Text>
            </View>
          ) : null}

          {a.status === 'pending' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Reject" icon="x" variant="secondary" onPress={onReject} loading={reject.isPending} style={{ flex: 1 }} />
                <Button title="Approve" icon="check" onPress={onApprove} loading={approve.isPending} style={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: -6 }}>
                <Icon name="clock" size={12} color={c.secondary} strokeWidth={2.2} />
                <Text variant="caption" color="secondary">
                  {left !== null ? `Expires in ${left} min · ` : ''}swipe down to decide later
                </Text>
              </View>
            </>
          ) : (
            <Button title="Close" variant="secondary" onPress={() => router.back()} />
          )}
        </>
      )}
    </ScrollView>
  );
}
