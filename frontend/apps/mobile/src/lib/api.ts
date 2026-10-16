// API client for apps/api (PLAN.md §11). With no EXPO_PUBLIC_API_URL set, every call goes to the
// in-memory mock so the app works before the backend exists.
import type {
  Account,
  AgentAction,
  ApiErrorBody,
  AuditEntry,
  AuthResponse,
  ChatResponse,
  ConnectBankBody,
  CreateTransactionBody,
  DailySummary,
  LoginBody,
  Page,
  PeriodSummary,
  Permissions,
  Recommendation,
  RegisterBody,
  SimulateBody,
  SimulateResponse,
  Transaction,
  UpdateMeBody,
  UpdatePermissionsBody,
  User,
} from '@femate/shared';

import { Platform } from 'react-native';

import { useSession } from '@/store/session';
import { ApiError, mockApi } from './mock';

export { ApiError };

const BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
export const usingMock = BASE_URL === '';

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useSession.getState().token;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', 'Can’t reach the FeMate server. Check your connection and try again.');
  }
  if (res.status === 401) {
    await useSession.getState().signOut();
    throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
  }
  const data = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(err?.code ?? `HTTP_${res.status}`, err?.message ?? 'Something went wrong. Try again.');
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

// POST /transactions/voice (multipart field "audio"). Native fetch takes { uri, name, type };
// on web the recorder gives a blob: URL, so the blob itself is appended.
async function uploadVoice(uri: string): Promise<{ transcript: string; transaction: Transaction }> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('audio', blob, 'voice.webm');
  } else {
    form.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' } as unknown as Blob);
  }
  const token = useSession.getState().token;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/transactions/voice`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError('NETWORK', 'Can’t reach the FeMate server. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as { transcript: string; transaction: Transaction } | ApiErrorBody | null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    if (err?.code === 'STT_UNAVAILABLE' || res.status === 503) {
      throw new ApiError('STT_UNAVAILABLE', 'Voice input is off on the server right now. Type the expense instead.');
    }
    throw new ApiError(err?.code ?? `HTTP_${res.status}`, err?.message ?? 'Couldn’t process the recording. Try again.');
  }
  return data as { transcript: string; transaction: Transaction };
}

export const api = {
  voiceTransaction: (uri: string) => (usingMock ? mockApi.voiceTransaction(uri) : uploadVoice(uri)),
  login: (b: LoginBody) => (usingMock ? mockApi.login(b) : http<AuthResponse>('POST', '/auth/login', b)),
  register: (b: RegisterBody) => (usingMock ? mockApi.register(b) : http<AuthResponse>('POST', '/auth/register', b)),
  me: () => (usingMock ? mockApi.me() : http<User>('GET', '/me')),
  updateMe: (b: UpdateMeBody) => (usingMock ? mockApi.updateMe(b) : http<User>('PATCH', '/me', b)),
  connectBank: (b: ConnectBankBody) => (usingMock ? mockApi.connectBank(b) : http<{ accounts: Account[] }>('POST', '/bank/connect', b)),
  accounts: () => (usingMock ? mockApi.accounts() : http<Account[]>('GET', '/accounts')),
  transactions: (limit = 50) => (usingMock ? mockApi.transactions(limit) : http<Page<Transaction>>('GET', `/transactions${qs({ limit })}`)),
  createTransaction: (b: CreateTransactionBody) =>
    usingMock ? mockApi.createTransaction(b) : http<Transaction>('POST', '/transactions', b),
  dailySummary: () => (usingMock ? mockApi.dailySummary() : http<DailySummary>('GET', '/summary/daily')),
  periodSummary: (from: Date, to: Date) =>
    usingMock
      ? mockApi.periodSummary(from, to)
      : http<PeriodSummary>('GET', `/summary/period${qs({ from: from.toISOString(), to: to.toISOString() })}`),
  chat: (message: string) => (usingMock ? mockApi.chat(message) : http<ChatResponse>('POST', '/agent/chat', { message })),
  recommendations: () => (usingMock ? mockApi.recommendations() : http<Recommendation[]>('GET', '/agent/recommendations')),
  applyRecommendation: (id: string) =>
    usingMock ? mockApi.applyRecommendation(id) : http<{ action?: AgentAction }>('POST', `/agent/recommendations/${id}/apply`),
  actions: (status?: AgentAction['status']) =>
    usingMock ? mockApi.actions(status) : http<AgentAction[]>('GET', `/agent/actions${qs({ status })}`),
  approveAction: (id: string) => (usingMock ? mockApi.approveAction(id) : http<AgentAction>('POST', `/agent/actions/${id}/approve`)),
  rejectAction: (id: string) => (usingMock ? mockApi.rejectAction(id) : http<AgentAction>('POST', `/agent/actions/${id}/reject`)),
  simulate: (b: SimulateBody) => (usingMock ? mockApi.simulate(b) : http<SimulateResponse>('POST', '/agent/simulate', b)),
  permissions: () => (usingMock ? mockApi.permissions() : http<Permissions>('GET', '/permissions')),
  updatePermissions: (b: UpdatePermissionsBody) => (usingMock ? mockApi.updatePermissions(b) : http<Permissions>('PUT', '/permissions', b)),
  killSwitch: () => (usingMock ? mockApi.killSwitch() : http<Permissions>('POST', '/permissions/kill-switch')),
  audit: (limit = 50) => (usingMock ? mockApi.audit(limit) : http<Page<AuditEntry>>('GET', `/audit${qs({ limit })}`)),
  telegramLinkCode: () =>
    usingMock ? mockApi.telegramLinkCode() : http<{ code: string; expiresAt: string }>('POST', '/telegram/link-code'),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}
