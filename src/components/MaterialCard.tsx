import { Pressable, Text, View } from 'react-native';
import { calculateRequestedUnit, calculateRequestedValue, formatNumber } from '../utils/calculations';
import type { AccentPreset, MaterialOption, MaterialCalcMode, MaterialUnit } from '../types/logistics';
import AppIcon from './AppIcon';

type MaterialCardProps = {
  option: MaterialOption;
  selected: boolean;
  accent: AccentPreset;
  onPress: () => void;
  categoryLabel: (category: MaterialOption['category']) => string;
  modeLabel: (mode: MaterialCalcMode) => string;
  unitLabel: (unit: MaterialUnit) => string;
  getResultLabel: (material: MaterialOption) => string;
};

export default function MaterialCard({
  option,
  selected,
  accent,
  onPress,
  categoryLabel,
  modeLabel,
  unitLabel,
  getResultLabel,
}: MaterialCardProps) {
  const resultValue = calculateRequestedValue(option);
  const resultUnit = calculateRequestedUnit(option);
  const categoryIcon = option.category === 'bolsas' ? 'bolsas' : option.category === 'cajas' ? 'cajas' : 'otros';

  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 rounded-ind border px-3 py-3 ${selected ? 'bg-[#2F3740]' : 'border-industrial-border bg-industrial-surface'}`}
      style={({ pressed }) => [selected ? { borderColor: accent.border } : undefined, pressed ? { opacity: 0.82 } : undefined]}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <View className="items-center justify-center rounded-ind border border-industrial-border bg-industrial-bg px-2 py-2">
              <AppIcon name={categoryIcon} size={12} />
            </View>
            <View className="flex-1">
              <Text className={`text-base font-semibold ${selected ? 'text-white' : 'text-slate-100'}`}>{option.title || 'Material sin nombre'}</Text>
              <Text className="text-[13px] uppercase tracking-[0.16em] text-industrial-muted">{categoryLabel(option.category)}</Text>
            </View>
          </View>

          <View className="mt-2 flex-row flex-wrap gap-1.5">
            <View className="rounded-ind border border-industrial-border bg-industrial-bg px-2 py-1">
              <Text className="text-[13px] font-medium text-industrial-muted">{modeLabel(option.calcMode)}</Text>
            </View>
            <View className="rounded-ind border border-industrial-border bg-industrial-bg px-2 py-1">
              <Text className="text-[13px] font-medium text-industrial-muted">Unidad: {unitLabel(option.requestUnit)}</Text>
            </View>
          </View>
        </View>

        <View className="items-end">
          <Text className="text-[13px] uppercase tracking-[0.18em] text-industrial-muted">{getResultLabel(option)}</Text>
          <Text className={`mt-1 text-2xl font-bold ${selected ? 'text-white' : 'text-slate-100'}`}>
            {formatNumber(resultValue)}
          </Text>
          <Text className="text-xs font-medium" style={{ color: accent.soft }}>{unitLabel(resultUnit)}</Text>
        </View>
      </View>
    </Pressable>
  );
}
