import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Button, Card, ErrorRow, haptic, IconTile, Segmented, Text } from '@/components/ui';
import { categoryIcon } from '@/lib/categories';
import { categoryLabel, formatAmount, shortAmount } from '@/lib/format';
import { useDailySummary, usePeriodSummary, useSimulate } from '@/lib/queries';
import { useTheme } from '@/theme';

type Period = 'week' | 'month';
const CHART_H = 156;
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function ranges(period: Period) {
  const now = new Date();
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function WhatIfRow({
  icon,
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
  onDone,
}: {
  icon: IconName;
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onDone: (v: number) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={18} color={c.secondary} strokeWidth={1.9} />
          <Text variant="callout">{label}</Text>
        </View>
        <Text variant="callout" weight="600" tabular>
          {display}
        </Text>
      </View>
      <Slider
        accessibilityLabel={label}
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        onSlidingStart={() => haptic('light')}
        onSlidingComplete={(v) => onDone(Math.round(v))}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.fill2}
        thumbTintColor="#FFFFFF"
        style={{ height: 36 }}
      />
    </View>
  );
}

export default function Reports() {
  const { c } = useTheme();
  const [period, setPeriod] = useState<Period>('week');
  const [selected, setSelected] = useState<number | null>(null);
  const [cur, setCur] = useState(20_000);
  const [alt, setAlt] = useState(4_000);
  const [days, setDays] = useState(15);
  const { from, to } = useMemo(() => ranges(period), [period]);
  const summary = usePeriodSummary(from, to);
  const daily = useDailySummary();
  const allowance = daily.data?.dailyAllowance ?? 93_548;

  const today = new Date();
  const bars = useMemo(() => {
    const today = new Date();
    const byDay = new Map((summary.data?.byDay ?? []).map((d) => [d.date, d.amount]));
    if (period === 'week') {
      return DAY.map((label, i) => {
        const d = new Date(from);
        d.setDate(from.getDate() + i);
        return { label, amount: byDay.get(key(d)) ?? 0, isToday: key(d) === key(today), future: d > today };
      });
    }
    const last = to.getDate();
    const weeks = [
      [1, 7],
      [8, 14],
      [15, 21],
      [22, last],
    ] as const;
    return weeks.map(([a, b], i) => {
      let amount = 0;
      for (let day = a; day <= b; day++) amount += byDay.get(key(new Date(from.getFullYear(), from.getMonth(), day))) ?? 0;
      const label = i === 0 ? `${from.toLocaleDateString('en-GB', { month: 'short' })} ${a}–${b}` : `${a}–${b}`;
      return { label, amount, isToday: today.getDate() >= a && today.getDate() <= b, future: today.getDate() < a };
    });
  }, [summary.data, period, from, to]);

  const limit = period === 'week' ? allowance : allowance * 7;
  const max = Math.max(limit * 1.25, ...bars.map((b) => b.amount));
  const total = bars.reduce((s, b) => s + b.amount, 0);
  const overCount = bars.filter((b) => b.amount > limit).length;
  const todayIdx = bars.findIndex((b) => b.isToday);
  const sel = selected ?? (todayIdx >= 0 ? todayIdx : 0);
  // Rules Engine owns the math (PLAN.md §9); the local value only fills in until the server answers.
  // Sliders update the local estimate live; the server (Rules Engine) is asked once the finger lifts.
  const [asked, setAsked] = useState({ cur: 20_000, alt: 4_000, days: 15 });
  const sim = useSimulate(asked.cur, asked.alt, asked.days);
  const settled = asked.cur === cur && asked.alt === alt && asked.days === days;
  const monthly = settled && sim.data ? sim.data.monthlySaving : Math.max(0, cur - alt) * days;
  const yearly = settled && sim.data ? sim.data.yearlySaving : monthly * 12;
  const top = summary.data?.byCategory.slice(0, 4) ?? [];

  return (
    <Screen tabs title="Reports" refreshing={summary.isRefetching} onRefresh={() => void summary.refetch()}>
      <Segmented<Period>
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setSelected(null);
        }}
        options={[
          { value: 'week', label: 'Week', icon: 'calendar' },
          { value: 'month', label: 'Month', icon: 'receipt' },
        ]}
      />

      <Card style={{ gap: 16 }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="chart" size={14} color={c.secondary} strokeWidth={2.2} />
            <Text variant="footnote" color="secondary" weight="500">
              {period === 'week' ? 'This week' : today.toLocaleDateString('en-GB', { month: 'long' }) + ' so far'}
            </Text>
          </View>
          <Text variant="title" tabular style={{ fontSize: 28 }}>
            {formatAmount(total)}{' '}
            <Text variant="callout" color="secondary" weight="600">
              UZS
            </Text>
          </Text>
          <Text variant="footnote" color="secondary">
            {overCount === 0
              ? `Under the ${period === 'week' ? 'daily' : 'weekly'} limit every ${period === 'week' ? 'day' : 'week'}`
              : `Over the ${period === 'week' ? 'daily' : 'weekly'} limit ${overCount} time${overCount > 1 ? 's' : ''}`}
          </Text>
        </View>

        <View>
          <View
            style={{
              height: CHART_H + 20,
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
              borderBottomWidth: 0.5,
              borderBottomColor: c.separator,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: (limit / max) * CHART_H,
                borderTopWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.accent,
                opacity: 0.7,
              }}
            />
            {bars.map((b, i) => {
              const on = i === sel;
              const color = b.amount === 0 ? c.fill2 : b.amount > limit ? c.warn : on ? c.accent : c.accentSoft;
              return (
                <Pressable
                  key={b.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.label}: ${b.amount ? `${formatAmount(b.amount)} UZS` : b.future ? 'not yet' : 'no spending'}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    haptic('light');
                    setSelected(i);
                  }}
                  style={{ flex: 1, height: CHART_H + 20, justifyContent: 'flex-end', alignItems: 'stretch', gap: 4 }}
                >
                  {on ? (
                    <Text variant="caption" weight="700" tabular style={{ textAlign: 'center', fontSize: 11 }}>
                      {b.amount ? shortAmount(b.amount) : '—'}
                    </Text>
                  ) : null}
                  <View
                    style={{
                      height: Math.max(b.amount ? 4 : 2, (b.amount / max) * CHART_H),
                      borderTopLeftRadius: 6,
                      borderTopRightRadius: 6,
                      borderBottomLeftRadius: 2,
                      borderBottomRightRadius: 2,
                      backgroundColor: color,
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 6 }}>
            {bars.map((b, i) => (
              <Text
                key={b.label}
                variant="caption"
                color={i === sel ? 'label' : 'secondary'}
                weight={i === sel ? '700' : '500'}
                style={{ flex: 1, textAlign: 'center' }}
                numberOfLines={1}
              >
                {b.label}
              </Text>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: c.accent }} />
            <Text variant="caption" color="secondary" tabular>
              {period === 'week' ? 'Daily' : 'Weekly'} limit {formatAmount(limit)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.warn }} />
            <Text variant="caption" color="secondary">
              Over limit
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="hand" size={12} color={c.secondary} strokeWidth={2.2} />
            <Text variant="caption" color="secondary">
              Tap a bar
            </Text>
          </View>
        </View>
      </Card>

      {summary.isError ? <ErrorRow message="Couldn’t load your spending." onRetry={() => void summary.refetch()} /> : null}

      {top.length ? (
        <Card style={{ gap: 12 }}>
          <Text variant="title2">Top categories</Text>
          {top.map((t) => (
            <View key={t.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name={categoryIcon[t.category]} bg={c.fill} fg={c.label} size={34} iconSize={18} />
              <Text variant="callout" weight="500" style={{ flex: 1 }}>
                {categoryLabel[t.category]}
              </Text>
              <Text variant="callout" color="secondary" tabular>
                {formatAmount(t.amount)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile name="tune" bg={c.accentTint} fg={c.accent} size={40} iconSize={22} rounded={12} />
          <View style={{ gap: 2 }}>
            <Text variant="title2">What if…</Text>
            <Text variant="footnote" color="secondary" style={{ fontSize: 14 }}>
              Swap a habit and see what it’s worth
            </Text>
          </View>
        </View>
        <WhatIfRow
          icon="transport"
          label="Taxi per day"
          display={`${formatAmount(cur)} UZS`}
          value={cur}
          min={5_000}
          max={60_000}
          step={1_000}
          onChange={setCur}
          onDone={(v) => setAsked((a) => ({ ...a, cur: v }))}
        />
        <WhatIfRow
          icon="bus"
          label="Bus instead, per day"
          display={`${formatAmount(alt)} UZS`}
          value={alt}
          min={0}
          max={20_000}
          step={1_000}
          onChange={setAlt}
          onDone={(v) => setAsked((a) => ({ ...a, alt: v }))}
        />
        <WhatIfRow
          icon="calendar"
          label="Days per month"
          display={String(days)}
          value={days}
          min={1}
          max={30}
          step={1}
          onChange={setDays}
          onDone={(v) => setAsked((a) => ({ ...a, days: v }))}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: c.accentTint, borderRadius: 16, padding: 14, gap: 2 }}>
            <Text variant="caption" color="accentInk" weight="600">
              Per month
            </Text>
            <Text variant="title2" color="accentInk" tabular style={{ fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(monthly)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: 16, padding: 14, gap: 2 }}>
            <Text variant="caption" color="secondary" weight="600">
              Per year
            </Text>
            <Text variant="title2" tabular style={{ fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(yearly)}
            </Text>
          </View>
        </View>
        <Button
          title="Make this a plan"
          icon="sparkleSmall"
          size="medium"
          onPress={() => router.push('/assistant')}
          style={{ borderRadius: 14, height: 48 }}
        />
      </Card>
    </Screen>
  );
}
