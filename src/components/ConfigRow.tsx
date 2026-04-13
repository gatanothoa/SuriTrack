import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { convertFromKg, convertToKg, isNonEmptyPositive, parseOptionalPositiveNumber } from '../utils/calculations';
import type { AccentPreset, MaterialCategory, MaterialOption, MaterialUnit } from '../types/logistics';

type ConfigRowProps = {
  item: MaterialOption;
  accent: AccentPreset;
  onChange: (id: string, patch: Partial<MaterialOption>) => void;
  onDelete: (id: string) => void;
  categoryIcon: (category: MaterialCategory) => keyof typeof MaterialCommunityIcons.glyphMap;
  unitLabel: (unit: MaterialUnit) => string;
};

export default function ConfigRow({ item, accent, onChange, onDelete, categoryIcon, unitLabel }: ConfigRowProps) {
  const invalidWeight = item.calcMode === 'bags' && item.weightPer100Kg <= 0;
  const displayWeight = convertFromKg(item.weightPer100Kg, item.weightUnit);

  return (
    <View className="mb-3 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <MaterialCommunityIcons name={categoryIcon(item.category)} size={16} color={accent.color} />
          <Text className="text-sm font-semibold text-slate-100">{item.title || 'Material'}</Text>
        </View>
        <Pressable onPress={() => onDelete(item.id)} className="rounded-ind border px-3 py-1" style={{ borderColor: accent.border }}>
          <Text className="text-xs font-semibold" style={{ color: accent.soft }}>Eliminar</Text>
        </Pressable>
      </View>

      <Text className="mb-1 text-xs text-slate-400">Nombre</Text>
      <TextInput
        value={item.title}
        onChangeText={(value) => onChange(item.id, { title: value })}
        placeholder="Nombre del material"
        placeholderTextColor="#64748b"
        className="mb-3 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3 text-white"
      />

      {item.calcMode === 'bags' ? (
        <>
          <Text className="mb-1 text-xs text-slate-400">Unidad base del peso</Text>
          <View className="mb-3 flex-row gap-2">
            <Pressable
              onPress={() => onChange(item.id, { weightUnit: 'g' })}
              className={`flex-1 rounded-ind px-3 py-3 ${item.weightUnit === 'g' ? '' : 'bg-industrial-bg border border-industrial-border'}`}
              style={item.weightUnit === 'g' ? { backgroundColor: accent.color, borderColor: accent.border } : undefined}
            >
              <Text className={`text-center text-sm font-semibold ${item.weightUnit === 'g' ? 'text-white' : 'text-slate-300'}`}>Gramos</Text>
            </Pressable>
            <Pressable
              onPress={() => onChange(item.id, { weightUnit: 'kg' })}
              className={`flex-1 rounded-ind px-3 py-3 ${item.weightUnit === 'kg' ? '' : 'bg-industrial-bg border border-industrial-border'}`}
              style={item.weightUnit === 'kg' ? { backgroundColor: accent.color, borderColor: accent.border } : undefined}
            >
              <Text className={`text-center text-sm font-semibold ${item.weightUnit === 'kg' ? 'text-white' : 'text-slate-300'}`}>Kilogramos</Text>
            </Pressable>
          </View>

          <Text className="mb-1 text-xs text-slate-400">Peso por 100 piezas ({item.weightUnit})</Text>
          <TextInput
            value={displayWeight ? String(displayWeight) : ''}
            onChangeText={(value) => {
              const parsed = parseOptionalPositiveNumber(value);
              onChange(item.id, { weightPer100Kg: convertToKg(parsed, item.weightUnit) });
            }}
            keyboardType="decimal-pad"
            placeholder={item.weightUnit === 'g' ? 'Ej. 450' : 'Ej. 0.450'}
            placeholderTextColor="#64748b"
            className={`rounded-ind border px-3 py-3 text-white ${invalidWeight ? 'border-[#FFB020] bg-[#2a151a]' : 'border-industrial-border bg-industrial-bg'}`}
          />
        </>
      ) : null}

      {item.calcMode === 'other' ? (
        <>
          <Text className="mb-1 text-xs text-slate-400">Unidad de solicitud</Text>
          <View className="flex-row gap-2">
            {(['l', 'kg', 'g'] as const).map((unit) => {
              const active = item.requestUnit === unit;

              return (
                <Pressable
                  key={unit}
                  onPress={() => onChange(item.id, { requestUnit: unit })}
                  className={`flex-1 rounded-ind px-3 py-3 ${active ? '' : 'bg-industrial-bg border border-industrial-border'}`}
                  style={active ? { backgroundColor: accent.color, borderColor: accent.border } : undefined}
                >
                  <Text className={`text-center text-sm font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>{unitLabel(unit)}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {item.calcMode === 'pieces' ? (
        <View className="mt-1 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-2">
          <Text className="text-xs text-slate-400">Se solicitara por piezas.</Text>
        </View>
      ) : null}
    </View>
  );
}
