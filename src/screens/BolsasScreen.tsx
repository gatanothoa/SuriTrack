import { View, Text } from 'react-native';

import ScreenShell from '../components/ScreenShell';

export default function BolsasScreen() {
  return (
    <ScreenShell title="Bolsas">
      <View className="flex-1 items-center justify-center rounded-3xl bg-white px-6 py-10 shadow-soft">
        <View className="rounded-full bg-brand-100 px-4 py-2">
          <Text className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">
            Insumos Industriales
          </Text>
        </View>

        <Text className="mt-6 text-center text-3xl font-bold text-slate-800">
          Calculadora de Bolsas
        </Text>

        <Text className="mt-3 text-center text-base leading-6 text-slate-500">
          Calcula insumos de Bolsas con una interfaz limpia, rápida y lista para crecer.
        </Text>
      </View>
    </ScreenShell>
  );
}