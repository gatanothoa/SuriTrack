import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { calculateRequestedUnit, calculateRequestedValue, formatNumber } from '../utils/calculations';
import type { AccentPreset, MaterialOption, MaterialCalcMode, MaterialUnit } from '../types/logistics';

type MaterialCardProps = {
  option: MaterialOption;
  selected: boolean;
  accent: AccentPreset;
  accentTextColor: string;
  theme: {
    panelBg: string;
    panelAltBg: string;
    border: string;
    text: string;
    muted: string;
  };
  onPress: () => void;
  categoryIcon: (category: MaterialOption['category']) => keyof typeof MaterialCommunityIcons.glyphMap;
  categoryLabel: (category: MaterialOption['category']) => string;
  modeLabel: (mode: MaterialCalcMode) => string;
  unitLabel: (unit: MaterialUnit) => string;
  getResultLabel: (material: MaterialOption) => string;
};

export default function MaterialCard({
  option,
  selected,
  accent,
  accentTextColor,
  theme,
  onPress,
  categoryIcon,
  categoryLabel,
  modeLabel,
  unitLabel,
  getResultLabel,
}: MaterialCardProps) {
  const resultValue = calculateRequestedValue(option);
  const resultUnit = calculateRequestedUnit(option);

  return (
    <Pressable
      onPress={onPress}
      className="mb-2 rounded-card border px-4 py-3"
      style={({ pressed }) => [
        { backgroundColor: selected ? theme.panelAltBg : theme.panelBg, borderColor: selected ? accent.border : theme.border },
        pressed ? { opacity: 0.82 } : undefined,
      ]}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <View className="items-center justify-center rounded-ind border px-2 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <MaterialCommunityIcons name={categoryIcon(option.category)} size={18} color={selected ? accentTextColor : accent.color} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold" style={{ color: theme.text }}>{option.title || 'Material sin nombre'}</Text>
              <Text className="text-[13px] tracking-[0.05em]" style={{ color: theme.muted }}>{categoryLabel(option.category)}</Text>
            </View>
          </View>

          <View className="mt-2 flex-row flex-wrap gap-1.5">
            <View className="rounded-pill border px-2 py-1" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Text className="text-[13px] font-medium" style={{ color: theme.muted }}>{modeLabel(option.calcMode)}</Text>
            </View>
            <View className="rounded-pill border px-2 py-1" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Text className="text-[13px] font-medium" style={{ color: theme.muted }}>Unidad: {unitLabel(option.requestUnit)}</Text>
            </View>
          </View>
        </View>

        <View className="items-end">
          <Text className="text-[13px] tracking-[0.06em]" style={{ color: theme.muted }}>{getResultLabel(option)}</Text>
          <Text className="mt-1 text-2xl font-bold" style={{ color: theme.text }}>
            {formatNumber(resultValue)}
          </Text>
          <Text className="text-xs font-medium" style={{ color: accent.soft }}>{unitLabel(resultUnit)}</Text>
        </View>
      </View>
    </Pressable>
  );
}
