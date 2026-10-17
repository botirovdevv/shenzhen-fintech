import type { Category } from '@femate/shared';
import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen } from '@/components/Screen';
import { Banner, Card, ErrorRow, IconTile, PressableScale, ProgressBar, Text } from '@/components/ui';
import { categoryIcon, sourceIcon, sourceLabel } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { categoryLabel, formatAmount, formatMoney, formatTime, greeting } from '@/lib/format';
import { useAccounts, useActions, useDailySummary, useMe, useTransactions } from '@/lib/queries';
import { space, useTheme } from '@/theme';

export default function Home() {
  const cur = useCurrency();
  const { c } = useTheme();
  const me = useMe();
  const accounts = useAccounts();
  const summary = useDailySummary();
  const txs = useTransactions();
  const pending = useActions('pending');

  const refreshing = accounts.isRefetching || summary.isRefetching || txs.isRefetching;
  const refresh = () => void Promise.all([accounts.refetch(), summary.refetch(), txs.refetch(), pending.refetch()]);

  const monthByCategory = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const map = new Map<Category, number>();
    for (const t of txs.data?.items ?? []) {
      if (t.direction !== 'out' || t.category === 'transfer' || Date.parse(t.occurredAt) < start.getTime()) continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    return [...map].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [txs.data]);

  const total = (accounts.data ?? []).reduce((s, a) => s + a.balance, 0);
  const s = summary.data;
  const spentRatio = s ? s.todaySpent / Math.max(1, s.dailyAllowance) : 0;
  const over = s ? s.remainingToday < 0 : false;
  const firstPending = pending.data?.[0];
  const max = monthByCategory[0]?.[1] ?? 1;

  const accountStyle: Record<string, { icon: IconName; bg: string; fg: string; sub: string }> = {
    card: { icon: 'card', bg: c.fill, fg: c.label, sub: c.secondary },
    savings: { icon: 'savings', bg: c.accentTint, fg: c.accentInk, sub: c.accentInk },
    cash: { icon: 'cash', bg: c.fill, fg: c.label, sub: c.secondary },
  };

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

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        {s ? (
          <>
            <ProgressRing value={spentRatio} color={over ? c.warn : c.accent} track={c.accentTint}>
              <Text variant="title2" tabular style={{ fontSize: 24 }}>
                {Math.round(spentRatio * 100)}%
              </Text>
              <Text variant="caption" color="secondary">
                spent
              </Text>
            </ProgressRing>
            <View style={{ flex: 1, gap: 10 }}>
              <View style={{ gap: 2 }}>
                <Text variant="footnote" color="secondary" weight="500">
                  {over ? 'Over today’s limit' : 'Left for today'}
                </Text>
                <Text variant="title" tabular color={over ? c.warn : c.accent} style={{ fontSize: 28 }}>
                  {formatAmount(Math.abs(s.remainingToday), cur)}{' '}
                  <Text variant="callout" weight="600" color={over ? c.warn : c.accent}>
                    {cur}
                  </Text>
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="arrowDownRight" size={14} color={c.secondary} strokeWidth={2.2} />
                  <Text variant="footnote" color="secondary">
                    Spent{' '}
                    <Text variant="footnote" weight="600" tabular>
                      {formatAmount(s.todaySpent, cur)}
                    </Text>
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="gauge" size={14} color={c.secondary} strokeWidth={2.2} />
                  <Text variant="footnote" color="secondary">
                    Daily limit{' '}
                    <Text variant="footnote" weight="600" tabular>
                      {formatAmount(s.dailyAllowance, cur)}
                    </Text>
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : summary.isError ? (
          <View style={{ flex: 1 }}>
            <ErrorRow message="Couldn’t load today’s limit." onRetry={() => void summary.refetch()} />
          </View>
        ) : (
          <ActivityIndicator color={c.accent} style={{ flex: 1, height: 112 }} />
        )}
      </Card>

      <Card style={{ gap: space.lg }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="wallet" size={15} color={c.secondary} strokeWidth={2} />
            <Text variant="footnote" color="secondary" weight="500">
              Total balance
            </Text>
          </View>
          <Text variant="largeTitle" tabular style={{ fontSize: 32 }}>
            {formatAmount(total, cur)}{' '}
            <Text variant="headline" color="secondary">
              {cur}
            </Text>
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(accounts.data ?? []).map((a) => {
            const st = accountStyle[a.type]!;
            const tile = (
              <>
                <Icon name={st.icon} size={20} color={st.fg} />
                <View>
                  <Text variant="caption" color={st.sub} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text variant="callout" weight="600" color={st.fg} tabular numberOfLines={1} adjustsFontSizeToFit>
                    {formatAmount(a.balance, cur)}
                  </Text>
                </View>
              </>
            );
            const box = { backgroundColor: st.bg, borderRadius: 14, padding: 12, gap: 6 };
            // The card account opens the FeMate card screen.
            return a.type === 'card' ? (
              <View key={a.id} style={{ flex: 1 }}>
                <PressableScale
                  onPress={() => router.push('/card')}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.name}, open FeMate card`}
                  style={[box, { flexGrow: 1 }]}
                >
                  {tile}
                </PressableScale>
              </View>
            ) : (
              <View key={a.id} style={[box, { flex: 1 }]}>
                {tile}
              </View>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="chart" size={20} color={c.accent} strokeWidth={2} />
            <Text variant="title2">This month</Text>
          </View>
          <PressableScale
            onPress={() => router.push('/reports')}
            accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 }}
          >
            <Text variant="callout" color="accent" weight="500">
              Reports
            </Text>
            <Icon name="chevronRight" size={14} color={c.accent} strokeWidth={2.4} />
          </PressableScale>
        </View>
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

      <Card padded={false} style={{ paddingVertical: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 20,
            paddingRight: 16,
            paddingTop: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={20} color={c.accent} strokeWidth={2} />
            <Text variant="title2">Recent</Text>
          </View>
          <PressableScale
            onPress={() => router.push('/transactions')}
            accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 }}
          >
            <Text variant="callout" color="accent" weight="500">
              See all
            </Text>
            <Icon name="chevronRight" size={14} color={c.accent} strokeWidth={2.4} />
          </PressableScale>
        </View>
        {txs.isError ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <ErrorRow message="Couldn’t load transactions." onRetry={() => void txs.refetch()} />
          </View>
        ) : null}
        {(txs.data?.items ?? []).slice(0, 6).map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 20 }}>
            <IconTile name={categoryIcon[t.category]} bg={c.fill} fg={c.label} size={40} iconSize={20} rounded={20} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="500" numberOfLines={1}>
                {t.description}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name={sourceIcon[t.source]} size={13} color={c.secondary} strokeWidth={2.2} />
                <Text variant="footnote" color="secondary">
                  {categoryLabel[t.category]} · {formatTime(t.occurredAt)} · {sourceLabel[t.source]}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text variant="body" weight="600" tabular>
                −{formatAmount(t.amount, cur)}
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
