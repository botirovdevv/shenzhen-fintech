// Delivery for proactive messages: Expo push to the app and a Telegram message when the chat is linked.
// index.ts wires the real channels at startup; until then (and in tests unless set) nothing is sent.
export interface Channels {
  push?: (token: string, title: string, body: string) => Promise<void>;
  telegram?: (chatId: string, text: string) => Promise<void>;
}

let channels: Channels = {};

export function setChannels(c: Channels) {
  channels = c;
}

export async function expoPush(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
}

/** Sends to every channel the user has. Failures are returned, never thrown. */
export async function notifyUser(
  u: { expoPushToken: string | null; telegramChatId: string | null },
  title: string,
  body: string,
): Promise<unknown[]> {
  const jobs: Promise<void>[] = [];
  if (u.expoPushToken && channels.push) jobs.push(channels.push(u.expoPushToken, title, body));
  if (u.telegramChatId && channels.telegram) jobs.push(channels.telegram(u.telegramChatId, `${title}\n\n${body}`));
  const results = await Promise.allSettled(jobs);
  return results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
}
