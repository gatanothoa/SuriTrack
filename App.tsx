import './global.css';

import { useCallback, useEffect, useState } from 'react';
import { Image, StatusBar as RNStatusBar, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import BolsasScreen from './src/screens/BolsasScreen';

const STORAGE_KEY = 'calcpack.materials.config.v5';

type HeaderPreferences = {
  appName: string;
  headerSubtitle: string;
  logoSource: string;
  themeMode: 'dark' | 'light';
};

const DEFAULT_HEADER_PREFERENCES: HeaderPreferences = {
  appName: 'SurtiTrack',
  headerSubtitle: 'Solicitud logística corporativa',
  logoSource: '',
  themeMode: 'dark',
};

function StartupLogo() {

  return (
    <View className="flex-1 items-center justify-center bg-industrial-bg px-6" style={{ backgroundColor: '#1E2329' }}>
      <RNStatusBar barStyle="light-content" backgroundColor="#1E2329" translucent={false} />

      <View className="w-full max-w-[320px] items-center">
        <View className="items-center rounded-ind border border-industrial-border bg-industrial-surface px-5 py-5">
          <View className="items-center justify-center rounded-ind border border-industrial-border bg-industrial-bg p-2">
            <Image source={require('./assets/logo.png')} style={{ width: 210, height: 210, borderRadius: 14 }} resizeMode="cover" />
          </View>

          <Text className="mt-4 text-[13px] font-semibold tracking-[0.35em] text-industrial-primary">SURTITRACK</Text>
          <Text className="mt-3 text-sm font-medium text-industrial-text">Operación logística</Text>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [headerPreferences, setHeaderPreferences] = useState<HeaderPreferences>(DEFAULT_HEADER_PREFERENCES);
  const isLightMode = headerPreferences.themeMode === 'light';
  const appBackground = isLightMode ? '#DCE5EF' : '#1E2329';
  const appSurface = isLightMode ? '#EDF2F7' : '#232A31';
  const appBorder = isLightMode ? '#A9B8C8' : '#3A434D';
  const appText = isLightMode ? '#1F2937' : '#FFFFFF';
  const appSubText = isLightMode ? '#4B5563' : '#94A3B8';

  const handleHeaderPreferencesChange = useCallback((nextPreferences: HeaderPreferences) => {
    setHeaderPreferences((current) => {
      if (
        current.appName === nextPreferences.appName &&
        current.headerSubtitle === nextPreferences.headerSubtitle &&
        current.logoSource === nextPreferences.logoSource &&
        current.themeMode === nextPreferences.themeMode
      ) {
        return current;
      }

      return {
        ...current,
        appName: nextPreferences.appName,
        headerSubtitle: nextPreferences.headerSubtitle,
        logoSource: nextPreferences.logoSource,
        themeMode: nextPreferences.themeMode,
      };
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadHeaderPreferences() {
      try {
        const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

        if (!storedValue || !isMounted) {
          return;
        }

        const parsed = JSON.parse(storedValue) as { preferences?: Partial<HeaderPreferences> };
        const preferences = parsed.preferences ?? {};

        setHeaderPreferences({
          appName: typeof preferences.appName === 'string' && preferences.appName.trim() ? preferences.appName.trim() : DEFAULT_HEADER_PREFERENCES.appName,
          headerSubtitle:
            typeof preferences.headerSubtitle === 'string' && preferences.headerSubtitle.trim()
              ? preferences.headerSubtitle.trim()
              : DEFAULT_HEADER_PREFERENCES.headerSubtitle,
          logoSource:
            typeof preferences.logoSource === 'string' && preferences.logoSource.trim() ? preferences.logoSource.trim() : DEFAULT_HEADER_PREFERENCES.logoSource,
          themeMode: preferences.themeMode === 'light' ? 'light' : 'dark',
        });
      } catch {
        setHeaderPreferences(DEFAULT_HEADER_PREFERENCES);
      }
    }

    void loadHeaderPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-industrial-bg" style={{ backgroundColor: '#1E2329' }}>
          <StatusBar style="light" backgroundColor="#1E2329" translucent={false} />
          <StartupLogo />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-industrial-bg" style={{ backgroundColor: appBackground }}>
          <StatusBar style={isLightMode ? 'dark' : 'light'} backgroundColor={appBackground} translucent={false} />

          <View className="flex-1 bg-industrial-bg" style={{ backgroundColor: appBackground }}>
          <View className="border-b border-industrial-border bg-industrial-surface px-4 py-4" style={{ backgroundColor: appSurface, borderBottomColor: appBorder }}>
            <View className="flex-row items-center gap-3">
              <View className="items-center justify-center rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3" style={{ borderColor: appBorder, backgroundColor: appBackground }}>
                {headerPreferences.logoSource ? (
                  <Image source={{ uri: headerPreferences.logoSource }} style={{ width: 24, height: 24, borderRadius: 6 }} resizeMode="cover" />
                ) : (
                  <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#FFB020" />
                )}
              </View>
              <View>
                <Text className="text-lg font-bold text-white" style={{ color: appText }}>{headerPreferences.appName}</Text>
                <Text className="text-sm text-slate-400" style={{ color: appSubText }}>{headerPreferences.appName} · {headerPreferences.headerSubtitle}</Text>
              </View>
            </View>
          </View>

          <BolsasScreen onHeaderPreferencesChange={handleHeaderPreferencesChange} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
