import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as MailComposer from 'expo-mail-composer';
import * as ImagePicker from 'expo-image-picker';
import {
  calculateRequestedUnit,
  calculateRequestedValue,
  convertFromKg,
  convertToKg,
  formatNumber,
  formatPieces,
  formatWeight,
  isNonEmptyPositive,
  parseOptionalPositiveNumber,
} from '../utils/calculations';

type MaterialCategory = 'bolsas' | 'cajas' | 'otros';
type MaterialUnit = 'pieces' | 'kg' | 'g' | 'l';
type MaterialCalcMode = 'bags' | 'pieces' | 'other';

type MaterialOption = {
  id: string;
  category: MaterialCategory;
  title: string;
  calcMode: MaterialCalcMode;
  requestValue: number;
  requestUnit: MaterialUnit;
  weightPer100Kg: number;
  weightUnit: 'kg' | 'g';
};

type CartItem = {
  id: string;
  materialId: string;
  materialTitle: string;
  category: MaterialCategory;
  calcMode: MaterialCalcMode;
  requestValue: number;
  requestUnit: MaterialUnit;
  weightPer100Kg: number;
  weightUnit: 'kg' | 'g';
  calculatedValue: number;
  calculatedUnit: MaterialUnit;
  createdAt: string;
};

type StoredConfig = {
  selectedCategory: MaterialCategory;
  selectedMaterialId: string;
  recipientEmail: string;
  materials: MaterialOption[];
  cartItems: CartItem[];
  nextLeadNumber: number;
  preferences: AppPreferences;
};

type MaterialDraft = {
  title: string;
  weightInput: string;
  weightUnit: 'kg' | 'g';
  otherUnit: 'kg' | 'g' | 'l';
};

type AccentKey = 'red' | 'blue' | 'green' | 'amber';

type AppPreferences = {
  appName: string;
  headerSubtitle: string;
  folioPrefix: string;
  emailTemplate: string;
  emailNote: string;
  sheetNote: string;
  logoSource: string;
  logoLabel: string;
  accentKey: AccentKey;
};

type HeaderPreferencesPayload = Pick<AppPreferences, 'appName' | 'headerSubtitle' | 'logoSource'>;

const ACCENT_PRESETS: Record<AccentKey, { label: string; color: string; border: string; soft: string }> = {
  red: { label: 'Naranja', color: '#FFB020', border: '#FFB020', soft: '#FFD27A' },
  blue: { label: 'Cobalto', color: '#4D8BFF', border: '#7AA7FF', soft: '#BFD3FF' },
  green: { label: 'Oliva', color: '#7BAE4A', border: '#96C268', soft: '#CFE2AF' },
  amber: { label: 'Acero', color: '#8A95A3', border: '#A4AFBC', soft: '#D2D9E2' },
};

const DEFAULT_PREFERENCES: AppPreferences = {
  appName: 'SurtiTrack',
  headerSubtitle: 'Solicitud logística corporativa',
  folioPrefix: 'CS',
  emailTemplate: [
    '{greeting}',
    '',
    'Comparto la solicitud de material auxiliar.',
    '',
    'Folio: {folio}',
    'Total de materiales: {totalMaterials}',
    'Total de piezas: {totalPieces}',
    'Total de kilos a surtir: {totalKg} kg',
    '',
    '{attachmentNote}',
    '',
    'Saludos cordiales.',
    '{emailNote}',
  ].join('\n'),
  emailNote: 'Operación interna segura y trazable.',
  sheetNote: 'Registro interno para control y seguimiento.',
  logoSource: '',
  logoLabel: 'Logo de la empresa',
  accentKey: 'red',
};

const STORAGE_KEY = 'calcpack.materials.config.v5';
const LEGACY_STORAGE_KEYS = [
  'calcpack.materials.config.v4',
  'calcpack.materials.config.v3',
  'calcpack.bolsas.config.v1',
  'calcpack.bolsas.config.v2',
];

const CATEGORIES: Array<{ key: MaterialCategory; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: 'bolsas', label: 'Bolsas', icon: 'bag-suitcase-outline' },
  { key: 'cajas', label: 'Cajas', icon: 'package-variant-closed' },
  { key: 'otros', label: 'Otros', icon: 'cube-outline' },
];

const FOLIO_PREFIX_FALLBACK = 'CS';

function categoryLabel(category: MaterialCategory) {
  return CATEGORIES.find((item) => item.key === category)?.label ?? 'Otros';
}

function categoryIcon(category: MaterialCategory) {
  return CATEGORIES.find((item) => item.key === category)?.icon ?? 'cube-outline';
}

function unitLabel(unit: MaterialUnit) {
  switch (unit) {
    case 'pieces':
      return 'piezas';
    case 'kg':
      return 'kg';
    case 'g':
      return 'g';
    case 'l':
      return 'litros';
    default:
      return 'unidad';
  }
}

function modeLabel(mode: MaterialCalcMode) {
  switch (mode) {
    case 'bags':
      return 'Bolsa';
    case 'pieces':
      return 'Piezas';
    case 'other':
      return 'Otro';
    default:
      return 'Solicitud';
  }
}

function getInputLabel(material: MaterialOption) {
  if (material.calcMode === 'other') {
    return `Cantidad de ${unitLabel(material.requestUnit)}`;
  }

  return 'Cantidad de piezas';
}

function getResultLabel(material: MaterialOption) {
  switch (material.calcMode) {
    case 'bags':
      return 'Kilos a surtir';
    case 'pieces':
      return 'Piezas a solicitar';
    case 'other':
      return 'Cantidad a solicitar';
    default:
      return 'Resultado';
  }
}

function normalizeFolioPrefixInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
}

function sanitizeFolioPrefix(prefix: string) {
  return normalizeFolioPrefixInput(prefix) || FOLIO_PREFIX_FALLBACK;
}

function buildRequestCode(prefix: string, sequence: number) {
  const normalizedPrefix = sanitizeFolioPrefix(prefix);
  return `${normalizedPrefix}${String(sequence).padStart(3, '0')}`;
}

function getGreetingByHour(date: Date) {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Buenos dias equipo,';
  }

  if (hour < 19) {
    return 'Buenas tardes equipo,';
  }

  return 'Buenas noches equipo,';
}

function buildMailtoUrl(recipient: string, subject: string, body: string) {
  const query = new URLSearchParams({
    subject,
    body,
  }).toString();

  return `mailto:${recipient}?${query}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function sanitizeCsvCell(value: string) {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();

  if (/^[=+\-@]/.test(normalized)) {
    return `'${normalized}`;
  }

  return normalized;
}

function normalizePreferenceText(value: string, fallback: string) {
  const normalized = value.trim();
  return normalized || fallback;
}

function preferencesAreEqual(left: AppPreferences, right: AppPreferences) {
  return (
    left.appName === right.appName &&
    left.headerSubtitle === right.headerSubtitle &&
    left.folioPrefix === right.folioPrefix &&
    left.emailTemplate === right.emailTemplate &&
    left.emailNote === right.emailNote &&
    left.sheetNote === right.sheetNote &&
    left.logoSource === right.logoSource &&
    left.logoLabel === right.logoLabel &&
    left.accentKey === right.accentKey
  );
}

