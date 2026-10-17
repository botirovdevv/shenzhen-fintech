import { CURRENCIES, CURRENCY_INFO, VOICE_LANGUAGES, type Currency, type VoiceLanguage } from '@femate/shared';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { LogoMark } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { Button, Chip, haptic, IconTile, ListRow, PressableScale, SectionLabel, Text } from '@/components/ui';
import { api, usingMock } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount } from '@/lib/format';
import { disableNotifications, enableNotifications, scheduleDailyReport } from '@/lib/notifications';
import { queryClient, useDailySummary, useMe, usePermissions, useUpdateMe } from '@/lib/queries';
import { useSession } from '@/store/session';
import { useSettings, type Appearance } from '@/store/settings';
import { useTheme } from '@/theme';

const BOT_URL = 'https://t.me/femate_uz_bot';

const REPORT_TIMES = ['18:00', '19:00', '20:00', '20:30', '21:00', '21:30', '22:00', '23:00'];

const VOICE_LABEL: Record<VoiceLanguage, string> = { auto: 'Auto-detect', uz: 'O‘zbekcha', ru: 'Русский', en: 'English' };

/** "1 USD = 12 100 UZS" at the fixed sandbox rates. */
const rate = (x: Currency) => `1 ${x} = ${formatAmount(CURRENCY_INFO[x].uzsRate, 'UZS')} UZS`;

const MODES: { id: Appearance; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

export default function Settings() {
  const cur = useCurrency();
  const { c, dark } = useTheme();
  const me = useMe();
  const daily = useDailySummary();
  const perms = usePermissions();
  const { appearance, setAppearance, pushEnabled, setPushEnabled } = useSettings();
  const signOut = useSession((s) => s.signOut);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const updateMe = useUpdateMe();
  const [picker, setPicker] = useState<'time' | 'currency' | 'voice' | null>(null);
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
    setPicker(null);
    await updateMe.mutateAsync({ reportTime: t });
    if (pushEnabled) await scheduleDailyReport(t);
  };

  // Converts every stored amount on the server, so everything that shows money is refetched.
  const chooseCurrency = async (x: Currency) => {
    haptic('light');
    setPicker(null);
    if (x === cur) return;
    await updateMe.mutateAsync({ currency: x });
    await queryClient.invalidateQueries();
  };

  const chooseVoice = async (v: VoiceLanguage) => {
    haptic('light');
    setPicker(null);
    await updateMe.mutateAsync({ voiceLanguage: v });
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
            // PressableScale's style lands inside its Pressable, so a wrapper takes the row's space.
            return (
              <View key={m.id} style={{ flex: 1 }}>
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setAppearance(m.id)}
                  style={{
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
                  <Text variant="footnote" weight="600" numberOfLines={1}>
                    {m.label}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </View>

      <View>
        <SectionLabel>Money and voice</SectionLabel>
        <View style={group}>
          <ListRow icon="cash" tile="#0E7A4B" title="Currency" value={cur} onPress={() => setPicker('currency')} />
          <ListRow
            icon="mic"
            tile="#AF52DE"
            title="Voice language"
            value={VOICE_LABEL[u?.voiceLanguage ?? 'auto']}
            onPress={() => setPicker('voice')}
            last
          />
        </View>
      </View>

      <View>
        <SectionLabel>Budget</SectionLabel>
        <View style={group}>
          <ListRow
            icon="wallet"
            tile="#0E7A4B"
            title="Monthly income"
            value={formatAmount(u?.monthlyIncome ?? 0, cur)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="home"
            tile="#FF9500"
            title="Fixed costs"
            value={formatAmount(u?.fixedCostsMonthly ?? 0, cur)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="target"
            tile="#007AFF"
            title="Savings goal"
            value={formatAmount(u?.savingsGoalMonthly ?? 0, cur)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="gauge"
            tile="#30B0C7"
            title="Daily allowance"
            value={formatAmount(daily.data?.dailyAllowance ?? 0, cur)}
            valueColor={c.accent}
            last
          />
        </View>
      </View>

      <View>
        <SectionLabel>Notifications</SectionLabel>
        <View style={group}>
          <ListRow icon="clock" tile="#5856D6" title="Daily report" value={reportTime} onPress={() => setPicker('time')} />
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

      <PickerSheet
        visible={picker === 'time'}
        onClose={() => setPicker(null)}
        title="Daily report time"
        hint="FeMate sends your report to Telegram and as a notification at this time."
      >
        {REPORT_TIMES.map((t) => (
          <Chip key={t} label={t} icon="clock" selected={t === reportTime} onPress={() => void chooseTime(t)} />
        ))}
      </PickerSheet>

      <PickerSheet
        visible={picker === 'currency'}
        onClose={() => setPicker(null)}
        title="Currency"
        hint={`Balances, history, budgets and agent limits are converted at fixed sandbox rates (${CURRENCIES.filter((x) => x !== 'UZS')
          .map(rate)
          .join(', ')}). You can still log an expense in any currency, like “coffee $4.50”.`}
      >
        {CURRENCIES.map((x) => (
          <Chip key={x} label={`${x} · ${CURRENCY_INFO[x].name}`} selected={x === cur} onPress={() => void chooseCurrency(x)} />
        ))}
      </PickerSheet>

      <PickerSheet
        visible={picker === 'voice'}
        onClose={() => setPicker(null)}
        title="Voice language"
        hint="What you speak in voice notes, in the app and in Telegram. Auto-detect works for most; pick one if short notes come out wrong."
      >
        {VOICE_LANGUAGES.map((v) => (
          <Chip
            key={v}
            label={VOICE_LABEL[v]}
            icon="mic"
            selected={v === (u?.voiceLanguage ?? 'auto')}
            onPress={() => void chooseVoice(v)}
          />
        ))}
      </PickerSheet>

      <View>
        <SectionLabel>FeMate card</SectionLabel>
        <View style={group}>
          <ListRow icon="card" tile="#0E7A4B" title="Virtual Visa card" last onPress={() => router.push('/card')} />
        </View>
      </View>

      <View>
        <SectionLabel>Telegram bot</SectionLabel>
        <View style={{ ...group, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <IconTile name="send" bg="#2AABEE" fg="#FFFFFF" size={30} iconSize={18} rounded={8} />
            <Text variant="callout" color="body" style={{ flex: 1 }}>
              Add expenses, forward bank SMS and get your daily report in Telegram. The bot can read and add, but it can never move money.
            </Text>
          </View>
          {me.data?.telegramLinked && !code ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={16} color={c.accent} strokeWidth={2.4} />
              <Text variant="callout" style={{ flex: 1 }}>
                Linked to @femate_uz_bot
              </Text>
              <Button title="Open" variant="tinted" size="small" onPress={() => Linking.openURL(BOT_URL)} />
            </View>
          ) : code ? (
            <View style={{ alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.fill }}>
              <Text selectable variant="largeTitle" tabular style={{ letterSpacing: 4, fontSize: 34 }}>
                {code.code}
              </Text>
              <Text variant="footnote" color="body" style={{ textAlign: 'center', fontSize: 14 }} selectable>
                Send /start {code.code} to @femate_uz_bot, or tap below.
              </Text>
              <Button
                title="Open in Telegram"
                icon="send"
                size="medium"
                onPress={() => Linking.openURL(`${BOT_URL}?start=${code.code}`)}
                style={{ borderRadius: 14, height: 44, alignSelf: 'stretch' }}
              />
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

function PickerSheet({
  visible,
  onClose,
  title,
  hint,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
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
          <Text variant="title2">{title}</Text>
          <Text variant="footnote" color="secondary">
            {hint}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
