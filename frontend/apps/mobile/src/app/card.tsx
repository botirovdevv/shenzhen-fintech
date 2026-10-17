import { fromUzs, type CardAuthorization, type CardDetails, type PaymentCard } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, ErrorRow, haptic, IconTile, ListRow, PressableScale, SectionLabel, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { categoryIcon } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { formatMoney, formatTime } from '@/lib/format';
import { useAccounts, useCard, useCardAuthorizations, useIssueCard, useSimulatePurchase, useUpdateCard } from '@/lib/queries';
import { radius, useTheme } from '@/theme';

// Test purchases for the sandbox card: amounts in UZS, shown in the user's currency.
const SHOPS: { merchant: string; uzs: number; mcc: string; icon: IconName }[] = [
  { merchant: 'Evos', uzs: 45_000, mcc: '5814', icon: 'food' },
  { merchant: 'Yandex Go', uzs: 22_000, mcc: '4121', icon: 'transport' },
  { merchant: 'Korzinka', uzs: 180_000, mcc: '5411', icon: 'shopping' },
  { merchant: 'Uzum Market', uzs: 3_000_000, mcc: '5311', icon: 'shopping' },
];

const DECLINE_LABEL: Record<string, string> = {
  CARD_PAUSED: 'Card frozen',
  INSUFFICIENT_FUNDS: 'Not enough money',
  VELOCITY_EXCEEDED: 'Over budget',
  UNAUTHORIZED_MERCHANT: 'Declined',
};

const groupPan = (pan: string) => pan.replace(/(\d{4})(?=\d)/g, '$1 ');

