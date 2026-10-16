import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

// Small key-value store: Keychain/Keystore on device, localStorage on web.
// Reads and writes never throw; a failure just means nothing is remembered.
export const kv: StateStorage = {
  getItem: async (key) => {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
      else await SecureStore.setItemAsync(key, value);
    } catch {
      // Storage unavailable (private mode, locked keychain).
    }
  },
  removeItem: async (key) => {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key);
      else await SecureStore.deleteItemAsync(key);
    } catch {
      // Same as above.
    }
  },
};
