import type { AuditEntry } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, ErrorRow, haptic, IconTile, PressableScale, ProgressBar, Text } from '@/components/ui';
import { formatAmount, formatTime } from '@/lib/format';
import { useActions, useAudit, useKillSwitch, usePermissions, useTransactions, useUpdatePermissions } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const levelName = { L0: 'Read-only', L1: 'Advisor', L2: 'Co-pilot', L3: 'Autopilot' } as const;
const levelIcon: Record<keyof typeof levelName, IconName> = { L0: 'eye', L1: 'bulb', L2: 'shieldCheck', L3: 'rocket' };
const actorIcon: Record<AuditEntry['actor'], IconName> = { agent: 'sparkleSmall', user: 'user', system: 'cpu' };
const scopeMeta = {
  read_balance: { label: 'Balances', icon: 'eye' },
  read_transactions: { label: 'Transactions', icon: 'list' },
  transfer_own: { label: 'Own transfers', icon: 'transfer' },
} as const;

export default function Activity() {
  const { c } = useTheme();
  const perms = usePermissions();
  const audit = useAudit();
  const pending = useActions('pending');
  const txs = useTransactions();
  const kill = useKillSwitch();
  const update = useUpdatePermissions();
  const [exported, setExported] = useState(false);

  const p = perms.data;
  const stopped = p ? !p.agentEnabled : false;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usedToday = (txs.data?.items ?? [])
    .filter((t) => t.source === 'agent' && Date.parse(t.occurredAt) >= startOfDay.getTime())
    .reduce((s, t) => s + t.amount, 0);

  const decisionStyle = {
    allowed: { bg: c.accentTint, fg: c.accent, icon: 'check' as IconName },
    blocked: { bg: c.dangerTint, fg: c.dangerInk, icon: 'x' as IconName },
    info: { bg: c.fill, fg: c.secondary, icon: 'info' as IconName },
  };

  const exportLog = async () => {
    const json = JSON.stringify(audit.data?.items ?? [], null, 2);
    try {
      await Share.share({ title: 'audit-log.json', message: json });
      setExported(true);
    } catch {
      setExported(false);
    }
  };

  return (
    <Screen
      tabs
      title="Agent"
      subtitle="What FeMate may do, and what it did"
      refreshing={audit.isRefetching}
      onRefresh={() => void Promise.all([audit.refetch(), perms.refetch(), pending.refetch()])}
    >
      {pending.data?.length ? (
        <Banner
          tone="warn"
          icon="shieldAlert"
          title={`${pending.data.length} action${pending.data.length > 1 ? 's' : ''} waiting for you`}
          subtitle="Tap to review"
          onPress={() => router.push({ pathname: '/action/[id]', params: { id: pending.data[0]!.id } })}
        />
      ) : null}

      <Card style={{ padding: 18, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile
            name={stopped ? 'pause' : levelIcon[p?.level ?? 'L2']}
            bg={stopped ? '#8E8E93' : c.accent}
            fg={stopped ? '#FFFFFF' : c.onAccent}
            size={48}
            iconSize={26}
            rounded={14}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline">
              {p?.level ?? '…'} · {p ? levelName[p.level] : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stopped ? c.dangerInk : c.accent }} />
              <Text variant="footnote" weight="600" color={stopped ? c.dangerInk : c.accent}>
                {stopped
                  ? 'Stopped by you'
                  : p?.level === 'L3'
                    ? 'Active · moves money within limits'
                    : p?.level === 'L2'
                      ? 'Active · asks before moving money'
                      : 'Active · advice only'}
              </Text>
            </View>
          </View>
          <PressableScale
            onPress={() => router.push({ pathname: '/connect-bank', params: { mode: 'edit' } })}
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text variant="callout" color="accent" weight="500">
              Change
            </Text>
          </PressableScale>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: 14, padding: 12, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="transfer" size={14} color={c.secondary} strokeWidth={2} />
              <Text variant="caption" color="secondary">
                Per action
              </Text>
            </View>
            <Text variant="headline" tabular>
              {formatAmount(p?.perActionLimit ?? 0)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: 14, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="gauge" size={14} color={c.secondary} strokeWidth={2} />
              <Text variant="caption" color="secondary" tabular>
                Today {formatAmount(usedToday)} / {formatAmount(p?.dailyLimit ?? 0)}
              </Text>
            </View>
            <ProgressBar value={p?.dailyLimit ? usedToday / p.dailyLimit : 0} color={c.accent} track={c.fill2} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(p?.scopes ?? []).map((s) => (
            <View
              key={s}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: c.fill,
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 8,
              }}
            >
              <Icon name={scopeMeta[s].icon} size={13} color={c.body} strokeWidth={2.2} />
              <Text variant="caption" color="body" weight="600">
                {scopeMeta[s].label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {stopped ? (
        <View accessibilityLiveRegion="polite" style={{ borderRadius: 18, backgroundColor: c.dangerTint, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="pause" size={22} color={c.dangerInk} strokeWidth={2.2} />
            <Text variant="headline" color="dangerInk" weight="700">
              Agent is stopped
            </Text>
          </View>
          <Text variant="callout" color="body">
            Pending transfers were rejected and every new action is blocked. When you turn it back on, it restarts at L1 Advisor.
          </Text>
          <Button
            title="Turn back on at L1"
            icon="refresh"
            variant="secondary"
            size="medium"
            style={{ backgroundColor: c.card }}
            loading={update.isPending}
            onPress={() => update.mutate({ level: 'L1' })}
          />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Button
            title="Stop the agent now"
            icon="power"
            variant="danger"
            loading={kill.isPending}
            onPress={() => {
              haptic('warning');
              kill.mutate();
            }}
            style={{ height: 60, borderRadius: 18 }}
          />
          <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            Kill switch: cancels pending actions and blocks every new one.
          </Text>
        </View>
      )}

      <Card padded={false} style={{ paddingVertical: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 18,
            paddingRight: 10,
            paddingVertical: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="file" size={20} color={c.accent} strokeWidth={2} />
            <Text variant="title2">Audit log</Text>
          </View>
          <PressableScale
            onPress={exportLog}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 6 }}
          >
            <Icon name="download" size={16} color={c.accent} strokeWidth={2.2} />
            <Text variant="callout" color="accent" weight="500">
              {exported ? 'Exported' : 'Export JSON'}
            </Text>
          </PressableScale>
        </View>
        {audit.isError ? (
          <View style={{ padding: 12 }}>
            <ErrorRow message="Couldn’t load the audit log." onRetry={() => void audit.refetch()} />
          </View>
        ) : null}
        {(audit.data?.items ?? []).map((e) => {
          const d = decisionStyle[e.decision];
          return (
            <View
              key={e.id}
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 18,
                borderTopWidth: 0.5,
                borderTopColor: c.separator,
              }}
            >
              <IconTile name={d.icon} bg={d.bg} fg={d.fg} size={28} iconSize={14} rounded={14} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
                  <Text
                    variant="footnote"
                    weight="600"
                    numberOfLines={1}
                    style={{ flex: 1, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}
                  >
                    {e.event}
                  </Text>
                  <Text variant="caption" color="secondary" tabular>
                    {formatTime(e.createdAt)}
                  </Text>
                </View>
                <Text variant="footnote" color="body" style={{ fontSize: 14 }}>
                  {e.reason}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text variant="caption" weight="700" color={d.fg}>
                    {e.decision}
                  </Text>
                  <Text variant="caption" color="secondary">
                    ·
                  </Text>
                  <Icon name={actorIcon[e.actor]} size={12} color={c.secondary} strokeWidth={2.2} />
                  <Text variant="caption" color="secondary">
                    {e.actor} · {e.permissionLevel}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
