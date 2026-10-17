import { levelLimits, type PermissionLevel, type Scope } from '@femate/shared';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { LogoMark } from '@/components/Logo';
import { Button, haptic, IconTile, PressableScale, SectionLabel, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount } from '@/lib/format';
import { queryClient, usePermissions } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const SCOPES: { key: Scope; title: string; desc: string; icon: IconName }[] = [
  { key: 'read_balance', title: 'Read balances', desc: 'Card, savings and cash totals', icon: 'eye' },
  { key: 'read_transactions', title: 'Read transactions', desc: 'Amounts, merchants and dates for the last 90 days', icon: 'list' },
  { key: 'transfer_own', title: 'Move money between my accounts', desc: 'Card → Savings only. Never to other people.', icon: 'transfer' },
];

const LEVELS: { id: PermissionLevel; name: string; desc: string; icon: IconName; recommended?: boolean }[] = [
  { id: 'L0', name: 'Read-only', desc: 'Sees your spending. Never suggests or acts.', icon: 'eye' },
  { id: 'L1', name: 'Advisor', desc: 'Reads and gives recommendations. You do everything yourself.', icon: 'bulb' },
  { id: 'L2', name: 'Co-pilot', desc: 'Proposes transfers. Nothing moves until you tap Approve.', icon: 'shieldCheck', recommended: true },
  { id: 'L3', name: 'Autopilot', desc: 'Moves money inside strict limits, then tells you.', icon: 'rocket' },
];

export default function ConnectBank() {
  const cur = useCurrency();
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const editing = useLocalSearchParams<{ mode?: string }>().mode === 'edit';
  const perms = usePermissions();
  const [scopes, setScopes] = useState<Scope[]>(['read_balance', 'read_transactions', 'transfer_own']);
  const [level, setLevel] = useState<PermissionLevel>('L2');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = LEVELS.find((l) => l.id === level)?.name;

  // Editing from the Agent tab starts from the current grant (adjusting state during render, once).
  if (editing && perms.data && !loaded) {
    setLoaded(true);
    setScopes(perms.data.scopes);
    setLevel(perms.data.level);
  }

  const allow = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) await api.updatePermissions({ scopes, level });
      else await api.connectBank({ scopes, level });
      await queryClient.invalidateQueries();
      haptic('success');
      if (editing) router.back();
      else router.replace('/balances');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 4,
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + 120,
          gap: space.xl,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', height: 44, alignSelf: 'flex-start' }}
        >
          <Icon name="chevronLeft" size={22} color={c.accent} strokeWidth={2.4} />
          <Text variant="body" color="accent" style={{ fontSize: 17 }}>
            Back
          </Text>
        </Pressable>

        <View style={{ alignItems: 'center', gap: 14, paddingHorizontal: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LogoMark size={52} dark={dark} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.secondary }} />
              <Icon name="lock" size={20} color={c.secondary} strokeWidth={2} />
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.secondary }} />
            </View>
            <IconTile name="bank" bg={dark ? '#3A3A3C' : '#1C1C1E'} fg="#FFFFFF" size={52} iconSize={26} rounded={15} />
          </View>
          <Text variant="title" style={{ textAlign: 'center' }} accessibilityRole="header">
            {editing ? 'Agent permissions' : 'Connect Sandbox Bank'}
          </Text>
          <Text variant="callout" color="secondary" style={{ textAlign: 'center' }}>
            {editing
              ? 'Limits can only go down from the system maximum. Changes apply to the next action.'
              : 'Choose exactly what FeMate may see and do. You can change this or stop the agent at any time.'}
          </Text>
        </View>

        <View>
          <SectionLabel>Data access</SectionLabel>
          <View style={{ backgroundColor: c.card, borderRadius: 18, overflow: 'hidden' }}>
            {SCOPES.map((s, i) => {
              const on = scopes.includes(s.key);
              return (
                <Pressable
                  key={s.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    haptic('light');
                    setScopes((xs) => (on ? xs.filter((x) => x !== s.key) : [...xs, s.key]));
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    backgroundColor: pressed ? c.fill : 'transparent',
                    borderBottomWidth: i < SCOPES.length - 1 ? 0.5 : 0,
                    borderBottomColor: c.separator,
                  })}
                >
                  <IconTile name={s.icon} bg={on ? c.accentTint : c.fill} fg={on ? c.accent : c.secondary} size={36} iconSize={20} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="600">
                      {s.title}
                    </Text>
                    <Text variant="footnote" color="secondary">
                      {s.desc}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: on ? c.accent : 'transparent',
                      borderWidth: on ? 0 : 2,
                      borderColor: dark ? '#636366' : '#C7C7CC',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {on ? <Icon name="check" size={14} color={c.onAccent} strokeWidth={3.2} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View accessibilityRole="radiogroup">
          <SectionLabel>Agent permission level</SectionLabel>
          <View style={{ gap: 8 }}>
            {LEVELS.map((l) => {
              const on = l.id === level;
              const lim = levelLimits(l.id, cur);
              return (
                <PressableScale
                  key={l.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setLevel(l.id)}
                  scaleTo={0.98}
                  style={{
                    flexDirection: 'row',
                    gap: 14,
                    padding: 14,
                    paddingHorizontal: 16,
                    borderRadius: 18,
                    borderWidth: 2,
                    borderColor: on ? c.accent : 'transparent',
                    backgroundColor: c.card,
                  }}
                >
                  <IconTile name={l.icon} bg={on ? c.accent : c.fill} fg={on ? c.onAccent : c.label} size={40} iconSize={22} rounded={12} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: c.fill, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text variant="caption" color="secondary" weight="700">
                          {l.id}
                        </Text>
                      </View>
                      <Text variant="body" weight="600">
                        {l.name}
                      </Text>
                      {l.recommended ? (
                        <View style={{ backgroundColor: c.accentTint, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text variant="caption" color="accentInk" weight="700" style={{ fontSize: 11, letterSpacing: 0.3 }}>
                            RECOMMENDED
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="footnote" color="secondary">
                      {l.desc}
                    </Text>
                    {lim ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 }}>
                        <Icon name="gauge" size={13} color={c.label} strokeWidth={2.2} />
                        <Text variant="caption" weight="600" tabular>
                          {formatAmount(lim.perAction, cur)} per action · {formatAmount(lim.daily, cur)} per day
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 8 }}>
          <Icon name="shieldCheck" size={20} color={c.accent} />
          <Text variant="footnote" color="secondary" style={{ flex: 1 }}>
            Money can only move between your own card and savings account. Every action, allowed or blocked, goes into the audit log.
          </Text>
        </View>
        {error ? (
          <Text variant="footnote" color="danger">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <BlurView
        intensity={60}
        tint={dark ? 'dark' : 'light'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 14,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 14,
          borderTopWidth: 0.5,
          borderTopColor: c.materialEdge,
          backgroundColor: c.material,
        }}
      >
        <Button
          title={editing ? `Save · ${level} ${name}` : `Allow access · ${level} ${name}`}
          icon="shieldCheck"
          onPress={allow}
          loading={busy}
          disabled={scopes.length === 0}
        />
      </BlurView>
    </View>
  );
}
