import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kv } from '@/lib/storage';

export type Appearance = 'system' | 'light' | 'dark';

interface SettingsState {
  appearance: Appearance;
  pushEnabled: boolean;
  setAppearance: (a: Appearance) => void;
  setPushEnabled: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: 'system',
      pushEnabled: false,
      setAppearance: (appearance) => set({ appearance }),
      setPushEnabled: (pushEnabled) => set({ pushEnabled }),
    }),
    { name: 'femate.settings', storage: createJSONStorage(() => kv) },
  ),
);
