import { fromUzs, type AgentAction } from '@femate/shared';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { InsightCard } from '@/components/InsightCard';
import { Button, Card, haptic, IconTile, PressableScale, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useCurrency } from '@/lib/currency';
import { formatAmount, formatMoney } from '@/lib/format';
import { useActions, useApplyRecommendation, useChat, useInsight, usePermissions, useRecommendations } from '@/lib/queries';
import { space, useTheme } from '@/theme';

interface Msg {
  id: string;
  who: 'user' | 'agent';
  text: string;
  action?: AgentAction;
}

const TAB_BAR = 49;
// The big transfer is over every level's per-action limit, so it shows Policy Guard refusing it.
const suggestions = (bigTransfer: string): { label: string; icon: IconName }[] => [
  { label: 'How am I doing this month?', icon: 'target' },
  { label: 'How much is left today?', icon: 'gauge' },
  { label: 'Move today’s savings', icon: 'savings' },
  { label: `Move ${bigTransfer} to savings`, icon: 'transfer' },
  { label: 'Where does my money go?', icon: 'chart' },
];
const levelName = { L0: 'Read-only', L1: 'Advisor', L2: 'Co-pilot', L3: 'Autopilot' } as const;
const recIcon: Record<string, IconName> = { rec_bus: 'bus', rec_food: 'food' };

