import { categorize, convertMoney, toMinor, type Category, type Transaction } from '@femate/shared';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, TextInput, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Button, Card, Chip, haptic, IconTile, PressableScale, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { categoryIcon } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { categoryLabel, formatAmount, formatMoney } from '@/lib/format';
import { useAccounts, useCreateTransaction, useVoiceTransaction } from '@/lib/queries';
import { radius, useTheme } from '@/theme';

const EXAMPLES: { label: string; icon: IconName }[] = [
  { label: 'taxi 20k', icon: 'transport' },
  { label: 'lunch 35 ming', icon: 'food' },
  { label: 'electricity 120000', icon: 'utilities' },
  { label: 'coffee $4.50', icon: 'coffee' },
];
const PICKABLE: Category[] = ['transport', 'food', 'utilities', 'shopping', 'health', 'other'];
const MAX_RECORDING_MS = 60_000; // PLAN.md Stage 6: ≤ 60 s

function Pulse({ color }: { color: string }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
      }}
    />
  );
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Add() {
  const cur = useCurrency();
  const { c } = useTheme();
  const accounts = useAccounts();
  const create = useCreateTransaction();
  const voice = useVoiceTransaction();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [text, setText] = useState('');
  const [override, setOverride] = useState<Category | null>(null);
  const [saved, setSaved] = useState<{ tx: Transaction; transcript?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
    },
    [],
  );

  // Live preview only; the server does the real categorisation when we send { text }.
  const parsed = categorize(text);
  const category = override ?? parsed.category;
  // "coffee $4.50" on a so'm account: show what was typed, and what it becomes.
  const entered = parsed.currency ?? cur;
  const enteredMinor = parsed.amount === null ? 0 : toMinor(parsed.amount, entered);
  const cash = accounts.data?.find((a) => a.type === 'cash');
  const recording = recState.isRecording;
  const busy = voice.isPending;
  const showResult = parsed.amount !== null && !saved && !recording && !busy;

  const edit = (t: string) => {
    setText(t);
    setOverride(null);
    setSaved(null);
    setError(null);
  };

  const save = async () => {
    if (parsed.amount === null) return;
    setError(null);
    try {
      const tx = await create.mutateAsync(
        override ? { amount: enteredMinor, currency: entered, category, description: parsed.description } : { text },
      );
      haptic('success');
      setSaved({ tx });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const startRecording = async () => {
    setError(null);
    setSaved(null);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('Microphone access is off. Allow it in your phone’s Settings, or type the expense.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      setError(`Couldn’t start the microphone (${e instanceof Error ? e.message : String(e)}). Type the expense instead.`);
      return;
    }
    haptic('medium');
    stopTimer.current = setTimeout(() => void stopRecording(), MAX_RECORDING_MS);
  };

  const stopRecording = async () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = null;
    if (!recorder.isRecording) return;
    haptic('medium');
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri) {
      setError('The recording was empty. Try again.');
      return;
    }
    try {
      const res = await voice.mutateAsync(uri);
      haptic('success');
      setText('');
      setSaved({ tx: res.transaction, transcript: res.transcript });
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };

  return (
    <Screen tabs title="Add expense" subtitle="Type it like a message, or just say it.">
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: radius.xl,
          paddingLeft: 16,
          paddingRight: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon name="pen" size={20} color={c.secondary} />
        <TextInput
          accessibilityLabel="Describe the expense"
          value={text}
          onChangeText={edit}
          placeholder="e.g. taxi 20k"
          placeholderTextColor={c.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
          editable={!recording && !busy}
          style={{ flex: 1, height: 60, fontSize: 19, color: c.label }}
        />
        {text ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear"
            onPress={() => edit('')}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <View
              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.fill2, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={12} color={c.secondary} strokeWidth={3} />
            </View>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EXAMPLES.map((e) => (
          <PressableScale
            key={e.label}
            onPress={() => edit(e.label)}
            accessibilityRole="button"
            style={{
              height: 36,
              paddingLeft: 10,
              paddingRight: 12,
              borderRadius: 18,
              backgroundColor: c.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name={e.icon} size={16} color={c.accent} strokeWidth={2} />
            <Text variant="footnote" weight="500" style={{ fontSize: 14 }}>
              {e.label}
            </Text>
          </PressableScale>
        ))}
      </View>

      {showResult ? (
        <Card style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="sparkleSmall" size={15} color={c.accent} strokeWidth={2} />
              <Text variant="sectionLabel" color="secondary">
                FeMate understood
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: c.fill,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
              }}
            >
              <Icon name="pen" size={12} color={c.secondary} strokeWidth={2.2} />
              <Text variant="caption" color="secondary" weight="600">
                Typed
              </Text>
            </View>
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="largeTitle" tabular style={{ fontSize: 40, lineHeight: 46 }}>
              {formatAmount(enteredMinor, entered)}{' '}
              <Text variant="title2" color="secondary">
                {entered}
              </Text>
            </Text>
            {entered !== cur ? (
              <Text variant="footnote" color="secondary" tabular>
                ≈ {formatMoney(convertMoney(enteredMinor, entered, cur), cur)} at the sandbox rate
              </Text>
            ) : null}
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="footnote" color="secondary">
              {parsed.description} · tap to change category
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PICKABLE.map((cat) => (
                <Chip
                  key={cat}
                  label={categoryLabel[cat]}
                  icon={categoryIcon[cat]}
                  selected={cat === category}
                  onPress={() => setOverride(cat)}
                />
              ))}
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingTop: 12,
              borderTopWidth: 0.5,
              borderTopColor: c.separator,
            }}
          >
            <IconTile name="cash" bg={c.fill} fg={c.label} size={34} iconSize={18} />
            <View style={{ flex: 1 }}>
              <Text variant="footnote" color="secondary">
                Paid from
              </Text>
              <Text variant="callout" weight="600" tabular>
                Cash · {formatAmount(cash?.balance ?? 0, cur)} left
              </Text>
            </View>
          </View>
          <Button title="Save expense" icon="check" onPress={save} loading={create.isPending} />
        </Card>
      ) : null}

      {busy ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile name="wave" bg={c.accentTint} fg={c.accent} size={40} iconSize={22} rounded={12} />
          <Text variant="callout" color="secondary" style={{ flex: 1 }}>
            Listening back to your note…
          </Text>
        </Card>
      ) : null}

      {saved ? (
        <Card style={{ gap: 12 }}>
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile name={categoryIcon[saved.tx.category]} bg={c.accentTint} fg={c.accent} size={44} iconSize={22} rounded={13} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" tabular>
                {formatMoney(saved.tx.amount, cur)}
                {saved.tx.original ? ` (${formatMoney(saved.tx.original.amount, saved.tx.original.currency)})` : ''} ·{' '}
                {categoryLabel[saved.tx.category]}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="check" size={13} color={c.accent} strokeWidth={2.6} />
                <Text variant="footnote" color="accent" weight="600">
                  Added to today{saved.transcript ? ' from your voice note' : ''}
                </Text>
              </View>
            </View>
          </View>
          {saved.transcript ? (
            <View style={{ flexDirection: 'row', gap: 8, backgroundColor: c.fill, borderRadius: 12, padding: 12 }}>
              <Icon name="mic" size={16} color={c.secondary} strokeWidth={2} />
              <Text variant="callout" color="body" style={{ flex: 1, fontStyle: 'italic' }} selectable>
                “{saved.transcript}”
              </Text>
            </View>
          ) : null}
          <Button title="Add another" icon="plus" variant="secondary" size="medium" onPress={() => edit('')} />
        </Card>
      ) : null}

      {error ? (
        <View
          accessibilityLiveRegion="assertive"
          style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.dangerTint, padding: 12, borderRadius: 14 }}
        >
          <Icon name="info" size={18} color={c.dangerInk} strokeWidth={2.2} />
          <Text variant="footnote" color="dangerInk" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : null}

      <View style={{ alignItems: 'center', gap: 12, paddingTop: 12 }}>
        <View style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
          {recording ? <Pulse color={c.danger} /> : null}
          <PressableScale
            onPress={recording ? stopRecording : startRecording}
            disabled={busy}
            hapticOnPress={false}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Record a voice note'}
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: recording ? c.danger : c.accent,
              opacity: busy ? 0.5 : 1,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: c.accent,
              shadowOpacity: 0.3,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
            }}
          >
            {recording ? (
              <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#FFFFFF' }} />
            ) : (
              <Icon name="mic" size={34} color={c.onAccent} strokeWidth={2} />
            )}
          </PressableScale>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={recording ? 'wave' : 'mic'} size={14} color={c.secondary} strokeWidth={2.2} />
          <Text variant="footnote" color="secondary" weight="500" tabular style={{ fontSize: 14 }}>
            {recording
              ? `Listening ${mmss(recState.durationMillis)} / 1:00 · tap to stop`
              : 'Tap and say “Bozorga qirq besh ming ishlatdim”'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
