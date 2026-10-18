import type { AuditEntry } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Share, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, ErrorRow, haptic, IconTile, PressableScale, ProgressBar, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount, formatTime } from '@/lib/format';
import { useActions, useAudit, useKillSwitch, usePermissions, useTransactions, useUpdatePermissions } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const levelName = { L0: 'Read-only', L1: 'Advisor', L2: 'Co-pilot', L3: 'Autopilot' } as const;
const levelIcon: Record<keyof typeof levelName, IconName> = { L0: 'eye', L1: 'bulb', L2: 'shieldCheck', L3: 'rocket' };
const actorIcon: Record<AuditEntry['actor'], IconName> = { agent: 'bot', user: 'user', system: 'cpu' };
const actorLabel: Record<AuditEntry['actor'], string> = { agent: 'Agent', user: 'You', system: 'System' };
const decisionLabel: Record<AuditEntry['decision'], string> = { allowed: 'Allowed', blocked: 'Blocked', info: 'Info' };

/** 00:00 today in Tashkent, where the server counts the agent's daily limit. */
function tashkentDayStart(now = Date.now()): number {
  const day = new Date(now + 5 * 3600_000).toISOString().slice(0, 10);
  return Date.parse(`${day}T00:00:00+05:00`);
}
const scopeMeta = {
  read_balance: { label: 'Balances', icon: 'eye' },
  read_transactions: { label: 'Transactions', icon: 'list' },
  transfer_own: { label: 'Own transfers', icon: 'transfer' },
} as const;

export default function Activity() {
  const cur = useCurrency();
  const { c } = useTheme();
  const perms = usePermissions();
  const audit = useAudit();
  const pending = useActions('pending');
  const txs = useTransactions();
  const kill = useKillSwitch();
  const update = useUpdatePermissions();
  const [exported, setExported] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const p = perms.data;
  const stopped = p ? !p.agentEnabled : false;
  // Money the agent moved to Savings today: what the daily limit counts.
  const dayStart = tashkentDayStart();
  const usedToday = (txs.data?.items ?? [])
    .filter((t) => t.source === 'agent' && t.category === 'transfer' && Date.parse(t.occurredAt) >= dayStart)
    .reduce((s, t) => s + t.amount, 0);
  const onError = (e: unknown) => {
    haptic('warning');
    setErr(errorMessage(e));
  };

  const decisionStyle = {
    allowed: { bg: c.accentTint, fg: c.accent, icon: 'check' as IconName },
    blocked: { bg: c.dangerTint, fg: c.dangerInk, icon: 'x' as IconName },
    info: { bg: c.fill, fg: c.secondary, icon: 'info' as IconName },
  };

  const exportLog = async () => {
    setErr(null);
    try {
      const json = JSON.stringify(await api.auditExport(), null, 2);
      if (Platform.OS === 'web') {
        // Browsers: download the file.
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'femate-audit-log.json';
        link.click();
        URL.revokeObjectURL(url);
        setExported(true);
        return;
      }
      const res = await Share.share({ title: 'audit-log.json', message: json });
      setExported(res.action === Share.sharedAction);
    } catch (e) {
      setExported(false);
      onError(e);
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
            name={stopped ? 'pause' : levelIcon[p?.level ?? 'L1']}
            bg={stopped ? c.fill2 : c.accent}
            fg={stopped ? c.secondary : c.onAccent}
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
            accessibilityLabel="Change permissions"
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
            <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(p?.perActionLimit ?? 0, cur)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: 14, padding: 12, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="gauge" size={14} color={c.secondary} strokeWidth={2} />
              <Text variant="caption" color="secondary">
                Today
              </Text>
            </View>
            <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(usedToday, cur)}
              <Text variant="footnote" color="secondary" tabular>
                {' / '}
                {formatAmount(p?.dailyLimit ?? 0, cur)}
              </Text>
            </Text>
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
            onPress={() => {
              setErr(null);
              update.mutate({ level: 'L1', agentEnabled: true }, { onError });
            }}
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
              setErr(null);
              kill.mutate(undefined, { onError });
            }}
            style={{ height: 60, borderRadius: 18 }}
          />
          <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            Kill switch: cancels pending actions and blocks every new one.
          </Text>
        </View>
      )}

      {err ? (
        <View
          accessibilityLiveRegion="assertive"
          style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.dangerTint, padding: 12, borderRadius: 14 }}
        >
          <Icon name="info" size={18} color={c.dangerInk} strokeWidth={2.2} />
          <Text variant="footnote" color="dangerInk" style={{ flex: 1 }}>
            {err}
          </Text>
        </View>
      ) : null}

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
        {audit.isLoading ? <ActivityIndicator color={c.accent} style={{ paddingVertical: 24 }} /> : null}
        {audit.data && audit.data.items.length === 0 ? (
          <Text variant="callout" color="secondary" style={{ paddingHorizontal: 18, paddingVertical: 12 }}>
            Nothing yet. Every agent decision and money move shows up here.
          </Text>
        ) : null}
        {(audit.data?.items ?? []).map((e) => {
          const d = decisionStyle[e.decision] ?? decisionStyle.info;
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
                    {decisionLabel[e.decision] ?? e.decision}
                  </Text>
                  <Text variant="caption" color="secondary">
                    ·
                  </Text>
                  <Icon name={actorIcon[e.actor] ?? 'info'} size={12} color={c.secondary} strokeWidth={2.2} />
                  <Text variant="caption" color="secondary">
                    {actorLabel[e.actor] ?? e.actor} · {e.permissionLevel}
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