export default function Assistant() {
  const cur = useCurrency();
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const recs = useRecommendations();
  const insight = useInsight();
  const apply = useApplyRecommendation();
  const chat = useChat();
  const perms = usePermissions();
  const pending = useActions('pending');
  const [hidden, setHidden] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const kb = useKeyboardHeight();
  const scroll = useRef<ScrollView>(null);

  // Start the conversation with the action the agent is already waiting on.
  const level = perms.data?.level;
  useEffect(() => {
    const first = pending.data?.find((a) => a.type === 'transfer_to_savings');
    if (msgs.length === 0 && first && level) {
      setMsgs([
        {
          id: 'm0',
          who: 'agent',
          text: `I’d like to move ${formatMoney(first.amount ?? 0, cur)} to Savings. You’re on ${level} ${levelName[level]}, so it waits for your approval.`,
          action: first,
        },
      ]);
    }
  }, [pending.data, msgs.length, cur, level]);
  const pendingIds = new Set((pending.data ?? []).map((a) => a.id));
  const [applyError, setApplyError] = useState<string | null>(null);

  // Another screen can open the chat with a question (Reports → "Make this a plan").
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  useEffect(() => {
    if (!ask) return;
    router.setParams({ ask: undefined });
    void send(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  // Keep the newest message in view when the keyboard opens.
  useEffect(() => {
    if (kb > 0) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  }, [kb]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || chat.isPending) return;
    setDraft('');
    const userMsg: Msg = { id: `u${Date.now()}`, who: 'user', text: q };
    setMsgs((m) => [...m, userMsg]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await chat.mutateAsync(q);
      if (res.actions.some((a) => a.status === 'blocked')) haptic('warning');
      setMsgs((m) => [...m, { id: `a${Date.now()}`, who: 'agent', text: res.reply, action: res.actions[0] }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: `e${Date.now()}`, who: 'agent', text: errorMessage(e) }]);
    }
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const composerBottom = kb > 0 ? kb : insets.bottom + TAB_BAR;
  const visibleRecs = (recs.data ?? []).filter((r) => !hidden.includes(r.id));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          paddingTop: insets.top + space.md,
          paddingHorizontal: space.lg,
          paddingBottom: composerBottom + 130,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
          <IconTile name="bot" bg={c.accent} fg={c.onAccent} size={44} iconSize={24} rounded={14} />
          <View style={{ gap: 2 }}>
            <Text variant="title" accessibilityRole="header">
              Assistant
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="calendar" size={13} color={c.secondary} strokeWidth={2.2} />
              <Text variant="footnote" color="secondary">
                Based on your last 14 days · {perms.data?.agentEnabled === false ? 'agent stopped' : (perms.data?.level ?? '…')}
              </Text>
            </View>
          </View>
        </View>

        {insight.data ? <InsightCard insight={insight.data} /> : null}

        {visibleRecs.map((r) => (
          <Card key={r.id} style={{ padding: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name={recIcon[r.id] ?? 'bulb'} bg={c.accentTint} fg={c.accent} size={44} iconSize={24} rounded={13} />
              <View style={{ flex: 1, gap: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="trend" size={13} color={c.accent} strokeWidth={2.4} />
                  <Text variant="footnote" color="accent" weight="600" tabular>
                    Save {formatMoney(r.monthlySaving, cur)} / month
                  </Text>
                </View>
                <Text variant="headline">{r.title}</Text>
              </View>
            </View>
            <Text variant="callout" color="body">
              {r.body}
            </Text>
            {r.status === 'applied' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  height: 40,
                  paddingHorizontal: 16,
                  borderRadius: 20,
                  backgroundColor: c.accentTint,
                }}
              >
                <Icon name="check" size={16} color={c.accentInk} strokeWidth={2.6} />
                <Text variant="callout" color="accentInk" weight="600">
                  {r.actionType ? 'Sent for your approval' : 'Reminder set'}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="Apply"
                  icon="check"
                  size="medium"
                  loading={apply.isPending && apply.variables === r.id}
                  disabled={apply.isPending}
                  onPress={async () => {
                    setApplyError(null);
                    try {
                      const res = await apply.mutateAsync(r.id);
                      haptic('success');
                      if (res.action?.status === 'pending') router.push({ pathname: '/action/[id]', params: { id: res.action.id } });
                      else if (res.action?.status === 'blocked') setApplyError(res.action.reason);
                    } catch (e) {
                      haptic('warning');
                      setApplyError(errorMessage(e));
                    }
                  }}
                />
                <Button title="Not now" icon="clock" size="medium" variant="secondary" onPress={() => setHidden((h) => [...h, r.id])} />
              </View>
            )}
          </Card>
        ))}

        {applyError ? (
          <View
            accessibilityLiveRegion="assertive"
            style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.dangerTint, padding: 12, borderRadius: 14 }}
          >
            <Icon name="info" size={18} color={c.dangerInk} strokeWidth={2.2} />
            <Text variant="footnote" color="dangerInk" style={{ flex: 1 }}>
              {applyError}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingHorizontal: 4 }}>
          <View style={{ flex: 1, height: 0.5, backgroundColor: c.separator }} />
          <Text variant="caption" color="secondary" weight="600">
            Chat
          </Text>
          <View style={{ flex: 1, height: 0.5, backgroundColor: c.separator }} />
        </View>

        {msgs.map((m) => {
          const me = m.who === 'user';
          // A pending action decided since (here, in Agent or in Telegram) drops its Review card.
          const a = m.action?.status === 'pending' && !pendingIds.has(m.action.id) ? undefined : m.action;
          return (
            <View
              key={m.id}
              style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', justifyContent: me ? 'flex-end' : 'flex-start' }}
            >
              {!me ? <IconTile name="bot" bg={c.accent} fg={c.onAccent} size={28} iconSize={15} rounded={14} /> : null}
              <View style={{ maxWidth: '80%', gap: 6, alignItems: me ? 'flex-end' : 'flex-start' }}>
                <View
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 20,
                    backgroundColor: me ? (dark ? '#2A9E62' : c.accent) : c.card,
                  }}
                >
                  <Text variant="body" color={me ? c.onAccent : c.label} selectable>
                    {m.text}
                  </Text>
                </View>
                {a && a.status === 'pending' ? (
                  <PressableScale
                    onPress={() => router.push({ pathname: '/action/[id]', params: { id: a.id } })}
                    accessibilityRole="button"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      paddingHorizontal: 14,
                      borderRadius: 18,
                      backgroundColor: c.warnTint,
                    }}
                  >
                    <Icon name="transfer" size={20} color={c.warnInk} strokeWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Text variant="callout" weight="600" tabular numberOfLines={1} adjustsFontSizeToFit>
                        Card → Savings · {formatAmount(a.amount ?? 0, cur)}
                      </Text>
                      <Text variant="footnote" color="warnInk">
                        Pending your approval
                      </Text>
                    </View>
                    <Text variant="callout" color="warnInk" weight="600">
                      Review
                    </Text>
                  </PressableScale>
                ) : null}
                {a && a.status === 'blocked' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      backgroundColor: c.dangerTint,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 8,
                    }}
                  >
                    <Icon name="ban" size={12} color={c.dangerInk} strokeWidth={2.6} />
                    <Text variant="caption" color="dangerInk" weight="600">
                      Blocked by policy · {a.reason.split(':')[0]}
                    </Text>
                  </View>
                ) : null}
                {a && a.status === 'executed' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      backgroundColor: c.accentTint,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 8,
                    }}
                  >
                    <Icon name="check" size={12} color={c.accentInk} strokeWidth={2.6} />
                    <Text variant="caption" color="accentInk" weight="600">
                      Done automatically
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
        {chat.isPending ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <IconTile name="bot" bg={c.accent} fg={c.onAccent} size={28} iconSize={15} rounded={14} />
            <Text variant="footnote" color="secondary">
              Thinking…
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <BlurView
        intensity={60}
        tint={dark ? 'dark' : 'light'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: composerBottom,
          paddingTop: 8,
          paddingBottom: 10,
          gap: 8,
          backgroundColor: c.material,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
        >
          {suggestions(cur === 'UZS' ? '500 000' : formatMoney(fromUzs(500_000, cur), cur)).map((s) => (
            <PressableScale
              key={s.label}
              onPress={() => send(s.label)}
              accessibilityRole="button"
              style={{
                height: 36,
                paddingHorizontal: 12,
                borderRadius: 18,
                backgroundColor: c.card,
                borderWidth: 0.5,
                borderColor: c.separator,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name={s.icon} size={15} color={c.accent} strokeWidth={2} />
              <Text variant="footnote" weight="500" style={{ fontSize: 14 }}>
                {s.label}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel="Message FeMate"
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about your money…"
            placeholderTextColor={c.secondary}
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
            style={{
              flex: 1,
              height: 44,
              paddingHorizontal: 16,
              borderRadius: 22,
              borderWidth: 0.5,
              borderColor: c.separator,
              backgroundColor: c.card,
              color: c.label,
              fontSize: 16,
            }}
          />
          <PressableScale
            onPress={() => send(draft)}
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!draft.trim()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: draft.trim() ? c.accent : c.fill2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="arrowUp" size={20} color={draft.trim() ? c.onAccent : c.secondary} strokeWidth={2.4} />
          </PressableScale>
        </View>
      </BlurView>
    </View>
  );
}