function CardFace({ card, details }: { card: PaymentCard; details: CardDetails | null }) {
  const { c } = useTheme();
  const ink = '#FFFFFF';
  return (
    <View
      accessibilityLabel={`${card.network === 'VISA' ? 'Visa' : 'Mastercard'} card ending in ${card.lastFour}${card.frozen ? ', frozen' : ''}`}
      style={{
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        aspectRatio: 1.586,
        borderRadius: radius.xl,
        backgroundColor: c.hero,
        padding: 22,
        justifyContent: 'space-between',
        overflow: 'hidden',
        opacity: card.frozen ? 0.55 : 1,
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: 260,
          height: 260,
          borderRadius: 130,
          right: -90,
          top: -110,
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: 90,
          right: -40,
          bottom: -100,
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="headline" color={ink} weight="700">
          FeMate
        </Text>
        {card.frozen ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <Icon name="lock" size={12} color={ink} strokeWidth={2.4} />
            <Text variant="caption" color={ink} weight="600">
              Frozen
            </Text>
          </View>
        ) : (
          <Text variant="caption" color="rgba(255,255,255,0.75)" weight="600">
            Virtual
          </Text>
        )}
      </View>
      <Text selectable={!!details} variant="title2" color={ink} tabular style={{ letterSpacing: 2, fontSize: 21 }}>
        {details ? groupPan(details.pan) : `•••• •••• •••• ${card.lastFour}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 22 }}>
          <View>
            <Text variant="caption" color="rgba(255,255,255,0.7)">
              Expires
            </Text>
            <Text variant="callout" color={ink} weight="600" tabular>
              {card.expMonth}/{card.expYear.slice(-2)}
            </Text>
          </View>
          <View>
            <Text variant="caption" color="rgba(255,255,255,0.7)">
              CVV
            </Text>
            <Text selectable={!!details} variant="callout" color={ink} weight="600" tabular>
              {details ? details.cvv : '•••'}
            </Text>
          </View>
        </View>
        <Text color={ink} weight="800" style={{ fontSize: 24, fontStyle: 'italic', letterSpacing: 1 }}>
          {card.network === 'VISA' ? 'VISA' : 'mastercard'}
        </Text>
      </View>
    </View>
  );
}

function AuthorizationRow({ a, last }: { a: CardAuthorization; last: boolean }) {
  const { c } = useTheme();
  const cur = useCurrency();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: c.separator,
      }}
    >
      <IconTile name={categoryIcon[a.category]} bg={c.fill} fg={c.label} size={40} iconSize={20} rounded={20} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="500" numberOfLines={1}>
          {a.merchant}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name={a.approved ? 'check' : 'ban'} size={13} color={a.approved ? c.accent : c.danger} strokeWidth={2.4} />
          <Text variant="footnote" color={a.approved ? 'secondary' : c.dangerInk} numberOfLines={1}>
            {a.approved ? 'Approved' : (DECLINE_LABEL[a.result] ?? 'Declined')} · {formatTime(a.createdAt)}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text
          variant="body"
          weight="600"
          tabular
          color={a.approved ? c.label : c.secondary}
          style={a.approved ? undefined : { textDecorationLine: 'line-through' }}
        >
          −{formatMoney(a.amount, cur)}
        </Text>
        {a.original ? (
          <Text variant="footnote" color="secondary" tabular>
            {formatMoney(a.original.amount, a.original.currency)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function CardScreen() {
  const { c } = useTheme();
  const cur = useCurrency();
  const status = useCard();
  const auths = useCardAuthorizations();
  const issue = useIssueCard();
  const update = useUpdateCard();
  const simulate = useSimulatePurchase();
  const [details, setDetails] = useState<CardDetails | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CardAuthorization | null>(null);

  const card = status.data?.card ?? null;
  const funding = useAccounts().data?.find((a) => a.id === card?.accountId);

  const reveal = async () => {
    if (details) return setDetails(null);
    setError(null);
    setRevealing(true);
    try {
      setDetails(await api.cardDetails());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRevealing(false);
    }
  };

  const toggle = (b: { frozen?: boolean; blockOverBudget?: boolean }) => {
    haptic('light');
    setError(null);
    update.mutate(b, { onError: (e) => setError(errorMessage(e)) });
  };

  const buy = (s: (typeof SHOPS)[number]) => {
    setError(null);
    setLast(null);
    simulate.mutate(
      { amount: fromUzs(s.uzs, cur), merchant: s.merchant, mcc: s.mcc },
      {
        onSuccess: (r) => {
          haptic(r.authorization.approved ? 'success' : 'warning');
          setLast(r.authorization);
          void auths.refetch();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Screen
      title="FeMate card"
      refreshing={status.isRefetching || auths.isRefetching}
      onRefresh={() => void Promise.all([status.refetch(), auths.refetch()])}
      header={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', height: 44, alignSelf: 'flex-start', marginBottom: -8 }}
        >
          <Icon name="chevronLeft" size={22} color={c.accent} strokeWidth={2.4} />
          <Text variant="body" color="accent">
            Back
          </Text>
        </Pressable>
      }
    >
      {status.isError ? <ErrorRow message="Couldn’t load your card." onRetry={() => void status.refetch()} /> : null}
      {status.isLoading ? <ActivityIndicator color={c.accent} style={{ height: 200 }} /> : null}

      {status.data && !status.data.available ? (
        <Banner
          tone="warn"
          icon="info"
          title="The card isn’t switched on yet"
          subtitle="This server has no card provider set up. Try again later."
        />
      ) : null}

      {status.data?.available && !card ? (
        <Card style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text variant="title2">Get a virtual Visa card</Text>
            <Text variant="callout" color="body">
              Pay online with a FeMate card. It spends from your card account, and FeMate decides on every purchase the moment it happens.
            </Text>
          </View>
          {(
            [
              ['shieldCheck', 'Every purchase is checked live: frozen card, balance and your category budgets.'],
              ['lock', 'Freeze it in one tap. The full number is never stored by FeMate.'],
              ['list', 'Purchases land in your history and reports on their own.'],
            ] as const
          ).map(([icon, text]) => (
            <View key={icon} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <IconTile name={icon} bg={c.accentTint} fg={c.accentInk} size={34} iconSize={18} rounded={17} />
              <Text variant="callout" style={{ flex: 1 }}>
                {text}
              </Text>
            </View>
          ))}
          <Button
            title="Get my FeMate card"
            icon="card"
            loading={issue.isPending}
            onPress={() => {
              setError(null);
              issue.mutate(undefined, { onSuccess: () => haptic('success'), onError: (e) => setError(errorMessage(e)) });
            }}
          />
          {status.data.sandbox ? (
            <Text variant="footnote" color="secondary">
              Test card on the Lithic sandbox. It holds no real money.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {error ? <Banner tone="danger" icon="info" title={error} /> : null}

      {card ? (
        <>
          <CardFace card={card} details={details} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Button's style lands inside its Pressable, so a wrapper takes the row's space. */}
            <View style={{ flex: 1 }}>
              <Button
                title={details ? 'Hide number' : 'Show number'}
                icon={details ? 'eyeOff' : 'eye'}
                variant="secondary"
                size="medium"
                loading={revealing}
                onPress={() => void reveal()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={card.frozen ? 'Unfreeze' : 'Freeze'}
                icon="lock"
                variant={card.frozen ? 'primary' : 'secondary'}
                size="medium"
                loading={update.isPending && update.variables?.frozen !== undefined}
                onPress={() => toggle({ frozen: !card.frozen })}
              />
            </View>
          </View>

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="footnote" color="secondary" weight="500">
                Available to spend
              </Text>
              <Text variant="title2" tabular>
                {formatMoney(funding?.balance ?? 0, cur)}
              </Text>
            </View>
            <Button
              title="Top up"
              icon="plus"
              size="medium"
              variant={(funding?.balance ?? 0) > 0 ? 'tinted' : 'primary'}
              onPress={() => router.push({ pathname: '/money', params: { mode: 'add', to: 'card' } })}
            />
          </Card>

          <View>
            <SectionLabel>Rules</SectionLabel>
            <View style={{ backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden' }}>
              <ListRow
                icon="target"
                tile="#FF9500"
                title="Block over-budget purchases"
                last
                right={
                  <Switch
                    value={card.blockOverBudget}
                    onValueChange={(v) => toggle({ blockOverBudget: v })}
                    trackColor={{ true: '#34C759', false: c.fill2 }}
                    accessibilityLabel="Block over-budget purchases"
                  />
                }
              />
            </View>
            <Text variant="footnote" color="secondary" style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              A purchase that would take a category past its monthly budget is declined. Frozen cards and low balances are always declined.
            </Text>
          </View>

          {status.data?.sandbox ? (
            <View>
              <SectionLabel>Try a purchase</SectionLabel>
              <Card style={{ gap: 12 }}>
                <Text variant="footnote" color="secondary">
                  Sandbox: a shop charges your card through the card network, and FeMate approves or declines it live.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SHOPS.map((s) => (
                    <View key={s.merchant} style={{ flexGrow: 1, flexBasis: '45%' }}>
                      <PressableScale
                        disabled={simulate.isPending}
                        onPress={() => buy(s)}
                        accessibilityRole="button"
                        accessibilityLabel={`Pay ${formatMoney(fromUzs(s.uzs, cur), cur)} at ${s.merchant}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          padding: 12,
                          borderRadius: radius.md,
                          backgroundColor: c.fill,
                          opacity: simulate.isPending ? 0.6 : 1,
                        }}
                      >
                        <Icon name={s.icon} size={20} color={c.label} />
                        <View style={{ flex: 1 }}>
                          <Text variant="callout" weight="600" numberOfLines={1}>
                            {s.merchant}
                          </Text>
                          <Text variant="footnote" color="secondary" tabular numberOfLines={1}>
                            {formatMoney(fromUzs(s.uzs, cur), cur)}
                          </Text>
                        </View>
                      </PressableScale>
                    </View>
                  ))}
                </View>
                {simulate.isPending ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color={c.accent} />
                    <Text variant="footnote" color="secondary">
                      Waiting for the card network…
                    </Text>
                  </View>
                ) : null}
                {last ? (
                  <Banner
                    tone={last.approved ? 'success' : 'danger'}
                    icon={last.approved ? 'check' : 'ban'}
                    title={last.approved ? `Approved · ${formatMoney(last.amount, cur)}` : (DECLINE_LABEL[last.result] ?? 'Declined')}
                    subtitle={last.reason}
                  />
                ) : null}
              </Card>
            </View>
          ) : null}

          <Card style={{ paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
              <Icon name="clock" size={20} color={c.accent} strokeWidth={2} />
              <Text variant="title2">Card activity</Text>
            </View>
            {auths.isError ? <ErrorRow message="Couldn’t load card activity." onRetry={() => void auths.refetch()} /> : null}
            {auths.data?.length === 0 ? (
              <Text variant="callout" color="secondary" style={{ paddingBottom: 12 }}>
                No purchases yet. Approved and declined payments show up here.
              </Text>
            ) : null}
            {(auths.data ?? []).map((a, i, all) => (
              <AuthorizationRow key={a.id} a={a} last={i === all.length - 1} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
