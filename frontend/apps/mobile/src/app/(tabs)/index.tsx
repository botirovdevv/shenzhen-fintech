import { Link, router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { InsightCard } from '@/components/InsightCard';
import { Screen } from '@/components/Screen';
import { Banner, Card, ErrorRow, IconTile, PressableScale, ProgressBar, Text } from '@/components/ui';
import { categoryIcon, sourceIcon, sourceLabel } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { categoryLabel, formatAmount, formatMoney, formatTime, greeting } from '@/lib/format';
import { periodRange } from '@/lib/period';
import { useAccounts, useActions, useDailySummary, useInsight, useMe, usePeriodSummary, useTransactions } from '@/lib/queries';
import { space, useTheme } from '@/theme';

// Home answers three questions in this order: how much can I still spend today, what should I do about it,
// and where is my money. Everything else is one tap away.
export default function Home() {
  const cur = useCurrency();
  const { c } = useTheme();
  const me = useMe();
  const accounts = useAccounts();
  const summary = useDailySummary();
  const insight = useInsight();
  const txs = useTransactions();
  const pending = useActions('pending');
  // This month's categories come from the server's totals, not from the last few transactions.
  const month = useMemo(() => periodRange('month'), []);
  const period = usePeriodSummary(month.from, month.to);

  const refreshing = accounts.isRefetching || summary.isRefetching || txs.isRefetching;
  const refresh = () =>
    void Promise.all([accounts.refetch(), summary.refetch(), txs.refetch(), pending.refetch(), insight.refetch(), period.refetch()]);

  const monthByCategory = useMemo(
    () =>
      (period.data?.byCategory ?? [])
        .filter((x) => x.category !== 'transfer' && x.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4)
        .map((x) => [x.category, x.amount] as const),
    [period.data],
  );

  const total = (accounts.data ?? []).reduce((s, a) => s + a.balance, 0);
  const noMoneyYet = !!accounts.data && accounts.data.every((a) => a.balance === 0) && txs.data?.items.length === 0;
  const cashBelowZero = (accounts.data?.find((a) => a.type === 'cash')?.balance ?? 0) < 0;
  const s = summary.data;
  const spentRatio = s ? s.todaySpent / Math.max(1, s.dailyAllowance) : 0;
  const over = s ? s.remainingToday < 0 : false;
  const firstPending = pending.data?.[0];
  const max = monthByCategory[0]?.[1] ?? 1;
  const statusColor = over ? c.warn : c.accent;

  const accountStyle: Record<string, { icon: IconName; bg: string; fg: string }> = {
    card: { icon: 'card', bg: c.fill, fg: c.label },
    savings: { icon: 'savings', bg: c.accentTint, fg: c.accentInk },
    cash: { icon: 'cash', bg: c.fill, fg: c.label },
  };

  const actions: { label: string; icon: IconName; href: Href; primary?: boolean }[] = [
    { label: 'Expense', icon: 'plus', href: '/add', primary: true },
    { label: 'Add money', icon: 'wallet', href: { pathname: '/money', params: { mode: 'add' } } },
    { label: 'Move', icon: 'transfer', href: { pathname: '/money', params: { mode: 'move' } } },
    { label: 'Fix cash', icon: 'tune', href: { pathname: '/money', params: { mode: 'set', account: 'cash' } } },
  ];

  return (
    <Screen
      tabs
      title="Today"
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon
            name={new Date().getHours() >= 18 || new Date().getHours() < 5 ? 'moon' : 'sun'}
            size={16}
            color={c.secondary}
            strokeWidth={2}
          />
          <Text variant="callout" color="secondary" weight="500">
            {greeting()}, {me.data?.name ?? '…'}
          </Text>
        </View>
      }
      right={
        <Link href="/settings" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="sliders" size={22} color={c.label} />
          </Pressable>
        </Link>
      }
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {firstPending ? (
        <Banner
          tone="warn"
          icon="shieldAlert"
          title={
            firstPending.type === 'transfer_to_savings'
              ? `Move ${formatMoney(firstPending.amount ?? 0, cur)} to Savings?`
              : 'Set a food budget?'
          }
          subtitle="Waiting for your approval"
          onPress={() => router.push({ pathname: '/action/[id]', params: { id: firstPending.id } })}
        />
      ) : null}

      {noMoneyYet ? (
        <Banner
          tone="success"
          icon="wallet"
          title="Add the money you have"
          subtitle="Your card, cash and savings start at zero. Tap to enter what you really have."
          onPress={() => router.push('/balances')}
        />
      ) : cashBelowZero ? (
        <Banner
          tone="warn"
          icon="cash"
          title="Your cash is below zero"
          subtitle="You recorded more cash spending than you had. Tap to set what’s in your wallet."
          onPress={() => router.push({ pathname: '/money', params: { mode: 'set', account: 'cash' } })}
        />
      ) : null}

      {/* 1. The one number that matters today. */}
      <Card style={{ gap: space.lg }}>
        {s ? (
          <>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name={over ? 'shieldAlert' : 'gauge'} size={15} color={statusColor} strokeWidth={2.2} />
                <Text variant="footnote" weight="600" style={{ color: statusColor }}>
                  {over ? 'Over today’s limit by' : 'You can still spend today'}
                </Text>
              </View>
              <Text
                variant="largeTitle"
                tabular
                style={{ fontSize: 40, lineHeight: 46, color: over ? c.warn : c.label }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatAmount(Math.abs(s.remainingToday), cur)}{' '}
                <Text variant="title2" color="secondary">
                  {cur}
                </Text>
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              <ProgressBar value={spentRatio} color={statusColor} track={over ? c.warnTint : c.accentTint} height={10} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="footnote" color="secondary" tabular>
                  Spent{' '}
                  <Text variant="footnote" weight="600" tabular>
                    {formatAmount(s.todaySpent, cur)}
                  </Text>
                </Text>
                <Text variant="footnote" color="secondary" tabular>
                  Daily limit{' '}
                  <Text variant="footnote" weight="600" tabular>
                    {formatAmount(s.dailyAllowance, cur)}
                  </Text>
                </Text>
              </View>
            </View>
          </>
        ) : summary.isError ? (
          <ErrorRow message="Couldn’t load today’s limit." onRetry={() => void summary.refetch()} />
        ) : (
          <ActivityIndicator color={c.accent} style={{ height: 112 }} />
        )}
      </Card>

      {/* 2. What to do about it: the assistant's check-in, only when something needs attention. */}
      {insight.data?.status === 'over' ? <InsightCard insight={insight.data} compact /> : null}

      {/* 3. Quick actions: equal tiles, labels under the icons so they never wrap. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {actions.map((a) => (
          <View key={a.label} style={{ flex: 1 }}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => router.push(a.href)}
              style={{ alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: 18, backgroundColor: c.card }}
            >
              <IconTile
                name={a.icon}
                bg={a.primary ? c.accent : c.fill}
                fg={a.primary ? c.onAccent : c.label}
                size={44}
                iconSize={22}
                rounded={22}
              />
              <Text variant="caption" weight="600" numberOfLines={1} adjustsFontSizeToFit>
                {a.label}
              </Text>
            </PressableScale>
          </View>
        ))}
      </View>

      {/* 4. Where the money is. */}
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Text variant="footnote" color="secondary" weight="500">
            Total balance
          </Text>
          <Text variant="title2" tabular numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
            {accounts.data ? formatAmount(total, cur) : '…'}{' '}
            <Text variant="footnote" color="secondary" weight="600">
              {cur}
            </Text>
          </Text>
        </View>
        {accounts.isError ? <ErrorRow message="Couldn’t load your balances." onRetry={() => void accounts.refetch()} /> : null}
        {accounts.isLoading ? <ActivityIndicator color={c.accent} style={{ height: 64 }} /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(accounts.data ?? []).map((a) => {
            const st = accountStyle[a.type] ?? accountStyle.cash!;
            const box = { backgroundColor: st.bg, borderRadius: 14, padding: 12, gap: 6 };
            const tile = (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={st.icon} size={16} color={st.fg} strokeWidth={2} />
                  <Text variant="caption" weight="600" numberOfLines={1} style={{ color: st.fg, flexShrink: 1 }}>
                    {a.name}
                  </Text>
                </View>
                <Text variant="callout" weight="600" tabular numberOfLines={1} adjustsFontSizeToFit style={{ color: st.fg }}>
                  {formatAmount(a.balance, cur)}
                </Text>
              </>
            );
            // The card account opens the FeMate card screen.
            return (
              <View key={a.id} style={{ flex: 1 }}>
                {a.type === 'card' ? (
                  <PressableScale
                    onPress={() => router.push('/card')}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.name}, open FeMate card`}
                    style={box}
                  >
                    {tile}
                  </PressableScale>
                ) : (
                  <View style={box}>{tile}</View>
                )}
              </View>
            );
          })}
        </View>
      </Card>

      {monthByCategory.length ? (
        <Card style={{ gap: 14 }}>
          <SectionHeader icon="chart" title="This month" link="Reports" onPress={() => router.push('/reports')} />
          {monthByCategory.map(([cat, amount], i) => (
            <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name={categoryIcon[cat]} bg={c.fill} fg={c.label} size={34} iconSize={18} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="callout" weight="500">
                    {categoryLabel[cat]}
                  </Text>
                  <Text variant="callout" color="secondary" tabular>
                    {formatAmount(amount, cur)}
                  </Text>
                </View>
                <ProgressBar value={amount / max} color={c.categoryShades[i] ?? c.accent} track={c.fill} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card padded={false} style={{ paddingVertical: 8 }}>
        <View style={{ paddingLeft: 20, paddingRight: 16, paddingTop: 4 }}>
          <SectionHeader icon="clock" title="Recent" link="See all" onPress={() => router.push('/transactions')} />
        </View>
        {txs.isError ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <ErrorRow message="Couldn’t load transactions." onRetry={() => void txs.refetch()} />
          </View>
        ) : null}
        {txs.data && txs.data.items.length === 0 ? (
          <Text variant="callout" color="secondary" style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
            Nothing yet. Tap Expense above to add your first one.
          </Text>
        ) : null}
        {(txs.data?.items ?? []).slice(0, 4).map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 20 }}>
            <IconTile
              name={categoryIcon[t.category]}
              bg={t.category === 'transfer' ? c.accentTint : c.fill}
              fg={t.category === 'transfer' ? c.accent : c.label}
              size={40}
              iconSize={20}
              rounded={20}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="500" numberOfLines={1}>
                {t.description}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name={sourceIcon[t.source]} size={13} color={c.secondary} strokeWidth={2.2} />
                <Text variant="footnote" color="secondary" numberOfLines={1}>
                  {categoryLabel[t.category]} · {formatTime(t.occurredAt)} · {sourceLabel[t.source]}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text variant="body" weight="600" tabular color={t.category === 'transfer' ? c.accent : c.label}>
                {t.direction === 'in' ? '+' : t.category === 'transfer' ? '' : '−'}
                {formatAmount(t.amount, cur)}
              </Text>
              {t.original ? (
                <Text variant="footnote" color="secondary" tabular>
                  {formatMoney(t.original.amount, t.original.currency)}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function SectionHeader({ icon, title, link, onPress }: { icon: IconName; title: string; link: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={20} color={c.accent} strokeWidth={2} />
        <Text variant="title2">{title}</Text>
      </View>
      <PressableScale
        onPress={onPress}
        accessibilityRole="link"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 }}
      >
        <Text variant="callout" color="accent" weight="500">
          {link}
        </Text>
        <Icon name="chevronRight" size={14} color={c.accent} strokeWidth={2.4} />
      </PressableScale>
    </View>
  );
}
