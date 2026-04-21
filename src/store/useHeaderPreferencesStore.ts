import { create } from 'zustand';
import type { HeaderPreferencesPayload } from '../types/logistics';

const DEFAULT_HEADER_PREFERENCES: HeaderPreferencesPayload = {
  appName: 'SurtiTrack',
  headerSubtitle: 'Solicitud logística corporativa',
  logoSource: '',
  themeMode: 'dark',
};

type HeaderPreferencesState = {
  headerPreferences: HeaderPreferencesPayload;
  setHeaderPreferences: (preferences: HeaderPreferencesPayload) => void;
  resetHeaderPreferences: () => void;
};

export const useHeaderPreferencesStore = create<HeaderPreferencesState>((set) => ({
  headerPreferences: DEFAULT_HEADER_PREFERENCES,
  setHeaderPreferences: (preferences) => set({ headerPreferences: preferences }),
  resetHeaderPreferences: () => set({ headerPreferences: DEFAULT_HEADER_PREFERENCES }),
}));

export { DEFAULT_HEADER_PREFERENCES };
