import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { convertFromKg, convertToKg, isNonEmptyPositive, parseOptionalPositiveNumber } from '../utils/calculations';
import type { AccentPreset, MaterialOption, MaterialUnit } from '../types/logistics';

const WARNING_COLORS = {
  bg: '#EAF2FF',
  border: '#4D8DE8',
};

type ConfigRowProps = {
  item: MaterialOption;
  accent: AccentPreset;
  accentTextColor: string;
  theme: {
    panelBg: string;
    panelAltBg: string;
    border: string;
    text: string;
    muted: string;
    inputBg: string;
    inputBorder: string;
  };
  onChange: (id: string, patch: Partial<MaterialOption>) => void;
  onDelete: (id: string) => void;
  categoryIcon: (category: MaterialOption['category']) => keyof typeof MaterialCommunityIcons.glyphMap;
  unitLabel: (unit: MaterialUnit) => string;
};

export default function ConfigRow({ item, accent, accentTextColor, theme, onChange, onDelete, categoryIcon, unitLabel }: ConfigRowProps) {
  const invalidWeight = item.calcMode === 'bags' && item.weightPer100Kg <= 0;
  const displayWeight = convertFromKg(item.weightPer100Kg, item.weightUnit);

  return (
    <View className="mb-3 rounded-2xl border px-4 py-4 shadow-sm" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="h-5 w-5 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
            <MaterialCommunityIcons name={categoryIcon(item.category)} size={16} color={accent.color} />
          </View>
          <Text className="text-sm font-semibold" style={{ color: theme.text }}>{item.title || 'Material'}</Text>
        </View>
        <Pressable
          onPress={() => onDelete(item.id)}
          className="min-h-[44px] items-center justify-center rounded-pill border px-3 py-1"
          style={({ pressed }) => [
            { borderColor: accent.border, backgroundColor: theme.panelAltBg },
            pressed ? { opacity: 0.8 } : undefined,
          ]}
        >
          <Text className="text-xs font-semibold tracking-[0.04em]" style={{ color: theme.text }}>Eliminar</Text>
        </Pressable>
      </View>

      <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre</Text>
      <TextInput
        value={item.title}
        onChangeText={(value) => onChange(item.id, { title: value })}
        placeholder="Nombre del material"
        placeholderTextColor={theme.muted}
        className="mb-3 rounded-xl border px-3 py-3"
        style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
      />

      {item.calcMode === 'bags' ? (
        <>
          <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Unidad base del peso</Text>
          <View className="mb-3 flex-row gap-2">
            <Pressable
              onPress={() => onChange(item.id, { weightUnit: 'g' })}
              className="flex-1 min-h-[44px] items-center justify-center rounded-xl border px-3 py-3"
              style={item.weightUnit === 'g' ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
            >
              <Text className="text-center text-sm font-semibold" style={{ color: item.weightUnit === 'g' ? accentTextColor : theme.text }}>Gramos</Text>
            </Pressable>
            <Pressable
              onPress={() => onChange(item.id, { weightUnit: 'kg' })}
              className="flex-1 min-h-[44px] items-center justify-center rounded-xl border px-3 py-3"
              style={item.weightUnit === 'kg' ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
            >
              <Text className="text-center text-sm font-semibold" style={{ color: item.weightUnit === 'kg' ? accentTextColor : theme.text }}>Kilogramos</Text>
            </Pressable>
          </View>

          <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Peso por 100 piezas ({item.weightUnit})</Text>
          <TextInput
            value={displayWeight ? String(displayWeight) : ''}
            onChangeText={(value) => {
              const parsed = parseOptionalPositiveNumber(value);
              onChange(item.id, { weightPer100Kg: convertToKg(parsed, item.weightUnit) });
            }}
            keyboardType="decimal-pad"
            placeholder={item.weightUnit === 'g' ? 'Ej. 450' : 'Ej. 0.450'}
            placeholderTextColor={theme.muted}
            className="rounded-xl border px-3 py-3"
            style={{
              backgroundColor: invalidWeight ? WARNING_COLORS.bg : theme.inputBg,
              borderColor: invalidWeight ? WARNING_COLORS.border : theme.inputBorder,
              color: theme.text,
            }}
          />
        </>
      ) : null}

      {item.calcMode === 'other' ? (
        <>
          <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Unidad de solicitud</Text>
          <View className="flex-row gap-2">
            {(['l', 'kg', 'g'] as const).map((unit) => {
              const active = item.requestUnit === unit;

              return (
                <Pressable
                  key={unit}
                  onPress={() => onChange(item.id, { requestUnit: unit })}
                  className="flex-1 min-h-[44px] items-center justify-center rounded-xl border px-3 py-3"
                  style={active ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
                >
                  <Text className="text-center text-sm font-semibold" style={{ color: active ? accentTextColor : theme.text }}>{unitLabel(unit)}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {item.calcMode === 'pieces' ? (
        <View className="mt-1 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
          <Text className="text-xs" style={{ color: theme.muted }}>Se solicitará por piezas.</Text>
        </View>
      ) : null}
    </View>
  );
}
