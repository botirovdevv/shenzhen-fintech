import { create } from 'zustand';

import { loadToken, saveToken } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';

interface SessionState {
  token: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  token: null,
  hydrated: false,
  hydrate: async () => {
    const token = await loadToken();
    set({ token, hydrated: true });
  },
  // Both start from an empty cache, so one account never sees another account's balances for a moment.
  signIn: async (token) => {
    await saveToken(token);
    queryClient.clear();
    set({ token });
  },
  signOut: async () => {
    await saveToken(null);
    queryClient.clear();
    set({ token: null });
  },
}));
