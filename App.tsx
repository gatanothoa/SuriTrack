import './global.css';

import { useEffect, useState } from 'react';
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
};

const DEFAULT_HEADER_PREFERENCES: HeaderPreferences = {
  appName: 'SurtiTrack',
  headerSubtitle: 'Solicitud logística corporativa',
  logoSource: '',
};

function StartupLogo() {

  return (
    <View className="flex-1 items-center justify-center bg-black px-6">
      <RNStatusBar barStyle="light-content" />

      <View className="w-full max-w-[320px] items-center">
        <View className="items-center rounded-[28px] border border-[#7CFF3A]/30 bg-[#050905] px-5 py-5 shadow-soft">
          <View className="items-center justify-center rounded-[20px] border border-[#7CFF3A]/30 bg-[#0a1405] p-2">
            <Image source={require('./assets/logo.png')} style={{ width: 210, height: 210, borderRadius: 14 }} resizeMode="cover" />
          </View>

          <Text className="mt-4 text-[13px] font-semibold tracking-[0.35em] text-[#7CFF3A]">SURTITRACK</Text>
          <Text className="mt-3 text-sm font-medium text-[#a9ff8b]">SurtiTrack</Text>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [headerPreferences, setHeaderPreferences] = useState<HeaderPreferences>(DEFAULT_HEADER_PREFERENCES);

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
        <SafeAreaView className="flex-1 bg-black">
          <StatusBar style="light" />
          <StartupLogo />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-[#0c1420]">
        <StatusBar style="light" />

        <View className="flex-1 bg-[#0c1420]">
          <View className="border-b border-[#26364a] bg-[#111c29] px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View className="items-center justify-center rounded-2xl bg-[#ef4444]/15 px-3 py-3">
                {headerPreferences.logoSource ? (
                  <Image source={{ uri: headerPreferences.logoSource }} style={{ width: 24, height: 24, borderRadius: 6 }} resizeMode="cover" />
                ) : (
                  <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#ef4444" />
                )}
              </View>
              <View>
                <Text className="text-lg font-bold text-white">{headerPreferences.appName}</Text>
                <Text className="text-sm text-slate-400">{headerPreferences.appName} · {headerPreferences.headerSubtitle}</Text>
              </View>
            </View>
          </View>

          <BolsasScreen
            onHeaderPreferencesChange={(nextPreferences) => {
              setHeaderPreferences((current) => ({
                ...current,
                appName: nextPreferences.appName,
                headerSubtitle: nextPreferences.headerSubtitle,
                logoSource: nextPreferences.logoSource,
              }));
            }}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
