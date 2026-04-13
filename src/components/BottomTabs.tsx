import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import BolsasScreen from '../screens/BolsasScreen';
import RibbonScreen from '../screens/RibbonScreen';

type TabKey = 'ribbon' | 'bolsas';

type TabItem = {
  key: TabKey;
  label: string;
};

const tabs: TabItem[] = [
  { key: 'ribbon', label: 'Ribbon' },
  { key: 'bolsas', label: 'Bolsas' },
];

export default function BottomTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>('ribbon');

  const ActiveScreen = useMemo(() => {
    return activeTab === 'ribbon' ? RibbonScreen : BolsasScreen;
  }, [activeTab]);

  return (
    <View className="flex-1 bg-slate-100">
      <ActiveScreen />

      <View className="absolute bottom-0 left-0 right-0 px-4 pb-4">
        <View className="flex-row rounded-full bg-white p-2 shadow-soft">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-full py-3 ${
                  isActive ? 'bg-brand-800' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-center text-base font-semibold ${
                    isActive ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}