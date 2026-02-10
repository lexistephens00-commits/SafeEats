import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export type Units = "miles" | "km";

export type AppSettings = {
  displayName: string;

  // Dietary filters
  glutenFreeOnly: boolean;
  dairyFree: boolean;
  nutFree: boolean;

  // Map behavior
  showGfPins: boolean;
  searchRadiusMiles: number;
  minSafetyScore: number; // 0-100 concept

  // General
  notifications: boolean;
  units: Units;
};

type SettingsState = {
  settings: AppSettings;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
};

const STORAGE_KEY = "gfreeway_settings_v1";

const DEFAULTS: AppSettings = {
  displayName: "Lexi",

  glutenFreeOnly: true,
  dairyFree: false,
  nutFree: false,

  showGfPins: true,
  searchRadiusMiles: 5,
  minSafetyScore: 70,

  notifications: true,
  units: "miles",
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        set({ settings: { ...DEFAULTS, ...parsed }, hydrated: true });
        return;
      }
    } catch {
      // ignore and fall back to defaults
    }
    set({ settings: DEFAULTS, hydrated: true });
  },

  setSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore write errors
    }
  },

  resetSettings: async () => {
    set({ settings: DEFAULTS });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
    } catch {
      // ignore write errors
    }
  },
}));
