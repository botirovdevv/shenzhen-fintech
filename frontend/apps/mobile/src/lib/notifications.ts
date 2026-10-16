import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { api } from './api';

type NotificationsModule = typeof import('expo-notifications');

const CHANNEL = 'daily-report';

// Expo Go on Android (SDK 53+) ships without part of expo-notifications' native code, so even
// importing the package there throws ("Cannot find native module 'ExpoTopicSubscriptionModule'").
// The module is therefore loaded lazily, and never in Expo Go on Android or on web.
const inExpoGoAndroid = Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let cached: NotificationsModule | null | undefined;

function load(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || inExpoGoAndroid) return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

export type EnableResult = { ok: true; pushToken: boolean } | { ok: false; reason: string };

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return { hour: Math.min(23, Math.max(0, h ?? 21)), minute: Math.min(59, Math.max(0, m ?? 0)) };
}

// Remote push needs an EAS project id and a build that includes push support.
async function registerPushToken(N: NotificationsModule): Promise<boolean> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return false;
  try {
    const token = (await N.getExpoPushTokenAsync({ projectId })).data;
    await api.updateMe({ expoPushToken: token });
    return true;
  } catch {
    return false;
  }
}

// Asks for permission, schedules the daily report reminder (a local notification) and registers for
// server push where the build allows it.
export async function enableNotifications(reportTime: string): Promise<EnableResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Notifications work in the phone app, not in the browser.' };
  const N = load();
  if (!N) {
    return {
      ok: false,
      reason: inExpoGoAndroid
        ? 'Expo Go on Android can’t show FeMate notifications. They work in the installed app (APK).'
        : 'Notifications aren’t available on this device.',
    };
  }
  const perm = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  if (!perm.granted) return { ok: false, reason: 'Notifications are off for FeMate. Turn them on in your phone’s Settings.' };
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL, { name: 'Daily report', importance: N.AndroidImportance.DEFAULT });
  }
  await scheduleDailyReport(reportTime);
  const pushToken = await registerPushToken(N);
  return { ok: true, pushToken };
}

export async function scheduleDailyReport(reportTime: string) {
  const N = load();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync();
  const { hour, minute } = parseTime(reportTime);
  await N.scheduleNotificationAsync({
    content: { title: 'Your day with FeMate', body: 'See what you spent today and how much you can move to Savings.' },
    trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL },
  });
}

export async function disableNotifications() {
  const N = load();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync();
}