function renderEmailTemplate(template: string, context: { greeting: string; folio: string; totalMaterials: string; totalPieces: string; totalKg: string; attachmentNote: string; emailNote: string }) {
  return template
    .replace(/\{greeting\}/g, context.greeting)
    .replace(/\{folio\}/g, context.folio)
    .replace(/\{totalMaterials\}/g, context.totalMaterials)
    .replace(/\{totalPieces\}/g, context.totalPieces)
    .replace(/\{totalKg\}/g, context.totalKg)
    .replace(/\{attachmentNote\}/g, context.attachmentNote)
    .replace(/\{emailNote\}/g, context.emailNote);
}

function getLogoExtension(sourceUri: string, fileName?: string) {
  const nameExtension = fileName?.split('.').pop()?.trim().toLowerCase();

  if (nameExtension === 'jpeg') {
    return 'jpg';
  }

  if (nameExtension && nameExtension.length <= 5) {
    return nameExtension;
  }

  const dataUriMatch = sourceUri.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/i);

  if (dataUriMatch?.[1]) {
    const dataExtension = dataUriMatch[1].toLowerCase();
    return dataExtension === 'jpeg' ? 'jpg' : dataExtension;
  }

  return 'png';
}

async function persistLogoLocally(sourceUri: string, fileName?: string) {
  const normalized = sourceUri.trim();

  if (!normalized) {
    return { logoSource: '', logoLabel: DEFAULT_PREFERENCES.logoLabel };
  }

  const label = normalizePreferenceText(fileName ?? '', DEFAULT_PREFERENCES.logoLabel);

  if (Platform.OS === 'web') {
    return {
      logoSource: normalized,
      logoLabel: label,
    };
  }

  const localDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

  if (!localDirectory) {
    return {
      logoSource: normalized,
      logoLabel: label,
    };
  }

  if (normalized.startsWith(localDirectory)) {
    return {
      logoSource: normalized,
      logoLabel: label,
    };
  }

  const extension = getLogoExtension(normalized, fileName);
  const targetUri = `${localDirectory}company-logo-${Date.now()}.${extension}`;

  try {
    if (normalized.startsWith('data:image/')) {
      const base64 = normalized.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

      await FileSystem.writeAsStringAsync(targetUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return {
        logoSource: targetUri,
        logoLabel: label,
      };
    }

    if (/^https?:\/\//i.test(normalized)) {
      const downloaded = await FileSystem.downloadAsync(normalized, targetUri);

      return {
        logoSource: downloaded.uri,
        logoLabel: label,
      };
    }

    if (normalized.startsWith('file://') || normalized.startsWith('content://')) {
      try {
        await FileSystem.copyAsync({ from: normalized, to: targetUri });

        return {
          logoSource: targetUri,
          logoLabel: label,
        };
      } catch {
        const base64 = await FileSystem.readAsStringAsync(normalized, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await FileSystem.writeAsStringAsync(targetUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        return {
          logoSource: targetUri,
          logoLabel: label,
        };
      }
    }
  } catch {
    return {
      logoSource: normalized,
      logoLabel: label,
    };
  }

  return {
    logoSource: normalized,
    logoLabel: label,
  };
}

async function resolveLogoAsDataUri(logoSource: string) {
  let source = logoSource.trim();

  try {
    if (!source) {
      const logoAsset = Asset.fromModule(require('../../assets/logo.png'));
      await logoAsset.downloadAsync();
      source = logoAsset.localUri ?? logoAsset.uri;
    }

    if (source.startsWith('data:image/')) {
      return source;
    }

    const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

    if (/^https?:\/\//i.test(source)) {
      if (!baseDirectory) {
        return null;
      }

      const extension = getLogoExtension(source);
      const downloadTarget = `${baseDirectory}mail-logo-${Date.now()}.${extension}`;
      const downloaded = await FileSystem.downloadAsync(source, downloadTarget);
      source = downloaded.uri;
    }

    if (source.startsWith('content://')) {
      if (!baseDirectory) {
        return null;
      }

      const extension = getLogoExtension(source);
      const copyTarget = `${baseDirectory}mail-logo-content-${Date.now()}.${extension}`;

      try {
        await FileSystem.copyAsync({ from: source, to: copyTarget });
        source = copyTarget;
      } catch {
        return null;
      }
    }

    const base64 = await FileSystem.readAsStringAsync(source, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const extension = getLogoExtension(source);
    const mimeSubType = extension === 'jpg' ? 'jpeg' : extension;

    return `data:image/${mimeSubType};base64,${base64}`;
  } catch {
    return null;
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCsv(items: CartItem[], requestCode: string, preferences: AppPreferences) {
  const headers = [
    'Solicitud',
    'Categoria',
    'Material',
    'Modo',
    'Cantidad capturada',
    'Unidad capturada',
    'Resultado',
    'Unidad resultado',
    'Fecha',
  ];

  const metadataRows = [
    ['Marca', preferences.appName],
    ['Subtitulo', preferences.headerSubtitle],
    ['Nota del correo', preferences.emailNote],
    ['Nota del Excel', preferences.sheetNote],
    ['Logo', preferences.logoSource ? preferences.logoLabel : 'Predeterminado'],
  ];

  const rows = items.map((item) => [
    requestCode,
    categoryLabel(item.category),
    item.materialTitle,
    modeLabel(item.calcMode),
    formatNumber(item.requestValue),
    unitLabel(item.requestUnit),
    formatNumber(item.calculatedValue),
    unitLabel(item.calculatedUnit),
    new Date(item.createdAt).toLocaleString('es-MX'),
  ]);

  return [...metadataRows, [], headers, ...rows]
    .map((columns) => columns.map((column) => `"${sanitizeCsvCell(String(column)).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function createMaterialTemplate(category: MaterialCategory, index: number, requestUnit: MaterialUnit = 'kg'): MaterialOption {
  const base: MaterialOption = {
    id: `${category}-${Date.now()}-${index}`,
    category,
    title: `${categoryLabel(category)} ${index}`,
    calcMode: 'other',
    requestValue: 0,
    requestUnit,
    weightPer100Kg: 0,
    weightUnit: 'kg',
  };

  if (category === 'bolsas') {
    return {
      ...base,
      calcMode: 'bags',
      requestUnit: 'pieces',
      weightUnit: 'g',
    };
  }

  if (category === 'cajas') {
    return {
      ...base,
      calcMode: 'pieces',
      requestUnit: 'pieces',
      weightUnit: 'kg',
    };
  }

  return {
    ...base,
    calcMode: 'other',
    requestUnit,
    weightUnit: 'kg',
  };
}

function MaterialCard({
  option,
  selected,
  accent,
  onPress,
}: {
  option: MaterialOption;
  selected: boolean;
  accent: { color: string; border: string; soft: string };
  onPress: () => void;
}) {
  const resultValue = calculateRequestedValue(option);
  const resultUnit = calculateRequestedUnit(option);

  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 rounded-ind border px-3 py-3 ${selected ? 'bg-[#2F3740]' : 'border-industrial-border bg-industrial-surface'}`}
      style={({ pressed }) => [selected ? { borderColor: accent.border } : undefined, pressed ? { opacity: 0.9 } : undefined]}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <View className="items-center justify-center rounded-ind border border-industrial-border bg-industrial-bg px-2 py-2">
              <MaterialCommunityIcons name={categoryIcon(option.category)} size={18} color={accent.color} />
            </View>
            <View className="flex-1">
              <Text className={`text-base font-semibold ${selected ? 'text-white' : 'text-slate-100'}`}>{option.title || 'Material sin nombre'}</Text>
              <Text className="text-[11px] uppercase tracking-[0.16em] text-industrial-muted">{categoryLabel(option.category)}</Text>
            </View>
          </View>

          <View className="mt-2 flex-row flex-wrap gap-1.5">
            <View className="rounded-ind border border-industrial-border bg-industrial-bg px-2 py-1">
              <Text className="text-[11px] font-medium text-industrial-muted">{modeLabel(option.calcMode)}</Text>
            </View>
            <View className="rounded-ind border border-industrial-border bg-industrial-bg px-2 py-1">
              <Text className="text-[11px] font-medium text-industrial-muted">Unidad: {unitLabel(option.requestUnit)}</Text>
            </View>
          </View>
        </View>

        <View className="items-end">
          <Text className="text-[10px] uppercase tracking-[0.18em] text-industrial-muted">{getResultLabel(option)}</Text>
          <Text className={`mt-1 text-2xl font-bold ${selected ? 'text-white' : 'text-slate-100'}`}>
            {formatNumber(resultValue)}
          </Text>
          <Text className="text-xs font-medium" style={{ color: accent.soft }}>{unitLabel(resultUnit)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ConfigRow({
  item,
  accent,
  onChange,
  onDelete,
}: {
  item: MaterialOption;
  accent: { color: string; border: string; soft: string };
  onChange: (id: string, patch: Partial<MaterialOption>) => void;
  onDelete: (id: string) => void;
}) {
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
              style={item.weightUnit === 'g' ? { backgroundColor: '#4D8BFF', borderColor: '#4D8BFF' } : undefined}
            >
              <Text className={`text-center text-sm font-semibold ${item.weightUnit === 'g' ? 'text-white' : 'text-slate-300'}`}>Gramos</Text>
            </Pressable>
            <Pressable
              onPress={() => onChange(item.id, { weightUnit: 'kg' })}
              className={`flex-1 rounded-ind px-3 py-3 ${item.weightUnit === 'kg' ? '' : 'bg-industrial-bg border border-industrial-border'}`}
              style={item.weightUnit === 'kg' ? { backgroundColor: '#4D8BFF', borderColor: '#4D8BFF' } : undefined}
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
                  style={active ? { backgroundColor: '#4D8BFF', borderColor: '#4D8BFF' } : undefined}
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
          <Text className="text-xs text-slate-400">Se solicitará por piezas.</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function BolsasScreen({
  onHeaderPreferencesChange,
}: {
  onHeaderPreferencesChange?: (preferences: HeaderPreferencesPayload) => void;
} = {}) {
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory>('bolsas');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);
  const [nextLeadNumber, setNextLeadNumber] = useState(0);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [draftPreferences, setDraftPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [drafts, setDrafts] = useState<Record<MaterialCategory, MaterialDraft>>({
    bolsas: { title: '', weightInput: '', weightUnit: 'g', otherUnit: 'kg' },
    cajas: { title: '', weightInput: '', weightUnit: 'kg', otherUnit: 'kg' },
    otros: { title: '', weightInput: '', weightUnit: 'kg', otherUnit: 'kg' },
  });

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timer = setTimeout(() => setStatusMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    let isMounted = true;

    async function loadStoredConfig() {
      try {
        await AsyncStorage.multiRemove(LEGACY_STORAGE_KEYS);
        const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

        if (!isMounted) {
          return;
        }

        if (!storedValue) {
          setIsLoading(false);
          return;
        }

        const parsed = JSON.parse(storedValue) as Partial<StoredConfig>;

        if (parsed.selectedCategory && CATEGORIES.some((item) => item.key === parsed.selectedCategory)) {
          setSelectedCategory(parsed.selectedCategory);
        }

        if (typeof parsed.selectedMaterialId === 'string') {
          setSelectedMaterialId(parsed.selectedMaterialId);
        }

        if (typeof parsed.recipientEmail === 'string') {
          setRecipientEmail(parsed.recipientEmail);
        }

        if (Array.isArray(parsed.materials)) {
          setMaterials(
            parsed.materials
              .filter(
                (item): item is MaterialOption =>
                  typeof item.id === 'string' &&
                  typeof item.title === 'string' &&
                  (item.category === 'bolsas' || item.category === 'cajas' || item.category === 'otros')
              )
              .map((item) => ({
                ...item,
                calcMode: item.calcMode === 'bags' || item.calcMode === 'pieces' || item.calcMode === 'other' ? item.calcMode : 'other',
                requestValue: typeof item.requestValue === 'number' ? item.requestValue : 0,
                requestUnit:
                  item.requestUnit === 'pieces' || item.requestUnit === 'kg' || item.requestUnit === 'g' || item.requestUnit === 'l'
                    ? item.requestUnit
                    : item.category === 'bolsas' || item.category === 'cajas'
                      ? 'pieces'
                      : 'kg',
                weightPer100Kg: typeof item.weightPer100Kg === 'number' ? item.weightPer100Kg : 0,
                weightUnit: item.weightUnit === 'kg' || item.weightUnit === 'g' ? item.weightUnit : 'kg',
              }))
          );
        }

        if (Array.isArray(parsed.cartItems)) {
          setCartItems(
            parsed.cartItems
              .filter(
                (item): item is CartItem =>
                  typeof item.id === 'string' &&
                  typeof item.materialId === 'string' &&
                  typeof item.materialTitle === 'string' &&
                  typeof item.requestValue === 'number' &&
                  typeof item.weightPer100Kg === 'number' &&
                  typeof item.calculatedValue === 'number' &&
                  typeof item.createdAt === 'string' &&
                  (item.category === 'bolsas' || item.category === 'cajas' || item.category === 'otros')
              )
              .map((item) => ({
                ...item,
                calcMode: item.calcMode === 'bags' || item.calcMode === 'pieces' || item.calcMode === 'other' ? item.calcMode : 'other',
                requestUnit:
                  item.requestUnit === 'pieces' || item.requestUnit === 'kg' || item.requestUnit === 'g' || item.requestUnit === 'l'
                    ? item.requestUnit
                    : 'pieces',
                calculatedUnit:
                  item.calculatedUnit === 'pieces' || item.calculatedUnit === 'kg' || item.calculatedUnit === 'g' || item.calculatedUnit === 'l'
                    ? item.calculatedUnit
                    : 'pieces',
                weightUnit: item.weightUnit === 'kg' || item.weightUnit === 'g' ? item.weightUnit : 'kg',
              }))
          );
        }

        if (typeof parsed.nextLeadNumber === 'number' && parsed.nextLeadNumber >= 0) {
          setNextLeadNumber(parsed.nextLeadNumber);
        }

        if (parsed.preferences) {
          const nextPreferences: AppPreferences = {
            appName:
              typeof parsed.preferences.appName === 'string' && parsed.preferences.appName.trim()
                ? parsed.preferences.appName.trim()
                : DEFAULT_PREFERENCES.appName,
            headerSubtitle:
              typeof parsed.preferences.headerSubtitle === 'string' && parsed.preferences.headerSubtitle.trim()
                ? parsed.preferences.headerSubtitle.trim()
                : DEFAULT_PREFERENCES.headerSubtitle,
            folioPrefix:
              typeof parsed.preferences.folioPrefix === 'string' && parsed.preferences.folioPrefix.trim()
                ? sanitizeFolioPrefix(parsed.preferences.folioPrefix)
                : DEFAULT_PREFERENCES.folioPrefix,
            emailTemplate:
              typeof parsed.preferences.emailTemplate === 'string' && parsed.preferences.emailTemplate.trim()
                ? parsed.preferences.emailTemplate
                : DEFAULT_PREFERENCES.emailTemplate,
            emailNote:
              typeof parsed.preferences.emailNote === 'string' && parsed.preferences.emailNote.trim()
                ? parsed.preferences.emailNote.trim()
                : DEFAULT_PREFERENCES.emailNote,
            sheetNote:
              typeof parsed.preferences.sheetNote === 'string' && parsed.preferences.sheetNote.trim()
                ? parsed.preferences.sheetNote.trim()
                : DEFAULT_PREFERENCES.sheetNote,
            logoSource:
              typeof parsed.preferences.logoSource === 'string' && parsed.preferences.logoSource.trim()
                ? parsed.preferences.logoSource.trim()
                : DEFAULT_PREFERENCES.logoSource,
            logoLabel:
              typeof parsed.preferences.logoLabel === 'string' && parsed.preferences.logoLabel.trim()
                ? parsed.preferences.logoLabel.trim()
                : DEFAULT_PREFERENCES.logoLabel,
            accentKey:
              parsed.preferences.accentKey && ACCENT_PRESETS[parsed.preferences.accentKey]
                ? parsed.preferences.accentKey
                : DEFAULT_PREFERENCES.accentKey,
          };

          setPreferences(nextPreferences);
          setDraftPreferences(nextPreferences);
          onHeaderPreferencesChange?.({
            appName: nextPreferences.appName,
            headerSubtitle: nextPreferences.headerSubtitle,
            logoSource: nextPreferences.logoSource,
          });
        }

        setStatusMessage('Configuracion cargada');
        setStatusType('success');
      } catch {
        setStatusMessage('No se pudo cargar la configuracion guardada.');
        setStatusType('error');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadStoredConfig();

    return () => {
      isMounted = false;
    };
  }, [onHeaderPreferencesChange]);

  const currentMaterials = useMemo(
    () => materials.filter((item) => item.category === selectedCategory),
    [materials, selectedCategory]
  );

  useEffect(() => {
    if (currentMaterials.length === 0) {
      setSelectedMaterialId('');
      return;
    }

    if (!currentMaterials.some((item) => item.id === selectedMaterialId)) {
      setSelectedMaterialId(currentMaterials[0].id);
    }
  }, [currentMaterials, selectedMaterialId]);

  const selectedMaterial = useMemo(
    () => currentMaterials.find((item) => item.id === selectedMaterialId),
    [currentMaterials, selectedMaterialId]
  );

  const selectedResultValue = useMemo(() => {
    if (!selectedMaterial) {
      return 0;
    }

    return calculateRequestedValue(selectedMaterial);
  }, [selectedMaterial]);

  const selectedResultUnit = useMemo(() => {
    if (!selectedMaterial) {
      return 'pieces' as MaterialUnit;
    }

    return calculateRequestedUnit(selectedMaterial);
  }, [selectedMaterial]);

  const canSendEmail = useMemo(
    () => cartItems.length > 0 && isValidEmail(recipientEmail) && !isSendingEmail,
    [cartItems.length, isSendingEmail, recipientEmail]
  );

  const hasPendingPreferenceChanges = useMemo(
    () => !preferencesAreEqual(preferences, draftPreferences),
    [draftPreferences, preferences]
  );

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const payload: StoredConfig = {
      selectedCategory,
      selectedMaterialId,
      recipientEmail,
      materials,
      cartItems,
      nextLeadNumber,
      preferences,
    };

    const timer = setTimeout(() => {
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }, 350);

    return () => clearTimeout(timer);
  }, [cartItems, isLoading, materials, nextLeadNumber, preferences, recipientEmail, selectedCategory, selectedMaterialId]);

  const accent = ACCENT_PRESETS[preferences.accentKey];
  const accentStyle = { backgroundColor: accent.color };
  const accentBorderStyle = { borderColor: accent.border };
  const primaryActionStyle = { backgroundColor: '#FFB020' };

  async function savePreferences() {
    const persistedLogo = await persistLogoLocally(draftPreferences.logoSource, draftPreferences.logoLabel);

    const nextPreferences: AppPreferences = {
      appName: normalizePreferenceText(draftPreferences.appName, DEFAULT_PREFERENCES.appName),
      headerSubtitle: normalizePreferenceText(draftPreferences.headerSubtitle, DEFAULT_PREFERENCES.headerSubtitle),
      folioPrefix: sanitizeFolioPrefix(draftPreferences.folioPrefix),
      emailTemplate: normalizePreferenceText(draftPreferences.emailTemplate, DEFAULT_PREFERENCES.emailTemplate),
      emailNote: normalizePreferenceText(draftPreferences.emailNote, DEFAULT_PREFERENCES.emailNote),
      sheetNote: normalizePreferenceText(draftPreferences.sheetNote, DEFAULT_PREFERENCES.sheetNote),
      logoSource: persistedLogo.logoSource,
      logoLabel: normalizePreferenceText(persistedLogo.logoLabel, DEFAULT_PREFERENCES.logoLabel),
      accentKey: ACCENT_PRESETS[draftPreferences.accentKey] ? draftPreferences.accentKey : DEFAULT_PREFERENCES.accentKey,
    };

    setPreferences(nextPreferences);
    setDraftPreferences(nextPreferences);
    onHeaderPreferencesChange?.({
      appName: nextPreferences.appName,
      headerSubtitle: nextPreferences.headerSubtitle,
      logoSource: nextPreferences.logoSource,
    });
    setStatusMessage('Cambios de marca guardados.');
    setStatusType('success');
  }

  async function pickLogoFromDevice() {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') {
        Alert.alert('Carga de logo', 'No se pudo abrir el selector de archivos en este navegador.');
        return;
      }

      await new Promise<void>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = () => {
          const file = input.files?.[0];

          if (!file) {
            resolve();
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const resultValue = reader.result;

            if (typeof resultValue === 'string') {
              setDraftPreferences((current) => ({
                ...current,
                logoSource: resultValue,
                logoLabel: file.name,
              }));
            }

            resolve();
          };

          reader.onerror = () => resolve();
          reader.readAsDataURL(file);
        };

        input.click();
      });

      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Carga de logo', 'Se necesita permiso para acceder a la galería.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const asset = result.assets[0];
    const persistedLogo = await persistLogoLocally(asset.uri, asset.fileName ?? undefined);

    setDraftPreferences((current) => ({
      ...current,
      logoSource: persistedLogo.logoSource,
      logoLabel: persistedLogo.logoLabel,
    }));
  }

  function updateMaterialById(id: string, patch: Partial<MaterialOption>) {
    setMaterials((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function resetDraft(category: MaterialCategory) {
    setDrafts((current) => ({
      ...current,
      [category]: {
        title: '',
        weightInput: '',
        weightUnit: category === 'bolsas' ? 'g' : 'kg',
        otherUnit: 'kg',
      },
    }));
  }

  function addMaterialToCurrentCategory() {
    const draft = drafts[selectedCategory];
    const trimmedName = draft.title.trim();
    const index = materials.filter((item) => item.category === selectedCategory).length + 1;

    if (!trimmedName) {
      setStatusMessage('Ingresa el nombre del material antes de agregar.');
      setStatusType('error');
      return;
    }

    if (selectedCategory === 'bolsas') {
      const parsedWeight = parseOptionalPositiveNumber(draft.weightInput);
      const normalizedWeightKg = convertToKg(parsedWeight, draft.weightUnit);

      if (!isNonEmptyPositive(normalizedWeightKg)) {
        setStatusMessage('Ingresa un peso valido para 100 piezas antes de agregar.');
        setStatusType('error');
        return;
      }

      const next = createMaterialTemplate(selectedCategory, index);
      next.title = trimmedName;
      next.weightPer100Kg = normalizedWeightKg;
      next.weightUnit = draft.weightUnit;

      setMaterials((current) => [...current, next]);
      setSelectedMaterialId(next.id);
      resetDraft(selectedCategory);
      setStatusMessage(`Material agregado en ${categoryLabel(selectedCategory)}.`);
      setStatusType('success');
      return;
    }

    if (selectedCategory === 'cajas') {
      const next = createMaterialTemplate(selectedCategory, index, 'pieces');
      next.title = trimmedName;
      next.requestUnit = 'pieces';
      next.calcMode = 'pieces';

      setMaterials((current) => [...current, next]);
      setSelectedMaterialId(next.id);
      resetDraft(selectedCategory);
      setStatusMessage(`Material agregado en ${categoryLabel(selectedCategory)}.`);
      setStatusType('success');
      return;
    }

    const next = createMaterialTemplate(selectedCategory, index, draft.otherUnit);
    next.title = trimmedName;
    next.requestUnit = draft.otherUnit;
    next.calcMode = 'other';

    setMaterials((current) => [...current, next]);
    setSelectedMaterialId(next.id);
    resetDraft(selectedCategory);
    setStatusMessage(`Material agregado en ${categoryLabel(selectedCategory)}.`);
    setStatusType('success');
  }

  function removeMaterial(id: string) {
    setMaterials((current) => current.filter((item) => item.id !== id));
    setCartItems((current) => current.filter((item) => item.materialId !== id));

    if (selectedMaterialId === id) {
      setSelectedMaterialId('');
    }
  }

  function addToRequest() {
    if (!selectedMaterial) {
      setStatusMessage('Agrega un material en la categoria actual.');
      setStatusType('error');
      return;
    }

    const requestValue = selectedMaterial.requestValue;

    if (!isNonEmptyPositive(requestValue)) {
      setStatusMessage('Captura una cantidad valida antes de agregar a la solicitud.');
      setStatusType('error');
      return;
    }

    if (selectedMaterial.calcMode === 'bags' && !isNonEmptyPositive(selectedMaterial.weightPer100Kg)) {
      setStatusMessage('Configura el peso por 100 piezas antes de agregar.');
      setStatusType('error');
      return;
    }

    const calculatedValue = calculateRequestedValue(selectedMaterial);
    const calculatedUnit = calculateRequestedUnit(selectedMaterial);

    const next: CartItem = {
      id: `cart-${Date.now()}`,
      materialId: selectedMaterial.id,
      materialTitle: selectedMaterial.title,
      category: selectedMaterial.category,
      calcMode: selectedMaterial.calcMode,
      requestValue: selectedMaterial.requestValue,
      requestUnit: selectedMaterial.requestUnit,
      weightPer100Kg: selectedMaterial.weightPer100Kg,
      weightUnit: selectedMaterial.weightUnit,
      calculatedValue,
      calculatedUnit,
      createdAt: new Date().toISOString(),
    };

    setCartItems((current) => [next, ...current]);
    setStatusMessage('Solicitud agregada al resumen.');
    setStatusType('success');
  }

  function removeCartItem(id: string) {
    setCartItems((current) => current.filter((item) => item.id !== id));
  }

  function clearCart() {
    if (cartItems.length === 0) {
      return;
    }

    Alert.alert('Vaciar solicitud', 'Se eliminaran todos los elementos del resumen.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Vaciar', style: 'destructive', onPress: () => setCartItems([]) },
    ]);
  }

  async function sendCartByEmail() {
    if (!recipientEmail.trim()) {
      setStatusMessage('Define un correo destino para enviar la solicitud.');
      setStatusType('error');
      return;
    }

    if (!isValidEmail(recipientEmail)) {
      setStatusMessage('El correo destino no tiene un formato valido.');
      setStatusType('error');
      return;
    }

    if (cartItems.length === 0) {
      setStatusMessage('El resumen esta vacio. Agrega al menos un material.');
      setStatusType('error');
      return;
    }

    try {
      setIsSendingEmail(true);
      const now = new Date();
      const requestCode = buildRequestCode(preferences.folioPrefix, nextLeadNumber);
      const totalItems = cartItems.length;
      const totalPieces = cartItems.reduce((sum, item) => sum + Math.ceil(item.requestValue), 0);
      const totalKg = cartItems.reduce((sum, item) => sum + (item.calculatedUnit === 'kg' ? item.calculatedValue : 0), 0);

      const attachmentSupported = Platform.OS !== 'web';
      const body = renderEmailTemplate(preferences.emailTemplate, {
        greeting: getGreetingByHour(now),
        folio: requestCode,
        totalMaterials: String(totalItems),
        totalPieces: formatPieces(totalPieces),
        totalKg: formatWeight(totalKg),
        attachmentNote: attachmentSupported
          ? 'En el archivo adjunto encontraran el detalle por tipo de material.'
          : 'En web no se adjunta archivo automaticamente; revisa el resumen del correo para generar la solicitud.',
        emailNote: preferences.emailNote,
      });
      const subject = `Solicitud de material auxiliar ${requestCode} ${now.toLocaleDateString('es-MX')}`;
      const bodyHtmlLines = body
        .split('\n')
        .map((line) => `<p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>`)
        .join('');

      if (Platform.OS === 'web') {
        const mailtoUrl = buildMailtoUrl(recipientEmail.trim(), subject, body);
        const canOpen = await Linking.canOpenURL(mailtoUrl);

        if (!canOpen) {
          setStatusMessage('No se detecto cliente de correo en el navegador.');
          setStatusType('error');
          return;
        }

        await Linking.openURL(mailtoUrl);
        setNextLeadNumber((current) => current + 1);
        setStatusMessage('Correo abierto. Folio reservado para evitar duplicados en web.');
        setStatusType('success');
        return;
      }

      const available = await MailComposer.isAvailableAsync();

      if (!available) {
        const mailtoUrl = buildMailtoUrl(recipientEmail.trim(), subject, body);
        const canOpen = await Linking.canOpenURL(mailtoUrl);

        if (!canOpen) {
          setStatusMessage('No hay app de correo disponible en este dispositivo.');
          setStatusType('error');
          return;
        }

        await Linking.openURL(mailtoUrl);
        setStatusMessage('Se abrio la app de correo sin adjunto.');
        setStatusType('success');
        return;
      }

      const csv = buildCsv(cartItems, requestCode, preferences);
      const fileName = `Solicitud_material_auxiliar_${requestCode}_${now.toISOString().slice(0, 10)}.csv`;
      const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

      if (!baseDirectory) {
        setStatusMessage('No se pudo acceder al almacenamiento temporal para el adjunto.');
        setStatusType('error');
        return;
      }

      const fileUri = `${baseDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const logoDataUri = await resolveLogoAsDataUri(preferences.logoSource);

      const htmlBody = `
        <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
          <div style="text-align:center; margin-bottom: 14px;">
            ${logoDataUri ? `<img src="${logoDataUri}" alt="SurtiTrack" style="width: 170px; max-width: 100%; border-radius: 10px; display: inline-block;" />` : ''}
          </div>
          ${bodyHtmlLines}
        </div>
      `;

      const composeResult = await MailComposer.composeAsync({
        recipients: [recipientEmail.trim()],
        subject,
        body: logoDataUri ? htmlBody : body,
        isHtml: Boolean(logoDataUri),
        attachments: [fileUri],
      });

      if (composeResult.status === MailComposer.MailComposerStatus.SENT || composeResult.status === MailComposer.MailComposerStatus.SAVED) {
        setNextLeadNumber((current) => current + 1);
        setStatusMessage('Solicitud preparada correctamente con adjunto CSV.');
        setStatusType('success');
      } else {
        setStatusMessage('Envio cancelado. El folio no se incremento.');
        setStatusType('error');
      }
    } catch {
      setStatusMessage('No se pudo preparar la solicitud.');
      setStatusType('error');
    } finally {
      setIsSendingEmail(false);
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-industrial-bg px-6">
        <View className="items-center gap-4 rounded-ind border border-industrial-border bg-industrial-surface px-6 py-8">
          <ActivityIndicator size="large" color="#FFB020" />
          <Text className="text-base font-semibold text-white">Cargando configuracion...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-industrial-bg" contentContainerClassName="px-4 pb-32 pt-4">
      <View className="w-full self-center rounded-ind border border-industrial-border bg-industrial-surface px-4 py-4">
        {statusMessage ? (
          <View className={`mb-4 rounded-ind border px-4 py-3 ${statusType === 'error' ? 'border-[#c2410c] bg-[#3a2414]' : 'border-emerald-500/40 bg-emerald-500/10'}`}>
            <Text className={`text-sm font-medium ${statusType === 'error' ? 'text-[#fed7aa]' : 'text-emerald-300'}`}>{statusMessage}</Text>
          </View>
        ) : null}

        <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{preferences.appName}</Text>
              <Text className="mt-1 text-2xl font-bold text-white">{preferences.headerSubtitle}</Text>
            </View>
            <View className="items-center justify-center rounded-ind border border-industrial-border px-3 py-3" style={{ borderColor: accent.border, backgroundColor: '#2A3138' }}>
              {preferences.logoSource ? (
                <Image source={{ uri: preferences.logoSource }} style={{ width: 48, height: 48, borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <MaterialCommunityIcons name="clipboard-text-outline" size={24} color={accent.color} />
              )}
            </View>
          </View>
          <Text className="mt-2 text-sm text-slate-400">
            {preferences.emailNote}
          </Text>
        </View>

        <View className="mb-3">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Tipo de material</Text>
          <View className="flex-row gap-2">
            {CATEGORIES.map((category) => {
              const active = category.key === selectedCategory;

              return (
                <Pressable
                  key={category.key}
                  onPress={() => setSelectedCategory(category.key)}
                  className={`flex-1 rounded-ind border px-3 py-3 ${active ? '' : 'border-industrial-border bg-industrial-bg'}`}
                  style={active ? { borderColor: '#4D8BFF', backgroundColor: '#4D8BFF' } : undefined}
                >
                  <View className="items-center gap-2">
                    <MaterialCommunityIcons name={category.icon} size={18} color={active ? '#ffffff' : '#cbd5e1'} />
                    <Text className={`text-center text-sm font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>
                      {category.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Alta de material</Text>
            <Text className="text-xs text-slate-500">{categoryLabel(selectedCategory)}</Text>
          </View>

          <Text className="mb-1 text-xs text-slate-400">Nombre</Text>
          <TextInput
            value={drafts[selectedCategory].title}
            onChangeText={(value) =>
              setDrafts((current) => ({
                ...current,
                [selectedCategory]: { ...current[selectedCategory], title: value },
              }))
            }
            placeholder={selectedCategory === 'otros' ? 'Ej. Material genérico' : 'Ej. Bolsa reciclada 60x90'}
            placeholderTextColor="#64748b"
            className="mb-3 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3 text-white"
          />

          {selectedCategory === 'bolsas' ? (
            <>
              <Text className="mb-1 text-xs text-slate-400">Unidad base del peso</Text>
              <View className="mb-3 flex-row gap-2">
                <Pressable
                  onPress={() =>
                    setDrafts((current) => ({
                      ...current,
                      bolsas: { ...current.bolsas, weightUnit: 'g' },
                    }))
                  }
                  className={`flex-1 rounded-ind px-3 py-3 ${drafts.bolsas.weightUnit === 'g' ? '' : 'bg-industrial-bg border border-industrial-border'}`}
                  style={drafts.bolsas.weightUnit === 'g' ? { backgroundColor: '#4D8BFF', borderColor: '#4D8BFF' } : undefined}
                >
                  <Text className={`text-center text-sm font-semibold ${drafts.bolsas.weightUnit === 'g' ? 'text-white' : 'text-slate-300'}`}>
                    Gramos
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setDrafts((current) => ({
                      ...current,
                      bolsas: { ...current.bolsas, weightUnit: 'kg' },
                    }))
                  }
                  className={`flex-1 rounded-ind px-3 py-3 ${drafts.bolsas.weightUnit === 'kg' ? '' : 'bg-industrial-bg border border-industrial-border'}`}
                  style={drafts.bolsas.weightUnit === 'kg' ? { backgroundColor: '#4D8BFF', borderColor: '#4D8BFF' } : undefined}
                >
                  <Text className={`text-center text-sm font-semibold ${drafts.bolsas.weightUnit === 'kg' ? 'text-white' : 'text-slate-300'}`}>
                    Kilogramos
                  </Text>
                </Pressable>
              </View>

              <Text className="mb-1 text-xs text-slate-400">Peso por 100 piezas ({drafts.bolsas.weightUnit})</Text>
              <TextInput
                value={drafts.bolsas.weightInput}
                onChangeText={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    bolsas: { ...current.bolsas, weightInput: value },
                  }))
                }
                keyboardType="decimal-pad"
                placeholder={drafts.bolsas.weightUnit === 'g' ? 'Ej. 450' : 'Ej. 0.450'}
                placeholderTextColor="#64748b"
                className="rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3 text-white"
              />
            </>
          ) : null}

          {selectedCategory === 'cajas' ? (
            <View className="rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3">
              <Text className="text-sm text-slate-300">Las cajas se solicitarán directamente por piezas.</Text>
            </View>
          ) : null}

          {selectedCategory === 'otros' ? (
            <>
              <Text className="mb-1 text-xs text-slate-400">Unidad de solicitud</Text>
              <View className="flex-row gap-2">
                {(['l', 'kg', 'g'] as const).map((unit) => {
                  const active = drafts.otros.otherUnit === unit;

                  return (
                    <Pressable
                      key={unit}
                      onPress={() =>
                        setDrafts((current) => ({
                          ...current,
                          otros: { ...current.otros, otherUnit: unit },
                        }))
                      }
                      className={`flex-1 rounded-ind px-3 py-3 ${active ? '' : 'bg-industrial-bg border border-industrial-border'}`}
                      style={active ? { backgroundColor: '#4D8BFF', borderColor: '#4D8BFF' } : undefined}
                    >
                      <Text className={`text-center text-sm font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>
                        {unitLabel(unit)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Pressable
            onPress={addMaterialToCurrentCategory}
            className="mt-4 rounded-ind bg-industrial-primary px-4 py-4"
            style={({ pressed }) => (pressed ? { opacity: 0.84 } : undefined)}
          >
            <View className="flex-row items-center justify-center gap-2">
              <MaterialCommunityIcons name="playlist-plus" size={18} color="#1E2329" />
              <Text className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-[#1E2329]">
                Agregar material en {categoryLabel(selectedCategory)}
              </Text>
            </View>
          </Pressable>
        </View>

        {currentMaterials.length === 0 ? (
          <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-5">
            <Text className="text-sm font-medium text-slate-200">No hay materiales en {categoryLabel(selectedCategory)}.</Text>
            <Text className="mt-1 text-xs text-slate-400">Agrega uno desde la sección superior para comenzar la solicitud.</Text>
          </View>
        ) : null}

        {currentMaterials.map((item) => (
          <MaterialCard
            key={item.id}
            option={item}
            selected={item.id === selectedMaterialId}
            accent={accent}
            onPress={() => setSelectedMaterialId(item.id)}
          />
        ))}

        <View className="mt-2 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            {selectedMaterial ? getInputLabel(selectedMaterial) : 'Cantidad'}
          </Text>
          <TextInput
            value={selectedMaterial ? String(selectedMaterial.requestValue || '') : ''}
            onChangeText={(value) => {
              if (!selectedMaterial) {
                return;
              }

              updateMaterialById(selectedMaterial.id, { requestValue: parseOptionalPositiveNumber(value) });
            }}
            keyboardType={selectedMaterial?.calcMode === 'other' ? 'decimal-pad' : 'numeric'}
            placeholder={
              selectedMaterial
                ? selectedMaterial.calcMode === 'other'
                  ? `Ej. 120 ${unitLabel(selectedMaterial.requestUnit)}`
                  : 'Ej. 1200'
                : 'Primero agrega y selecciona un material'
            }
            placeholderTextColor="#64748b"
            editable={Boolean(selectedMaterial)}
            className="rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4 text-xl font-semibold text-white"
          />
          <Text className="mt-2 text-xs text-slate-400">
            Captura la cantidad base y el sistema calcula el valor final según la categoría.
          </Text>
        </View>

        <View className="mt-4 rounded-ind border px-5 py-6" style={{ borderColor: accent.border, backgroundColor: '#2A3138' }}>
          <Text className="text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            {selectedMaterial ? getResultLabel(selectedMaterial) : 'Resultado'}
          </Text>
          <Text className="mt-2 text-center text-4xl font-bold text-white">
            {selectedMaterial ? formatNumber(selectedResultValue) : '0.000'}
          </Text>
          <Text className="mt-1 text-center text-xs" style={{ color: accent.soft }}>
            {selectedMaterial ? unitLabel(selectedResultUnit) : 'Selecciona o crea un material'}
          </Text>
          <Text className="mt-2 text-center text-xs text-slate-400">
            {selectedMaterial ? `Categoría activa: ${categoryLabel(selectedMaterial.category)} · ${selectedMaterial.title}` : 'Sin material seleccionado'}
          </Text>
        </View>

        <Pressable
          onPress={addToRequest}
          className="mt-4 rounded-ind bg-industrial-primary px-4 py-4"
          style={({ pressed }) => (pressed ? { opacity: 0.84 } : undefined)}
        >
          <View className="flex-row items-center justify-center gap-2">
            <MaterialCommunityIcons name="plus-box" size={20} color="#1E2329" />
            <Text className="text-center text-sm font-bold uppercase tracking-[0.18em] text-[#1E2329]">Agregar a la solicitud</Text>
          </View>
        </Pressable>

        <View className="mt-6">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="clipboard-list-outline" size={18} color={accent.color} />
              <Text className="text-xl font-semibold text-slate-100">Resumen de solicitud</Text>
            </View>
            <Text className="text-xs text-slate-400">Próximo folio: {buildRequestCode(preferences.folioPrefix, nextLeadNumber)}</Text>
          </View>

          <View className="rounded-ind border border-industrial-border bg-industrial-bg p-2">
            <View className="mb-2 rounded-ind border px-3 py-2" style={{ borderColor: accent.border, backgroundColor: '#232A31' }}>
              <View className="mb-2 flex-row items-center gap-2">
                <MaterialCommunityIcons name="email-fast-outline" size={16} color={accent.color} />
                <Text className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Destino de envío</Text>
              </View>
              <TextInput
                value={recipientEmail}
                onChangeText={setRecipientEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="correo@empresa.com"
                placeholderTextColor="#64748b"
                className="rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
              />
              <Text className={`mt-2 text-xs ${recipientEmail.trim().length === 0 || isValidEmail(recipientEmail) ? 'text-slate-400' : 'text-rose-300'}`}>
                {recipientEmail.trim().length === 0
                  ? 'Este correo se usará para enviar el resumen y se guarda localmente.'
                  : isValidEmail(recipientEmail)
                    ? 'Correo válido para envío.'
                    : 'Formato de correo no válido.'}
              </Text>
            </View>

            {cartItems.length === 0 ? (
              <View className="rounded-ind border border-dashed border-industrial-border px-3 py-4">
                <Text className="text-sm text-slate-400">Aún no hay materiales en el resumen.</Text>
              </View>
            ) : (
              cartItems.map((item) => (
                <View key={item.id} className="mb-1 rounded-ind border border-industrial-border bg-industrial-surface px-2 py-2">
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-white">{item.materialTitle}</Text>
                      <Text className="text-[11px] text-industrial-muted">
                        {categoryLabel(item.category)} · {modeLabel(item.calcMode)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] uppercase tracking-[0.12em] text-industrial-muted">Capt.</Text>
                      <Text className="text-sm font-semibold text-white">{formatNumber(item.requestValue)}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] uppercase tracking-[0.12em] text-industrial-muted">Res.</Text>
                      <Text className="text-sm font-semibold text-white">{formatNumber(item.calculatedValue)}</Text>
                    </View>
                    <Pressable
                      onPress={() => removeCartItem(item.id)}
                      className="rounded-ind border px-2 py-1"
                      style={({ pressed }) => [accentBorderStyle, pressed ? { opacity: 0.82 } : undefined]}
                    >
                      <Text className="text-[10px] font-semibold" style={{ color: accent.soft }}>Quitar</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <View className="mt-2 flex-row gap-2">
              <Pressable
                onPress={clearCart}
                className="flex-1 rounded-ind border border-industrial-border px-3 py-3"
                style={({ pressed }) => (pressed ? { opacity: 0.82 } : undefined)}
              >
                <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Vaciar solicitud</Text>
              </Pressable>
              <Pressable
                disabled={!canSendEmail}
                onPress={() => {
                  void sendCartByEmail();
                }}
                className={`flex-1 rounded-ind px-3 py-3 ${canSendEmail ? '' : 'bg-[#55606B]'}`}
                style={({ pressed }) => [canSendEmail ? primaryActionStyle : undefined, canSendEmail && pressed ? { opacity: 0.84 } : undefined]}
              >
                <Text className={`text-center text-xs font-semibold uppercase tracking-[0.16em] ${canSendEmail ? 'text-[#1E2329]' : 'text-zinc-300'}`}>
                  {isSendingEmail ? 'Enviando...' : 'Enviar solicitud'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View className="mt-4 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4">
          <Pressable onPress={() => setSettingsOpen((current) => !current)} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="tune-variant" size={18} color={accent.color} />
              <Text className="text-base font-semibold text-white">Personalización de app</Text>
            </View>
            <MaterialCommunityIcons name={settingsOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#cbd5e1" />
          </Pressable>

          {settingsOpen ? (
            <View className="mt-4">
              <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4">
                <View className="mb-3 flex-row items-center gap-2">
                  <MaterialCommunityIcons name="palette-outline" size={16} color={accent.color} />
                    <Text className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Marca, logo y exportación</Text>
                </View>

                <Text className="mb-1 text-xs text-slate-400">Nombre visible de la app</Text>
                <TextInput
                    value={draftPreferences.appName}
                  onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                      ...current,
                      appName: value,
                    }))
                  }
                  placeholder="SurtiTrack"
                  placeholderTextColor="#64748b"
                  className="mb-3 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                />

                <Text className="mb-1 text-xs text-slate-400">Subtítulo del encabezado</Text>
                <TextInput
                    value={draftPreferences.headerSubtitle}
                  onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                      ...current,
                      headerSubtitle: value,
                    }))
                  }
                  placeholder="Solicitud logística corporativa"
                  placeholderTextColor="#64748b"
                  className="mb-3 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                />

                <Text className="mb-1 text-xs text-slate-400">Prefijo del folio</Text>
                <TextInput
                  value={draftPreferences.folioPrefix}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      folioPrefix: normalizeFolioPrefixInput(value),
                    }))
                  }
                  placeholder="CS"
                  placeholderTextColor="#64748b"
                  className="mb-3 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                />
                <View className="mb-3 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3">
                  <Text className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Vista de folio</Text>
                  <Text className="mt-1 text-base font-semibold text-white">
                    {buildRequestCode(draftPreferences.folioPrefix, nextLeadNumber)}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-400">Prefijo permitido: A-Z, 0-9 y guion (máx. 8).</Text>
                </View>

                  <Text className="mb-1 text-xs text-slate-400">Texto al pie del correo</Text>
                <TextInput
                    value={draftPreferences.emailNote}
                  onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                      ...current,
                        emailNote: value,
                    }))
                  }
                  placeholder="Operación interna segura y trazable."
                  placeholderTextColor="#64748b"
                  className="mb-4 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                />

                <Text className="mb-1 text-xs text-slate-400">Machote del correo</Text>
                <TextInput
                  value={draftPreferences.emailTemplate}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      emailTemplate: value,
                    }))
                  }
                  multiline
                  numberOfLines={10}
                  textAlignVertical="top"
                  placeholder={DEFAULT_PREFERENCES.emailTemplate}
                  placeholderTextColor="#64748b"
                  className="mb-3 min-h-[220px] rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                />

                  <Text className="mb-1 text-xs text-slate-400">Texto para Excel / CSV</Text>
                  <TextInput
                    value={draftPreferences.sheetNote}
                    onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                        ...current,
                        sheetNote: value,
                      }))
                    }
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      placeholder="Registro interno para control y seguimiento."
                    placeholderTextColor="#64748b"
                      className="mb-3 min-h-[96px] rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                  />

                  <Text className="mb-1 text-xs text-slate-400">Logo de la empresa</Text>
                  <Text className="mb-3 text-xs text-slate-500">
                    Carga el logo desde la galería del dispositivo. La app lo guarda en local al presionar guardar.
                  </Text>

                  <View className="mb-3 flex-row gap-2">
                    <Pressable onPress={() => void pickLogoFromDevice()} className="flex-1 rounded-ind border border-industrial-border px-3 py-3">
                      <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                        Cargar desde galería
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setDraftPreferences((current) => ({
                          ...current,
                          logoSource: '',
                          logoLabel: DEFAULT_PREFERENCES.logoLabel,
                        }))
                      }
                      className="flex-1 rounded-ind border border-industrial-border px-3 py-3"
                    >
                      <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                        Quitar logo
                      </Text>
                    </Pressable>
                  </View>

                  <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-surface px-4 py-4">
                    <Text className="mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">Vista previa</Text>
                    <View className="flex-row items-center gap-3">
                      <View className="h-14 w-14 items-center justify-center rounded-ind bg-industrial-bg overflow-hidden">
                        {draftPreferences.logoSource ? (
                          <Image source={{ uri: draftPreferences.logoSource }} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />
                        ) : (
                          <MaterialCommunityIcons name="image-outline" size={22} color={accent.color} />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-white">{draftPreferences.logoLabel || 'Sin logo cargado'}</Text>
                        <Text className="mt-1 text-xs text-slate-400">
                          {draftPreferences.logoSource ? 'Se usará en app, correo y exportación cuando guardes.' : 'Todavía no hay un logo personalizado.'}
                        </Text>
                      </View>
                    </View>
                  </View>

                <Text className="mb-2 text-xs text-slate-400">Color de acento</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(Object.keys(ACCENT_PRESETS) as AccentKey[]).map((key) => {
                    const active = draftPreferences.accentKey === key;
                    const preset = ACCENT_PRESETS[key];

                    return (
                      <Pressable
                        key={key}
                        onPress={() =>
                            setDraftPreferences((current) => ({
                            ...current,
                            accentKey: key,
                          }))
                        }
                        className={`rounded-ind border px-3 py-2 ${active ? 'bg-industrial-surface' : 'bg-transparent'}`}
                        style={{ borderColor: preset.border }}
                      >
                        <Text className="text-xs font-semibold text-white">{preset.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                  <View className="mt-4 flex-row items-center justify-between gap-3">
                    <Text className={`text-xs font-medium ${hasPendingPreferenceChanges ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {hasPendingPreferenceChanges ? 'Hay cambios sin guardar.' : 'Configuración guardada.'}
                    </Text>
                    <Pressable
                      onPress={savePreferences}
                      className="rounded-ind px-4 py-3"
                      style={({ pressed }) => [accentStyle, pressed ? { opacity: 0.84 } : undefined]}
                    >
                      <Text className="text-xs font-semibold uppercase tracking-[0.18em] text-white">Guardar cambios</Text>
                    </Pressable>
                  </View>
              </View>

              {currentMaterials.map((item) => (
                <ConfigRow key={item.id} item={item} accent={accent} onChange={updateMaterialById} onDelete={removeMaterial} />
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

