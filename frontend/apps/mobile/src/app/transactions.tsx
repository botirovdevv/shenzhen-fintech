import type { Category, Transaction } from '@femate/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Card, Chip, ErrorRow, IconTile, Text } from '@/components/ui';
import { categoryIcon, sourceIcon, sourceLabel } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { categoryLabel, formatAmount, formatMoney } from '@/lib/format';
import { useAllTransactions } from '@/lib/queries';
import { useTheme } from '@/theme';

function dayTitle(d: Date, now = new Date()) {
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Transactions() {
  const cur = useCurrency();
  const { c } = useTheme();
  const txs = useAllTransactions();
  const [filter, setFilter] = useState<Category | 'all'>('all');

  const cats = useMemo(() => [...new Set((txs.data?.items ?? []).map((t) => t.category))], [txs.data]);
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; total: number; items: Transaction[] }>();
    for (const t of txs.data?.items ?? []) {
      if (filter !== 'all' && t.category !== filter) continue;
      const d = new Date(t.occurredAt);
      const k = d.toDateString();
      const g = map.get(k) ?? { title: dayTitle(d), total: 0, items: [] };
      g.items.push(t);
      if (t.direction === 'out' && t.category !== 'transfer') g.total += t.amount;
      map.set(k, g);
    }
    return [...map.values()];
  }, [txs.data, filter]);

  return (
    <Screen
      title="Transactions"
      refreshing={txs.isRefetching}
      onRefresh={() => void txs.refetch()}
      header={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{ flexDirection: 'row', alignItems: 'center', height: 44, alignSelf: 'flex-start', marginBottom: -8 }}
        >
          <Icon name="chevronLeft" size={22} color={c.accent} strokeWidth={2.4} />
          <Text variant="body" color="accent" style={{ fontSize: 17 }}>
            Back
          </Text>
        </Pressable>
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
        <View style={{ width: 8 }} />
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {cats.map((cat) => (
          <Chip key={cat} label={categoryLabel[cat]} icon={categoryIcon[cat]} selected={filter === cat} onPress={() => setFilter(cat)} />
        ))}
        <View style={{ width: 8 }} />
      </ScrollView>

      {txs.isLoading ? <ActivityIndicator color={c.accent} style={{ paddingVertical: 24 }} /> : null}
      {txs.isError ? <ErrorRow message="Couldn’t load your transactions." onRetry={() => void txs.refetch()} /> : null}
      {!txs.isLoading && groups.length === 0 && !txs.isError ? (
        <Text variant="callout" color="secondary" style={{ textAlign: 'center', paddingVertical: 24 }}>
          Nothing here yet.
        </Text>
      ) : null}

      {groups.map((g) => (
        <View key={g.title} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <Text variant="footnote" color="secondary" weight="600">
              {g.title}
            </Text>
            {g.total > 0 ? (
              <Text variant="footnote" color="secondary" tabular>
                −{formatAmount(g.total, cur)}
              </Text>
            ) : null}
          </View>
          <Card padded={false} style={{ paddingVertical: 4 }}>
            {g.items.map((t, i) => (
              <View
                key={t.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderTopWidth: i === 0 ? 0 : 0.5,
                  borderTopColor: c.separator,
                }}
              >
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
                    <Text variant="footnote" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {categoryLabel[t.category]} · {hm(t.occurredAt)} · {sourceLabel[t.source]}
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
        </View>
      ))}
      {txs.data?.nextCursor ? (
        <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
          Showing your latest {txs.data.items.length}. Older ones are in Reports.
        </Text>
      ) : null}
    </Screen>
  );
}
