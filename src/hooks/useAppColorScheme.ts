import { useColorScheme as useRNColorScheme } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_PREFERENCE_KEY = 'app.themeMode.preference';

/**
 * Hook que detecta automáticamente el tema del SO
 * y permite override manual con persistencia en AsyncStorage.
 * 
 * Precedencia:
 * 1. Preferencia guardada en AsyncStorage (si existe)
 * 2. Preferencia del SO (useColorScheme)
 * 3. Default: 'dark'
 */
export function useAppColorScheme() {
  const systemColorScheme = useRNColorScheme();
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadThemePreference() {
      try {
        // Intentar cargar preferencia guardada
        const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
        
        if (isMounted) {
          if (stored === 'light' || stored === 'dark') {
            setTheme(stored);
          } else {
            // Si no hay preferencia guardada, usar SO
            const finalTheme = systemColorScheme === 'light' ? 'light' : 'dark';
            setTheme(finalTheme);
          }
          setIsLoading(false);
        }
      } catch (error) {
        // En caso de error, usar SO
        if (isMounted) {
          const finalTheme = systemColorScheme === 'light' ? 'light' : 'dark';
          setTheme(finalTheme);
          setIsLoading(false);
        }
      }
    }

    loadThemePreference();

    return () => {
      isMounted = false;
    };
  }, [systemColorScheme]);

  const setThemePreference = async (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, newTheme);
    } catch (error) {
      console.warn('Error saving theme preference:', error);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemePreference(newTheme);
  };

  return {
    theme: theme || 'dark',
    isLoading,
    setThemePreference,
    toggleTheme,
    systemTheme: systemColorScheme,
  };
}
