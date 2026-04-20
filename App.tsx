import './global.css';

import { useCallback, useEffect, useState } from 'react';
import { Image, StatusBar as RNStatusBar, View } from 'react-native';
import Typography from './src/components/Typography';
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
    <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: '#0B1E3A' }}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0B1E3A" translucent={false} />

      <View className="w-full max-w-[320px] items-center">
        <View className="items-center rounded-card border px-5 py-6" style={{ borderColor: '#1F3F73', backgroundColor: '#10284A' }}>
          <View className="items-center justify-center rounded-card border p-2" style={{ borderColor: '#1F3F73', backgroundColor: '#0B1E3A' }}>
            <Image source={require('./assets/logo.png')} style={{ width: 210, height: 210, borderRadius: 14 }} resizeMode="cover" />
          </View>

          <Typography className="mt-4 text-[13px] font-semibold tracking-[0.18em]" style={{ color: '#A9C4EA' }}>SURTITRACK</Typography>
          <Typography className="mt-2 text-sm font-medium" style={{ color: '#EAF2FF' }}>Operación logística</Typography>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [headerPreferences, setHeaderPreferences] = useState<HeaderPreferences>(DEFAULT_HEADER_PREFERENCES);
  const isLightMode = headerPreferences.themeMode === 'light';
  const appBackground = isLightMode ? '#F2F7FD' : '#081A33';
  const appSurface = isLightMode ? '#FFFFFF' : '#0E2748';
  const appBorder = isLightMode ? '#D7E4F5' : '#23456F';
  const appText = isLightMode ? '#1F2937' : '#FFFFFF';
  const appSubText = isLightMode ? '#4E6B94' : '#A9C4EA';

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
        <SafeAreaView className="flex-1" style={{ backgroundColor: '#0B1E3A' }}>
          <StatusBar style="light" backgroundColor="#0B1E3A" translucent={false} />
          <StartupLogo />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
        <SafeAreaView className="flex-1" style={{ backgroundColor: appBackground }}>
          <StatusBar style={isLightMode ? 'dark' : 'light'} backgroundColor={appBackground} translucent={false} />

          <View className="flex-1" style={{ backgroundColor: appBackground }}>
          <View className="border-b px-4 py-4" style={{ backgroundColor: appSurface, borderBottomColor: appBorder }}>
            <View className="flex-row items-center gap-3">
              <View className="items-center justify-center rounded-xl border px-3 py-3" style={{ borderColor: appBorder, backgroundColor: appBackground }}>
                {headerPreferences.logoSource ? (
                  <Image source={{ uri: headerPreferences.logoSource }} style={{ width: 24, height: 24, borderRadius: 10 }} resizeMode="cover" />
                ) : (
                  <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#FFB020" />
                )}
              </View>
              <View>
                <Typography className="text-lg font-bold text-white" style={{ color: appText }}>{headerPreferences.appName}</Typography>
                <Typography className="text-sm text-slate-400" style={{ color: appSubText }}>{headerPreferences.headerSubtitle}</Typography>
              </View>
            </View>
          </View>

          <BolsasScreen onHeaderPreferencesChange={handleHeaderPreferencesChange} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}



