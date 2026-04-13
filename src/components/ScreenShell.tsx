import { ReactNode } from 'react';
import { SafeAreaView, View, Text } from 'react-native';

type ScreenShellProps = {
  title: string;
  children: ReactNode;
};

export default function ScreenShell({ title, children }: ScreenShellProps) {
  return (
    <SafeAreaView className="flex-1 bg-slate-100">
      <View className="bg-brand-800 px-6 pb-6 pt-4 shadow-soft">
        <Text className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">
          CalcPack
        </Text>
        <Text className="mt-2 text-3xl font-bold text-white">{title}</Text>
      </View>

      <View className="flex-1 px-5 py-6">{children}</View>
    </SafeAreaView>
  );
}