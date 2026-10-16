import { create } from 'zustand';

import { loadToken, saveToken } from '@/lib/auth';

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
  signIn: async (token) => {
    await saveToken(token);
    set({ token });
  },
  signOut: async () => {
    await saveToken(null);
    set({ token: null });
  },
}));
