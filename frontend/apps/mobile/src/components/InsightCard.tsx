import type { Category, DailyInsight } from '@femate/shared';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Card, IconTile, PressableScale, Text } from '@/components/ui';
import { categoryIcon } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { formatMoney } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * The assistant's daily check-in: how today and the month compare with the plan, and what to do.
 * `compact` (Home) shows the headline and the first tip and opens the Assistant on tap.
 */
export function InsightCard({ insight, compact }: { insight: DailyInsight; compact?: boolean }) {
  const { c } = useTheme();
  const cur = useCurrency();
  const over = insight.status === 'over';
  const tint = over ? c.warnTint : c.accentTint;
  const ink = over ? c.warnInk : c.accentInk;
  const tips = compact ? insight.tips.slice(0, 1) : insight.tips;

  const body = (
    <Card style={{ gap: 14, padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            height: 26,
            borderRadius: 13,
            backgroundColor: tint,
          }}
        >
          <Icon name={over ? 'trend' : 'check'} size={14} color={ink} strokeWidth={2.4} />
          <Text variant="caption" weight="700" style={{ color: ink }}>
            {over ? 'Over plan' : 'On track'}
          </Text>
        </View>
        <Text variant="caption" color="secondary" weight="600">
          Today’s check-in
        </Text>
        <View style={{ flex: 1 }} />
        {compact ? <Icon name="chevronRight" size={16} color={c.chevron} strokeWidth={2.4} /> : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="headline">{insight.headline}</Text>
        {compact ? null : (
          <Text variant="callout" color="body">
            {insight.body}
          </Text>
        )}
      </View>

      {tips.length ? (
        <View style={{ gap: 10 }}>
          {tips.map((t) => (
            <View key={t.text} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <IconTile name={tipIcon(t.category)} bg={c.fill} fg={c.label} size={34} iconSize={18} rounded={10} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout">{t.text}</Text>
                {t.saving > 0 ? (
                  <Text variant="footnote" color="accent" weight="600" tabular>
                    Saves about {formatMoney(t.saving, cur)} this month
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );

  if (!compact) return body;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${insight.headline} Open the assistant`}
      onPress={() => router.push('/assistant')}
    >
      {body}
    </PressableScale>
  );
}

function tipIcon(category: Category | null): IconName {
  return category ? categoryIcon[category] : 'bulb';
}
