import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { LogoMark } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { Button, Chip, haptic, IconTile, ListRow, PressableScale, SectionLabel, Text } from '@/components/ui';
import { api, usingMock } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import { disableNotifications, enableNotifications, scheduleDailyReport } from '@/lib/notifications';
import { queryClient, useDailySummary, useMe, usePermissions, useUpdateMe } from '@/lib/queries';
import { useSession } from '@/store/session';
import { useSettings, type Appearance } from '@/store/settings';
import { useTheme } from '@/theme';

const REPORT_TIMES = ['18:00', '19:00', '20:00', '20:30', '21:00', '21:30', '22:00', '23:00'];

const MODES: { id: Appearance; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

export default function Settings() {
  const { c, dark } = useTheme();
  const me = useMe();
  const daily = useDailySummary();
  const perms = usePermissions();
  const { appearance, setAppearance, pushEnabled, setPushEnabled } = useSettings();
  const signOut = useSession((s) => s.signOut);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const updateMe = useUpdateMe();
  const insets = useSafeAreaInsets();
  const [pickTime, setPickTime] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const u = me.data;
  const reportTime = u?.reportTime ?? '21:00';

  const togglePush = async (on: boolean) => {
    haptic('light');
    setNotice(null);
    if (!on) {
      await disableNotifications();
      setPushEnabled(false);
      return;
    }
    const res = await enableNotifications(reportTime);
    if (!res.ok) {
      setNotice(res.reason);
      setPushEnabled(false);
      return;
    }
    setPushEnabled(true);
    setNotice(
      res.pushToken
        ? `You’ll get a reminder at ${reportTime} and alerts from the agent.`
        : `You’ll get a reminder at ${reportTime}. Agent alerts need the installed app (not Expo Go).`,
    );
  };

  const chooseTime = async (t: string) => {
    haptic('light');
    setPickTime(false);
    await updateMe.mutateAsync({ reportTime: t });
    if (pushEnabled) await scheduleDailyReport(t);
  };

  const getCode = async () => {
    setCodeBusy(true);
    try {
      setCode(await api.telegramLinkCode());
      haptic('success');
    } finally {
      setCodeBusy(false);
    }
  };

  const group = { backgroundColor: c.card, borderRadius: 18, overflow: 'hidden' as const };

  return (
    <Screen
      title="Settings"
      header={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', height: 44, alignSelf: 'flex-start', marginBottom: -8 }}
        >
          <Icon name="chevronLeft" size={22} color={c.accent} strokeWidth={2.4} />
          <Text variant="body" color="accent" style={{ fontSize: 17 }}>
            Today
          </Text>
        </Pressable>
      }
    >
      <View style={{ ...group, padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#0E7A4B', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="title2" color="#FFFFFF" weight="600" style={{ fontSize: 22 }}>
            {(u?.name ?? 'A').charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" style={{ fontSize: 19 }}>
            {u?.name ?? '…'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="mail" size={14} color={c.secondary} strokeWidth={2} />
            <Text variant="footnote" color="secondary" style={{ fontSize: 14 }}>
              {u?.email}
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: c.accentTint,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
          }}
        >
          <Icon name="shield" size={12} color={c.accentInk} strokeWidth={2.4} />
          <Text variant="caption" color="accentInk" weight="700">
            {perms.data?.level ?? 'L2'}
          </Text>
        </View>
      </View>

      <View>
        <SectionLabel>Appearance</SectionLabel>
        <View style={{ ...group, padding: 12, flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
          {MODES.map((m) => {
            const on = appearance === m.id;
            return (
              <PressableScale
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setAppearance(m.id)}
                style={{
                  flex: 1,
                  borderWidth: 2,
                  borderColor: on ? c.accent : 'transparent',
                  borderRadius: 14,
                  paddingTop: 10,
                  paddingBottom: 8,
                  backgroundColor: c.fill,
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name={m.icon} size={24} color={c.label} />
                <Text variant="footnote" weight="600">
                  {m.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View>
        <SectionLabel>Budget</SectionLabel>
        <View style={group}>
          <ListRow
            icon="wallet"
            tile="#0E7A4B"
            title="Monthly income"
            value={formatAmount(u?.monthlyIncome ?? 0)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="home"
            tile="#FF9500"
            title="Fixed costs"
            value={formatAmount(u?.fixedCostsMonthly ?? 0)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="target"
            tile="#007AFF"
            title="Savings goal"
            value={formatAmount(u?.savingsGoalMonthly ?? 0)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="gauge"
            tile="#30B0C7"
            title="Daily allowance"
            value={formatAmount(daily.data?.dailyAllowance ?? 0)}
            valueColor={c.accent}
            last
          />
        </View>
      </View>

      <View>
        <SectionLabel>Notifications</SectionLabel>
        <View style={group}>
          <ListRow icon="clock" tile="#5856D6" title="Daily report" value={reportTime} onPress={() => setPickTime(true)} />
          <ListRow
            icon="bell"
            tile="#E5484D"
            title="Notifications"
            last
            right={
              <Switch
                value={pushEnabled}
                onValueChange={togglePush}
                trackColor={{ true: '#34C759', false: c.fill2 }}
                accessibilityLabel="Notifications"
              />
            }
          />
        </View>
        {notice ? (
          <Text variant="footnote" color="secondary" style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            {notice}
          </Text>
        ) : null}
      </View>

      <Modal
        visible={pickTime}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setPickTime(false)}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={() => setPickTime(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: c.sheet,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 20,
              paddingBottom: insets.bottom + 24,
              gap: 16,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.fill2 }} />
            <Text variant="title2">Daily report time</Text>
            <Text variant="footnote" color="secondary">
              FeMate sends your report to Telegram and as a notification at this time.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REPORT_TIMES.map((t) => (
                <Chip key={t} label={t} icon="clock" selected={t === reportTime} onPress={() => void chooseTime(t)} />
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View>
        <SectionLabel>Telegram bot</SectionLabel>
        <View style={{ ...group, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <IconTile name="send" bg="#2AABEE" fg="#FFFFFF" size={30} iconSize={18} rounded={8} />
            <Text variant="callout" color="body" style={{ flex: 1 }}>
              Add expenses, forward bank SMS and get your daily report in Telegram. The bot can read and add, but it can never move money.
            </Text>
          </View>
          {code ? (
            <View style={{ alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.fill }}>
              <Text selectable variant="largeTitle" tabular style={{ letterSpacing: 4, fontSize: 34 }}>
                {code.code}
              </Text>
              <Text variant="footnote" color="body" style={{ textAlign: 'center', fontSize: 14 }} selectable>
                Send /start {code.code} to the FeMate bot.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="clock" size={12} color={c.secondary} strokeWidth={2.2} />
                <Text variant="caption" color="secondary">
                  Expires in 10 min
                </Text>
              </View>
            </View>
          ) : (
            <Button
              title="Get a link code"
              icon="link"
              variant="tinted"
              size="medium"
              onPress={getCode}
              loading={codeBusy}
              style={{ borderRadius: 14, height: 48 }}
            />
          )}
        </View>
      </View>

      <View style={group}>
        <ListRow
          icon="shieldCheck"
          tile="#0E7A4B"
          title="Agent permissions"
          value={perms.data?.agentEnabled === false ? 'Stopped' : perms.data?.level}
          onPress={() => router.push('/activity')}
        />
        <ListRow
          icon="logout"
          tile={c.danger}
          title="Sign out"
          destructive
          last
          onPress={async () => {
            await signOut();
            queryClient.clear();
            router.replace('/login');
          }}
        />
      </View>

      <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <LogoMark size={28} dark={dark} />
        <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
          FeMate 0.1 · {usingMock ? 'demo data (no server)' : 'connected to server'}
        </Text>
      </View>
    </Screen>
  );
}
