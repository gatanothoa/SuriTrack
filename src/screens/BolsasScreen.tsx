import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import {
  calculateRequestedUnit,
  calculateRequestedValue,
  convertToKg,
  formatNumber,
  isNonEmptyPositive,
  parseOptionalPositiveNumber,
} from '../utils/calculations';
import MaterialCard from '../components/MaterialCard';
import ConfigRow from '../components/ConfigRow';
import { persistLogoLocally, sendLogisticsEmail, stringToTemplateElements, templateElementsToString } from '../services/logisticsService';
import type {
  AccentKey,
  TemplateElement,
  AppPreferences,
  CartItem,
  HeaderPreferencesPayload,
  MaterialCalcMode,
  MaterialCategory,
  CategoryDisplayNames,
  MaterialDraft,
  MaterialOption,
  MaterialUnit,
  StoredConfig,
} from '../types/logistics';

const ACCENT_PRESETS: Record<AccentKey, { label: string; color: string; border: string; soft: string }> = {
  red: { label: 'Naranja', color: '#FF9F1C', border: '#FFB347', soft: '#FFE5BF' },
  blue: { label: 'Verde', color: '#2FBF71', border: '#46CE83', soft: '#CEF4DE' },
  green: { label: 'Magenta', color: '#D946EF', border: '#E879F9', soft: '#F6D5FD' },
  amber: { label: 'Coral', color: '#FF6B6B', border: '#FF8A8A', soft: '#FFD6D6' },
};

const UI_COLORS = {
  blue: '#0052CC',
  white: '#FFFFFF',
  text: '#0D2447',
  muted: '#4E6B94',
  darkMuted: '#A9C4EA',
  border: '#C9DAF2',
  surface: '#F5F9FF',
  background: '#FFFFFF',
  danger: '#1F4DA8',
  darkBackground: '#0B1E3A',
  darkSurface: '#10284A',
  darkBorder: '#1F3F73',
};

const DEFAULT_CATEGORY_DISPLAY_NAMES: CategoryDisplayNames = {
  bolsas: 'Bolsas',
  cajas: 'Cajas',
  otros: 'Otros',
};

const DEFAULT_PREFERENCES: AppPreferences = {
  appName: 'SurtiTrack',
  headerSubtitle: 'Solicitud logística corporativa',
  themeMode: 'dark',
  folioPrefix: 'CS',
  emailTemplate: [
    '{logo}',
    '{greeting}',
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
  accentKey: 'blue',
  categoryDisplayNames: DEFAULT_CATEGORY_DISPLAY_NAMES,
};

const STORAGE_KEY = 'calcpack.materials.config.v5';
const LEGACY_STORAGE_KEYS = [
  'calcpack.materials.config.v4',
  'calcpack.materials.config.v3',
  'calcpack.bolsas.config.v1',
  'calcpack.bolsas.config.v2',
];

const CATEGORIES: Array<{ key: MaterialCategory; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: 'bolsas', icon: 'bag-suitcase-outline' },
  { key: 'cajas', icon: 'package-variant-closed' },
  { key: 'otros', icon: 'cube-outline' },
];

const FOLIO_PREFIX_FALLBACK = 'CS';

function normalizeCategoryDisplayNames(value?: Partial<CategoryDisplayNames> | null): CategoryDisplayNames {
  return {
    bolsas: value?.bolsas?.trim() || DEFAULT_CATEGORY_DISPLAY_NAMES.bolsas,
    cajas: value?.cajas?.trim() || DEFAULT_CATEGORY_DISPLAY_NAMES.cajas,
    otros: value?.otros?.trim() || DEFAULT_CATEGORY_DISPLAY_NAMES.otros,
  };
}

function categoryLabel(category: MaterialCategory, categoryDisplayNames: CategoryDisplayNames = DEFAULT_CATEGORY_DISPLAY_NAMES) {
  if (category === 'bolsas') {
    return categoryDisplayNames.bolsas;
  }

  if (category === 'cajas') {
    return categoryDisplayNames.cajas;
  }

  return categoryDisplayNames.otros;
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

function getAccessibleTextColorForAccent(hexColor: string) {
  const sanitized = hexColor.replace('#', '');

  if (sanitized.length !== 6) {
    return UI_COLORS.text;
  }

  const red = Number.parseInt(sanitized.slice(0, 2), 16);
  const green = Number.parseInt(sanitized.slice(2, 4), 16);
  const blue = Number.parseInt(sanitized.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return UI_COLORS.text;
  }

  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.6 ? UI_COLORS.text : UI_COLORS.white;
}

function buildRequestCode(prefix: string, sequence: number) {
  const normalizedPrefix = sanitizeFolioPrefix(prefix);
  return `${normalizedPrefix}${String(sequence).padStart(3, '0')}`;
}

function getGreetingByHour(date: Date) {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Buenos días equipo,';
  }

  if (hour < 19) {
    return 'Buenas tardes equipo,';
  }

  return 'Buenas noches equipo,';
}

function isValidEmail(value: string) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.trim());
}

async function triggerStatusFeedback(kind: 'success' | 'error') {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    if (kind === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // No bloquear la UX si el dispositivo no soporta feedback háptico.
  }
}

function normalizePreferenceText(value: string, fallback: string) {
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeColumnKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCategoryValue(value: string): MaterialCategory | null {
  const normalized = normalizeColumnKey(value);

  if (normalized === 'bolsas' || normalized === 'bolsa') {
    return 'bolsas';
  }

  if (normalized === 'cajas' || normalized === 'caja') {
    return 'cajas';
  }

  if (normalized === 'otros' || normalized === 'otro') {
    return 'otros';
  }

  return null;
}

function parseModeValue(value: string, category: MaterialCategory): MaterialCalcMode {
  const normalized = normalizeColumnKey(value);

  if (normalized === 'bags' || normalized === 'bag' || normalized === 'bolsas' || normalized === 'bolsa') {
    return 'bags';
  }

  if (normalized === 'pieces' || normalized === 'piezas' || normalized === 'pieza' || normalized === 'cajas' || normalized === 'caja') {
    return 'pieces';
  }

  if (normalized === 'other' || normalized === 'otros' || normalized === 'otro') {
    return 'other';
  }

  if (category === 'bolsas') {
    return 'bags';
  }

  if (category === 'cajas') {
    return 'pieces';
  }

  return 'other';
}

function parseRequestUnitValue(value: string, fallback: MaterialUnit): MaterialUnit {
  const normalized = normalizeColumnKey(value);

  if (normalized === 'pieces' || normalized === 'pieza' || normalized === 'piezas' || normalized === 'pc') {
    return 'pieces';
  }

  if (normalized === 'kg' || normalized === 'kilo' || normalized === 'kilos') {
    return 'kg';
  }

  if (normalized === 'g' || normalized === 'gramo' || normalized === 'gramos') {
    return 'g';
  }

  if (normalized === 'l' || normalized === 'lt' || normalized === 'litro' || normalized === 'litros') {
    return 'l';
  }

  return fallback;
}

function parseWeightUnitValue(value: string): 'kg' | 'g' {
  const normalized = normalizeColumnKey(value);

  if (normalized === 'g' || normalized === 'gramo' || normalized === 'gramos') {
    return 'g';
  }

  return 'kg';
}

function getRowValue(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeColumnKey(alias);
    if (key in row) {
      return row[key];
    }
  }

  return undefined;
}

function parseImportedMaterials(
  rows: Array<Record<string, unknown>>,
  categoryDisplayNames: CategoryDisplayNames
): { materials: MaterialOption[]; errors: string[] } {
  const materials: MaterialOption[] = [];
  const errors: string[] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const normalizedRow = Object.fromEntries(
      Object.entries(rawRow).map(([key, value]) => [normalizeColumnKey(String(key)), value])
    );

    const categoryRaw = String(getRowValue(normalizedRow, ['categoria', 'category']) ?? '').trim();
    const titleRaw = String(getRowValue(normalizedRow, ['titulo', 'nombre', 'material', 'title']) ?? '').trim();
    const modeRaw = String(getRowValue(normalizedRow, ['modo', 'calc_mode', 'mode']) ?? '').trim();
    const requestUnitRaw = String(getRowValue(normalizedRow, ['unidad_solicitud', 'request_unit', 'unidad']) ?? '').trim();
    const weightPer100Raw = String(getRowValue(normalizedRow, ['peso_por_100', 'weight_per_100', 'peso100']) ?? '').trim();
    const weightUnitRaw = String(getRowValue(normalizedRow, ['unidad_peso', 'weight_unit']) ?? '').trim();

    if (!categoryRaw && !titleRaw && !modeRaw && !requestUnitRaw && !weightPer100Raw && !weightUnitRaw) {
      return;
    }

    const category = parseCategoryValue(categoryRaw);

    if (!category) {
      errors.push(`Fila ${rowNumber}: categoría inválida (${categoryRaw || 'vacía'}). Usa bolsas, cajas u otros.`);
      return;
    }

    if (!titleRaw) {
      errors.push(`Fila ${rowNumber}: falta titulo.`);
      return;
    }

    const fallbackRequestUnit: MaterialUnit = category === 'bolsas' || category === 'cajas' ? 'pieces' : 'kg';
    const mode = parseModeValue(modeRaw, category);
    const requestUnit = parseRequestUnitValue(requestUnitRaw, fallbackRequestUnit);
    const weightUnit = parseWeightUnitValue(weightUnitRaw);

    const parsedWeight = parseOptionalPositiveNumber(weightPer100Raw);
    const normalizedWeightPer100 = convertToKg(parsedWeight, weightUnit);

    if (mode === 'bags' && !isNonEmptyPositive(normalizedWeightPer100)) {
      errors.push(`Fila ${rowNumber}: para modo bags debes indicar peso_por_100 válido (> 0).`);
      return;
    }

    const itemIndex = materials.filter((item) => item.category === category).length + 1;
    const base = createMaterialTemplate(category, itemIndex, requestUnit, categoryDisplayNames);

    materials.push({
      ...base,
      id: `import-${Date.now()}-${index}`,
      title: titleRaw,
      calcMode: mode,
      requestUnit,
      weightPer100Kg: mode === 'bags' ? normalizedWeightPer100 : 0,
      weightUnit,
    });
  });

  return { materials, errors };
}

function preferencesAreEqual(left: AppPreferences, right: AppPreferences) {
  return (
    left.appName === right.appName &&
    left.headerSubtitle === right.headerSubtitle &&
    left.themeMode === right.themeMode &&
    left.folioPrefix === right.folioPrefix &&
    left.emailTemplate === right.emailTemplate &&
    left.emailNote === right.emailNote &&
    left.sheetNote === right.sheetNote &&
    left.logoSource === right.logoSource &&
    left.logoLabel === right.logoLabel &&
    left.accentKey === right.accentKey &&
    left.categoryDisplayNames.bolsas === right.categoryDisplayNames.bolsas &&
    left.categoryDisplayNames.cajas === right.categoryDisplayNames.cajas &&
    left.categoryDisplayNames.otros === right.categoryDisplayNames.otros
  );
}

function createMaterialTemplate(
  category: MaterialCategory,
  index: number,
  requestUnit: MaterialUnit = 'kg',
  categoryDisplayNames: CategoryDisplayNames = DEFAULT_CATEGORY_DISPLAY_NAMES
): MaterialOption {
  const base: MaterialOption = {
    id: `${category}-${Date.now()}-${index}`,
    category,
    title: `${categoryLabel(category, categoryDisplayNames)} ${index}`,
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
  const [nextLeadNumber, setNextLeadNumber] = useState(1);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [draftPreferences, setDraftPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [templateElements, setTemplateElements] = useState<TemplateElement[]>([]);
  const [draftTemplateElements, setDraftTemplateElements] = useState<TemplateElement[]>([]);
  const sectionAnimations = useRef(Array.from({ length: 4 }, () => new Animated.Value(0))).current;
  const categorySectionAnimation = useRef(new Animated.Value(1)).current;
  const settingsPanelAnimation = useRef(new Animated.Value(0)).current;
  const [renderSettingsPanel, setRenderSettingsPanel] = useState(false);
  const accent = ACCENT_PRESETS[preferences.accentKey] ?? ACCENT_PRESETS[DEFAULT_PREFERENCES.accentKey];
  const isDarkTheme = draftPreferences.themeMode === 'dark';
  const accentTextColor = getAccessibleTextColorForAccent(accent.color);
  const theme = {
    pageBg: isDarkTheme ? UI_COLORS.darkBackground : UI_COLORS.background,
    panelBg: isDarkTheme ? UI_COLORS.darkSurface : UI_COLORS.surface,
    panelAltBg: isDarkTheme ? UI_COLORS.darkBackground : UI_COLORS.background,
    border: isDarkTheme ? UI_COLORS.darkBorder : UI_COLORS.border,
    text: isDarkTheme ? UI_COLORS.white : UI_COLORS.text,
    muted: isDarkTheme ? UI_COLORS.darkMuted : UI_COLORS.muted,
    inputBg: isDarkTheme ? UI_COLORS.darkBackground : UI_COLORS.white,
    inputBorder: isDarkTheme ? UI_COLORS.darkBorder : UI_COLORS.border,
  };
  const categoryDisplayNames = normalizeCategoryDisplayNames(draftPreferences.categoryDisplayNames);
  const categoryLabelForUi = (category: MaterialCategory) => categoryLabel(category, categoryDisplayNames);
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
    if (!statusMessage || !statusType) {
      return;
    }

    void triggerStatusFeedback(statusType);
  }, [statusMessage, statusType]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    onHeaderPreferencesChange?.({
      appName: draftPreferences.appName,
      headerSubtitle: draftPreferences.headerSubtitle,
      logoSource: draftPreferences.logoSource,
      themeMode: draftPreferences.themeMode,
    });
  }, [draftPreferences.appName, draftPreferences.headerSubtitle, draftPreferences.logoSource, draftPreferences.themeMode, isLoading, onHeaderPreferencesChange]);

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
          const defaultElements = stringToTemplateElements(DEFAULT_PREFERENCES.emailTemplate as string);
          setTemplateElements(defaultElements);
          setDraftTemplateElements(defaultElements);
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

        if (typeof parsed.nextLeadNumber === 'number' && parsed.nextLeadNumber >= 1) {
          setNextLeadNumber(parsed.nextLeadNumber);
        }

        if (parsed.preferences) {
          let logoSourceToUse = DEFAULT_PREFERENCES.logoSource;
          
          // En web, intentar recuperar logo desde sessionStorage
          if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
            try {
              const storedLogoDataUri = sessionStorage.getItem('calcpack.logo.datauri');
              if (storedLogoDataUri && storedLogoDataUri.startsWith('data:image/')) {
                logoSourceToUse = storedLogoDataUri;
              }
            } catch {
              // Si sessionStorage falla, usar el del AsyncStorage
            }
          }
          
          // Si no hay logo en sessionStorage, usar el del AsyncStorage
          if (!logoSourceToUse && typeof parsed.preferences.logoSource === 'string' && parsed.preferences.logoSource.trim()) {
            logoSourceToUse = parsed.preferences.logoSource.trim();
          }
          
          const nextPreferences: AppPreferences = {
            appName:
              typeof parsed.preferences.appName === 'string' && parsed.preferences.appName.trim()
                ? parsed.preferences.appName.trim()
                : DEFAULT_PREFERENCES.appName,
            headerSubtitle:
              typeof parsed.preferences.headerSubtitle === 'string' && parsed.preferences.headerSubtitle.trim()
                ? parsed.preferences.headerSubtitle.trim()
                : DEFAULT_PREFERENCES.headerSubtitle,
            themeMode: parsed.preferences.themeMode === 'light' ? 'light' : DEFAULT_PREFERENCES.themeMode,
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
            logoSource: logoSourceToUse,
            logoLabel:
              typeof parsed.preferences.logoLabel === 'string' && parsed.preferences.logoLabel.trim()
                ? parsed.preferences.logoLabel.trim()
                : DEFAULT_PREFERENCES.logoLabel,
            accentKey:
              parsed.preferences.accentKey && ACCENT_PRESETS[parsed.preferences.accentKey]
                ? parsed.preferences.accentKey
                : DEFAULT_PREFERENCES.accentKey,
            categoryDisplayNames: normalizeCategoryDisplayNames(parsed.preferences.categoryDisplayNames),
          };

          setPreferences(nextPreferences);
          setDraftPreferences(nextPreferences);
          onHeaderPreferencesChange?.({
            appName: nextPreferences.appName,
            headerSubtitle: nextPreferences.headerSubtitle,
            logoSource: nextPreferences.logoSource,
            themeMode: nextPreferences.themeMode,
          });
          
          // Convertir el template string a elementos
          const templateStr = typeof nextPreferences.emailTemplate === 'string' ? nextPreferences.emailTemplate : DEFAULT_PREFERENCES.emailTemplate;
          const elements = typeof templateStr === 'string' ? stringToTemplateElements(templateStr as string) : templateStr;
          setTemplateElements(elements);
          setDraftTemplateElements(elements);
        }

        setStatusMessage('Configuración cargada');
        setStatusType('success');
      } catch {
        setStatusMessage('No se pudo cargar la configuración guardada.');
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
  }, []);

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

  const requestSummary = useMemo(
    () =>
      cartItems.reduce(
        (acc, item) => {
          acc.materials += 1;

          if (item.requestUnit === 'pieces') {
            acc.totalPieces += item.requestValue;
          }

          if (item.calculatedUnit === 'kg') {
            acc.totalKg += item.calculatedValue;
          } else if (item.calculatedUnit === 'g') {
            acc.totalKg += convertToKg(item.calculatedValue, 'g');
          }

          return acc;
        },
        { materials: 0, totalPieces: 0, totalKg: 0 }
      ),
    [cartItems]
  );

  const hasPendingPreferenceChanges = useMemo(
    () =>
      !preferencesAreEqual(preferences, draftPreferences) ||
      templateElementsToString(templateElements) !== templateElementsToString(draftTemplateElements),
    [draftPreferences, draftTemplateElements, preferences, templateElements]
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

  const templateEditorValue = useMemo(() => templateElementsToString(draftTemplateElements), [draftTemplateElements]);

  const getSectionEntryStyle = (index: number) => ({
    opacity: sectionAnimations[index].interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
    transform: [
      {
        translateY: sectionAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  });

  const getCategoryTransitionStyle = () => ({
    opacity: categorySectionAnimation,
    transform: [
      {
        translateY: categorySectionAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  });

  const getSettingsPanelStyle = () => ({
    opacity: settingsPanelAnimation,
    maxHeight: settingsPanelAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 6000],
    }),
    transform: [
      {
        translateY: settingsPanelAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
  });

  useEffect(() => {
    if (isLoading) {
      return;
    }

    sectionAnimations.forEach((animation) => animation.setValue(0));

    const staggered = Animated.stagger(
      80,
      sectionAnimations.map((animation) =>
        Animated.timing(animation, {
          toValue: 1,
          duration: 240,
          useNativeDriver: false,
        })
      )
    );

    staggered.start();
  }, [isLoading, sectionAnimations]);

  useEffect(() => {
    categorySectionAnimation.setValue(0);

    Animated.timing(categorySectionAnimation, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [categorySectionAnimation, selectedCategory]);

  useEffect(() => {
    if (settingsOpen) {
      setRenderSettingsPanel(true);
      Animated.timing(settingsPanelAnimation, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
      }).start();
      return;
    }

    Animated.timing(settingsPanelAnimation, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setRenderSettingsPanel(false);
      }
    });
  }, [settingsOpen, settingsPanelAnimation]);

  function updateTemplateFromText(value: string) {
    setDraftTemplateElements(stringToTemplateElements(value));
  }

  async function savePreferences() {
    const persistedLogo = await persistLogoLocally(draftPreferences.logoSource, draftPreferences.logoLabel, DEFAULT_PREFERENCES.logoLabel);

    const nextPreferences: AppPreferences = {
      appName: normalizePreferenceText(draftPreferences.appName, DEFAULT_PREFERENCES.appName),
      headerSubtitle: normalizePreferenceText(draftPreferences.headerSubtitle, DEFAULT_PREFERENCES.headerSubtitle),
      themeMode: draftPreferences.themeMode === 'light' ? 'light' : 'dark',
      folioPrefix: sanitizeFolioPrefix(draftPreferences.folioPrefix),
      emailTemplate: templateElementsToString(draftTemplateElements),
      emailNote: normalizePreferenceText(draftPreferences.emailNote, DEFAULT_PREFERENCES.emailNote),
      sheetNote: normalizePreferenceText(draftPreferences.sheetNote, DEFAULT_PREFERENCES.sheetNote),
      // En web, NO guardar data URI completo en AsyncStorage (es muy grande); se guarda en sessionStorage
      logoSource: Platform.OS === 'web' && persistedLogo.logoSource.startsWith('data:image/') 
        ? '' 
        : persistedLogo.logoSource,
      logoLabel: normalizePreferenceText(persistedLogo.logoLabel, DEFAULT_PREFERENCES.logoLabel),
      accentKey: ACCENT_PRESETS[draftPreferences.accentKey] ? draftPreferences.accentKey : DEFAULT_PREFERENCES.accentKey,
      categoryDisplayNames: normalizeCategoryDisplayNames(draftPreferences.categoryDisplayNames),
    };

    setPreferences(nextPreferences);
    setDraftPreferences(nextPreferences);
    setTemplateElements(draftTemplateElements);
    setDraftTemplateElements(draftTemplateElements);
    onHeaderPreferencesChange?.({
      appName: nextPreferences.appName,
      headerSubtitle: nextPreferences.headerSubtitle,
      logoSource: persistedLogo.logoSource, // Pasar el logo real (desde sessionStorage o FileSystem) al header
      themeMode: nextPreferences.themeMode,
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
        input.style.display = 'none';
        document.body.appendChild(input);

        let resolved = false;
        const finish = () => {
          if (resolved) {
            return;
          }
          resolved = true;
          input.onchange = null;
          input.remove();
          resolve();
        };

        const fallbackTimer = setTimeout(() => {
          finish();
        }, 15000);

        input.onchange = () => {
          const file = input.files?.[0];

          if (!file) {
            clearTimeout(fallbackTimer);
            finish();
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

            clearTimeout(fallbackTimer);
            finish();
          };

          reader.onerror = () => {
            clearTimeout(fallbackTimer);
            finish();
          };
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
    const persistedLogo = await persistLogoLocally(asset.uri, asset.fileName ?? undefined, DEFAULT_PREFERENCES.logoLabel);

    setDraftPreferences((current) => ({
      ...current,
      logoSource: persistedLogo.logoSource,
      logoLabel: persistedLogo.logoLabel,
    }));
  }

  async function importMaterialsDatabase() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const file = result.assets[0];
      const lowerName = (file.name || '').toLowerCase();
      const isCsv = lowerName.endsWith('.csv') || file.mimeType === 'text/csv';
      const readEncoding = isCsv ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64;
      const fileContent = await FileSystem.readAsStringAsync(file.uri, { encoding: readEncoding });

      const workbook = isCsv
        ? XLSX.read(fileContent, { type: 'string' })
        : XLSX.read(fileContent, { type: 'base64' });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        setStatusMessage('El archivo no contiene hojas para importar.');
        setStatusType('error');
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      const { materials: importedMaterials, errors } = parseImportedMaterials(rows, categoryDisplayNames);

      if (errors.length > 0) {
        setStatusMessage(`Importación con errores: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} más)` : ''}`);
        setStatusType('error');
        return;
      }

      if (importedMaterials.length === 0) {
        setStatusMessage('No se encontraron registros válidos para importar.');
        setStatusType('error');
        return;
      }

      Alert.alert('Importar base de datos', `Se detectaron ${importedMaterials.length} materiales.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reemplazar',
          style: 'destructive',
          onPress: () => {
            setMaterials(importedMaterials);
            setCartItems([]);
            setSelectedCategory(importedMaterials[0]?.category ?? 'bolsas');
            setSelectedMaterialId(importedMaterials[0]?.id ?? '');
            setStatusMessage(`Base importada: ${importedMaterials.length} materiales (reemplazo).`);
            setStatusType('success');
          },
        },
        {
          text: 'Agregar',
          onPress: () => {
            setMaterials((current) => [...importedMaterials, ...current]);
            setSelectedCategory(importedMaterials[0]?.category ?? 'bolsas');
            setSelectedMaterialId(importedMaterials[0]?.id ?? '');
            setStatusMessage(`Base importada: ${importedMaterials.length} materiales agregados.`);
            setStatusType('success');
          },
        },
      ]);
    } catch {
      setStatusMessage('No se pudo importar el archivo. Verifica que sea Excel/CSV con columnas válidas.');
      setStatusType('error');
    }
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
        setStatusMessage('Ingresa un peso válido para 100 piezas antes de agregar.');
        setStatusType('error');
        return;
      }

      const next = createMaterialTemplate(selectedCategory, index, 'kg', categoryDisplayNames);
      next.title = trimmedName;
      next.weightPer100Kg = normalizedWeightKg;
      next.weightUnit = draft.weightUnit;

      setMaterials((current) => [...current, next]);
      setSelectedMaterialId(next.id);
      resetDraft(selectedCategory);
      setStatusMessage(`Material agregado en ${categoryLabelForUi(selectedCategory)}.`);
      setStatusType('success');
      return;
    }

    if (selectedCategory === 'cajas') {
      const next = createMaterialTemplate(selectedCategory, index, 'pieces', categoryDisplayNames);
      next.title = trimmedName;
      next.requestUnit = 'pieces';
      next.calcMode = 'pieces';

      setMaterials((current) => [...current, next]);
      setSelectedMaterialId(next.id);
      resetDraft(selectedCategory);
      setStatusMessage(`Material agregado en ${categoryLabelForUi(selectedCategory)}.`);
      setStatusType('success');
      return;
    }

    const next = createMaterialTemplate(selectedCategory, index, draft.otherUnit, categoryDisplayNames);
    next.title = trimmedName;
    next.requestUnit = draft.otherUnit;
    next.calcMode = 'other';

    setMaterials((current) => [...current, next]);
    setSelectedMaterialId(next.id);
    resetDraft(selectedCategory);
    setStatusMessage(`Material agregado en ${categoryLabelForUi(selectedCategory)}.`);
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
      setStatusMessage('Agrega un material en la categoría actual.');
      setStatusType('error');
      return;
    }

    const requestValue = selectedMaterial.requestValue;

    if (!isNonEmptyPositive(requestValue)) {
      setStatusMessage('Captura una cantidad válida antes de agregar a la solicitud.');
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
      setStatusMessage('El correo destino no tiene un formato válido.');
      setStatusType('error');
      return;
    }

    if (cartItems.length === 0) {
      setStatusMessage('El resumen está vacío. Agrega al menos un material.');
      setStatusType('error');
      return;
    }

    try {
      setIsSendingEmail(true);
      const requestCode = buildRequestCode(preferences.folioPrefix, nextLeadNumber);
      const result = await sendLogisticsEmail({
        recipientEmail,
        requestCode,
        cartItems,
        preferences,
        greeting: getGreetingByHour(new Date()),
      });

      if (result.reserveFolio) {
        setNextLeadNumber((current) => current + 1);
      }

      setStatusMessage(result.statusMessage);
      setStatusType(result.statusType);
    } catch {
      setStatusMessage('No se pudo preparar la solicitud.');
      setStatusType('error');
    } finally {
      setIsSendingEmail(false);
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: theme.pageBg }}>
        <View className="items-center gap-4 rounded-ind border px-6 py-8" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
          <ActivityIndicator size="large" color={UI_COLORS.blue} />
          <Text className="text-base font-semibold" style={{ color: theme.text }}>Cargando configuración...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1" style={{ backgroundColor: theme.pageBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: theme.pageBg }}
        contentContainerClassName="px-4 pb-32 pt-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <View className="w-full self-center rounded-ind border px-4 py-4" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
        <View className="mb-4" style={{ minHeight: 56 }}>
          {statusMessage ? (
            <View className={`rounded-ind border px-4 py-3 ${statusType === 'error' ? 'border-corporate-error bg-corporate-error/10' : 'border-corporate-primary/30'}`} style={{ backgroundColor: theme.panelAltBg }}>
              <Text className="text-sm font-medium" style={{ color: statusType === 'error' ? UI_COLORS.danger : accent.color }}>{statusMessage}</Text>
            </View>
          ) : null}
        </View>

        <Animated.View className="mb-4 rounded-ind border px-4 py-4" style={[{ backgroundColor: theme.panelBg, borderColor: accent.border }, getSectionEntryStyle(0)]}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[13px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>{preferences.appName}</Text>
              <Text className="mt-1 text-2xl font-bold" style={{ color: theme.text }}>{preferences.headerSubtitle}</Text>
            </View>
            <View className="items-center justify-center rounded-ind border px-3 py-3" style={{ borderColor: accent.border, backgroundColor: theme.panelAltBg }}>
              {preferences.logoSource ? (
                <Image source={{ uri: preferences.logoSource }} style={{ width: 48, height: 48, borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <MaterialCommunityIcons name="clipboard-text-outline" size={22} color={accent.color} />
              )}
            </View>
          </View>
          <Text className="mt-2 text-sm" style={{ color: theme.muted }}>
            {preferences.emailNote}
          </Text>
        </Animated.View>

        <Animated.View className="mb-4 rounded-card border px-3 py-3" style={[{ backgroundColor: theme.panelBg, borderColor: accent.border }, getSectionEntryStyle(0)]}>
          <View className="flex-row gap-2">
            <View className="flex-1 rounded-ind border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Text className="text-[11px] tracking-[0.05em]" style={{ color: theme.muted }}>Catálogo activo</Text>
              <Text className="mt-1 text-lg font-bold" style={{ color: theme.text }}>{currentMaterials.length}</Text>
              <Text className="text-xs" style={{ color: theme.muted }}>{categoryLabelForUi(selectedCategory)}</Text>
            </View>
            <View className="flex-1 rounded-ind border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Text className="text-[11px] tracking-[0.05em]" style={{ color: theme.muted }}>En solicitud</Text>
              <Text className="mt-1 text-lg font-bold" style={{ color: theme.text }}>{requestSummary.materials}</Text>
              <Text className="text-xs" style={{ color: theme.muted }}>Materiales</Text>
            </View>
            <View className="flex-1 rounded-ind border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Text className="text-[11px] tracking-[0.05em]" style={{ color: theme.muted }}>Kg a surtir</Text>
              <Text className="mt-1 text-lg font-bold" style={{ color: theme.text }}>{formatNumber(requestSummary.totalKg)}</Text>
              <Text className="text-xs" style={{ color: theme.muted }}>Acumulado</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={getCategoryTransitionStyle()}>
        <View className="mb-3">
          <Text className="mb-2 text-sm font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>Tipo de material</Text>
          <View className="flex-row gap-2">
            {CATEGORIES.map((category) => {
              const active = category.key === selectedCategory;

              return (
                <Pressable
                  key={category.key}
                  onPress={() => setSelectedCategory(category.key)}
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  className="flex-1 rounded-ind border px-3 py-3"
                  style={({ pressed }) => [
                    active ? { borderColor: accent.border, backgroundColor: accent.color } : { borderColor: theme.border, backgroundColor: theme.panelAltBg },
                    pressed ? { transform: [{ scale: 0.98 }] } : undefined,
                  ]}
                >
                  <View className="items-center gap-2">
                    <View className="h-6 w-6 items-center justify-center rounded border" style={{ borderColor: active ? accentTextColor : theme.border }}>
                      <MaterialCommunityIcons name={category.icon} size={18} color={active ? accentTextColor : UI_COLORS.blue} />
                    </View>
                    <Text className="text-center text-sm font-semibold" style={{ color: active ? accentTextColor : theme.text }}>
                      {categoryLabelForUi(category.key)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mb-4 rounded-ind border px-3 py-3" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>Alta de material</Text>
            <Text className="text-xs" style={{ color: theme.muted }}>{categoryLabelForUi(selectedCategory)}</Text>
          </View>

          <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre</Text>
          <TextInput
            value={drafts[selectedCategory].title}
            onChangeText={(value) =>
              setDrafts((current) => ({
                ...current,
                [selectedCategory]: { ...current[selectedCategory], title: value },
              }))
            }
            placeholder={
              selectedCategory === 'otros'
                ? 'Ej. Material genérico'
                : selectedCategory === 'cajas'
                  ? 'Ej. Caja corrugada 40x30'
                  : 'Ej. Bolsa reciclada 60x90'
            }
            placeholderTextColor={theme.muted}
            className="mb-3 rounded-ind border px-3 py-3"
            style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
          />

          {selectedCategory === 'bolsas' ? (
            <>
              <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Unidad base del peso</Text>
              <View className="mb-3 flex-row gap-2">
                <Pressable
                  onPress={() =>
                    setDrafts((current) => ({
                      ...current,
                      bolsas: { ...current.bolsas, weightUnit: 'g' },
                    }))
                  }
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  className="flex-1 rounded-ind border px-3 py-3"
                  style={drafts.bolsas.weightUnit === 'g' ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
                >
                  <Text className="text-center text-sm font-semibold" style={{ color: drafts.bolsas.weightUnit === 'g' ? accentTextColor : theme.text }}>
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
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    className="flex-1 rounded-ind border px-3 py-3"
                    style={drafts.bolsas.weightUnit === 'kg' ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
                >
                    <Text className="text-center text-sm font-semibold" style={{ color: drafts.bolsas.weightUnit === 'kg' ? accentTextColor : theme.text }}>
                    Kilogramos
                  </Text>
                </Pressable>
              </View>

              <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Peso por 100 piezas ({drafts.bolsas.weightUnit})</Text>
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
                placeholderTextColor={theme.muted}
                className={`rounded-ind border px-3 py-3 ${drafts.bolsas.weightInput.trim().length > 0 && !isNonEmptyPositive(convertToKg(parseOptionalPositiveNumber(drafts.bolsas.weightInput), drafts.bolsas.weightUnit)) ? 'border-corporate-error bg-corporate-error/10' : ''}`}
                style={{ backgroundColor: theme.inputBg, borderColor: drafts.bolsas.weightInput.trim().length > 0 && !isNonEmptyPositive(convertToKg(parseOptionalPositiveNumber(drafts.bolsas.weightInput), drafts.bolsas.weightUnit)) ? UI_COLORS.danger : theme.inputBorder, color: theme.text }}
              />
            </>
          ) : null}

          {selectedCategory === 'cajas' ? (
            <View className="rounded-ind border px-3 py-3" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Text className="text-sm" style={{ color: theme.text }}>Las cajas se solicitarán directamente por piezas.</Text>
            </View>
          ) : null}

          {selectedCategory === 'otros' ? (
            <>
              <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Unidad de solicitud</Text>
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
                      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        className="flex-1 rounded-ind border px-3 py-3"
                        style={active ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
                    >
                        <Text className="text-center text-sm font-semibold" style={{ color: active ? accentTextColor : theme.text }}>
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
            className="mt-4 min-h-[48px] rounded-ind border border-corporate-primary bg-corporate-primary px-4 py-4"
            style={({ pressed }) => [
              { backgroundColor: accent.color, borderColor: accent.border },
              pressed ? { opacity: 0.86 } : undefined,
            ]}
          >
            <View className="flex-row items-center justify-center gap-2">
              <Text className="text-center text-sm font-semibold" style={{ color: accentTextColor }} numberOfLines={2}>
                Agregar material en {categoryLabelForUi(selectedCategory)}
              </Text>
            </View>
          </Pressable>
        </View>

        {currentMaterials.length === 0 ? (
          <View className="mb-4 rounded-ind border px-4 py-5" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
            <Text className="text-sm font-medium" style={{ color: theme.text }}>No hay materiales en {categoryLabelForUi(selectedCategory)}.</Text>
            <Text className="mt-1 text-xs" style={{ color: theme.muted }}>Agrega uno desde la sección superior para comenzar la solicitud.</Text>
          </View>
        ) : null}

        {currentMaterials.map((item) => (
          <MaterialCard
            key={item.id}
            option={item}
            selected={item.id === selectedMaterialId}
            accent={accent}
            accentTextColor={accentTextColor}
            theme={theme}
            onPress={() => setSelectedMaterialId(item.id)}
            categoryIcon={categoryIcon}
            categoryLabel={categoryLabelForUi}
            modeLabel={modeLabel}
            unitLabel={unitLabel}
            getResultLabel={getResultLabel}
          />
        ))}

        <View className="mt-2 rounded-ind border px-4 py-4" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
          <Text className="mb-2 text-sm font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>
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
            placeholderTextColor={theme.muted}
            editable={Boolean(selectedMaterial)}
            className={`rounded-ind border px-4 py-4 text-xl font-semibold ${selectedMaterial && !isNonEmptyPositive(selectedMaterial.requestValue) ? 'border-corporate-error bg-corporate-error/10' : ''}`}
            style={{ backgroundColor: theme.inputBg, borderColor: selectedMaterial && !isNonEmptyPositive(selectedMaterial.requestValue) ? UI_COLORS.danger : theme.inputBorder, color: theme.text }}
          />
          <Text className="mt-2 text-xs" style={{ color: theme.muted }}>
            Captura la cantidad base y el sistema calcula el valor final según la categoría.
          </Text>
        </View>

        <View className="mt-4 rounded-ind border px-5 py-6" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
          <Text className="text-center text-[13px] font-semibold tracking-[0.12em]" style={{ color: theme.muted }}>
            {selectedMaterial ? getResultLabel(selectedMaterial) : 'Resultado'}
          </Text>
          <Text className="mt-2 text-center text-4xl font-bold" style={{ color: theme.text }}>
            {selectedMaterial ? formatNumber(selectedResultValue) : '0.000'}
          </Text>
          <Text className="mt-1 text-center text-xs" style={{ color: accent.soft }}>
            {selectedMaterial ? unitLabel(selectedResultUnit) : 'Selecciona o crea un material'}
          </Text>
          <Text className="mt-2 text-center text-xs text-corporate-muted">
            {selectedMaterial ? `Categoría activa: ${categoryLabelForUi(selectedMaterial.category)} · ${selectedMaterial.title}` : 'Sin material seleccionado'}
          </Text>
        </View>

        <Pressable
          onPress={addToRequest}
          className="mt-4 min-h-[48px] rounded-ind border border-corporate-primary bg-corporate-primary px-4 py-4"
          style={({ pressed }) => [
            { backgroundColor: accent.color, borderColor: accent.border },
            pressed ? { opacity: 0.86 } : undefined,
          ]}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <View className="flex-row items-center justify-center gap-2">
            <Text className="text-center text-sm font-bold" style={{ color: accentTextColor }}>Agregar a la solicitud</Text>
          </View>
        </Pressable>
        </Animated.View>

        <Animated.View className="mt-6" style={getSectionEntryStyle(2)}>
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-5 w-5 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={16} color={UI_COLORS.blue} />
              </View>
              <Text className="text-xl font-semibold text-corporate-text">Resumen de solicitud</Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-corporate-muted">Próximo folio: {buildRequestCode(preferences.folioPrefix, nextLeadNumber)}</Text>
              <Text className="mt-1 text-xs" style={{ color: theme.muted }}>
                {formatNumber(requestSummary.totalPieces)} pzas · {formatNumber(requestSummary.totalKg)} kg
              </Text>
            </View>
          </View>

          <View className="rounded-ind border p-2" style={{ borderColor: accent.border, backgroundColor: theme.panelBg }}>
            <View className="mb-2 rounded-ind border px-3 py-2" style={{ borderColor: accent.border, backgroundColor: theme.panelAltBg }}>
              <View className="mb-2 flex-row items-center gap-2">
                <View className="h-4 w-4 items-center justify-center rounded border border-corporate-border">
                  <MaterialCommunityIcons name="email-fast-outline" size={10} color={UI_COLORS.blue} />
                </View>
                <Text className="text-xs font-semibold tracking-[0.06em] text-corporate-muted">Destino de envío</Text>
              </View>
              <TextInput
                value={recipientEmail}
                onChangeText={setRecipientEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="correo@empresa.com"
                placeholderTextColor={theme.muted}
                className={`rounded-ind border px-3 py-3 text-corporate-text ${recipientEmail.trim().length > 0 && !isValidEmail(recipientEmail) ? 'border-corporate-error bg-corporate-error/10' : 'border-corporate-border bg-corporate-surface'}`}
              />
              <Text className={`mt-2 text-xs ${recipientEmail.trim().length === 0 || isValidEmail(recipientEmail) ? 'text-corporate-muted' : 'text-corporate-error'}`}>
                {recipientEmail.trim().length === 0
                  ? 'Este correo se usará para enviar el resumen y se guarda localmente.'
                  : isValidEmail(recipientEmail)
                    ? 'Correo válido para envío.'
                    : 'Formato de correo no válido.'}
              </Text>
            </View>

            {cartItems.length === 0 ? (
              <View className="rounded-ind border border-dashed border-corporate-border px-3 py-4">
                <Text className="text-sm text-corporate-muted">Aún no hay materiales en el resumen.</Text>
              </View>
            ) : (
              cartItems.map((item) => (
                <View key={item.id} className="mb-1 rounded-ind border border-corporate-border bg-corporate-surface px-2 py-2">
                  <View className="gap-2">
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="flex-1 pr-2">
                        <Text className="text-sm font-semibold text-corporate-text">{item.materialTitle}</Text>
                        <Text className="text-[13px] text-corporate-muted">
                          {categoryLabelForUi(item.category)} · {modeLabel(item.calcMode)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeCartItem(item.id)}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        className="min-h-10 min-w-10 items-center justify-center rounded-ind border border-corporate-border px-3 py-2"
                        style={({ pressed }) => [{ borderColor: accent.border }, pressed ? { opacity: 0.82 } : undefined]}
                      >
                        <Text className="text-[12px] font-semibold text-corporate-text">Quitar</Text>
                      </Pressable>
                    </View>

                    <View className="flex-row flex-wrap gap-3">
                      <View className="rounded-ind border border-corporate-border px-2 py-1">
                        <Text className="text-[11px] tracking-[0.04em] text-corporate-muted">Capt.</Text>
                        <Text className="text-sm font-semibold text-corporate-text">{formatNumber(item.requestValue)}</Text>
                      </View>
                      <View className="rounded-ind border border-corporate-border px-2 py-1">
                        <Text className="text-[11px] tracking-[0.04em] text-corporate-muted">Res.</Text>
                        <Text className="text-sm font-semibold text-corporate-text">{formatNumber(item.calculatedValue)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}

            <View className="mt-2 flex-row gap-2">
              <Pressable
                onPress={clearCart}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                className="flex-1 min-h-[46px] items-center justify-center rounded-ind border border-corporate-border px-3 py-3"
                style={({ pressed }) => [
                  { borderColor: theme.border, backgroundColor: theme.panelAltBg },
                  pressed ? { opacity: 0.86 } : undefined,
                ]}
              >
                <Text className="text-center text-xs font-semibold tracking-[0.06em]" style={{ color: theme.text }}>Vaciar solicitud</Text>
              </Pressable>
              <Pressable
                disabled={!canSendEmail}
                onPress={() => {
                  void sendCartByEmail();
                }}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                className="flex-1 min-h-[46px] items-center justify-center rounded-ind border px-3 py-3"
                style={({ pressed }) => [
                  canSendEmail ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border },
                  canSendEmail && pressed ? { opacity: 0.86 } : undefined,
                ]}
              >
                <Text className="text-center text-xs font-semibold tracking-[0.06em]" style={{ color: canSendEmail ? accentTextColor : theme.muted }}>
                  {isSendingEmail ? 'Enviando...' : 'Enviar solicitud'}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        <Animated.View className="mt-4 rounded-ind border px-4 py-4" style={[{ backgroundColor: theme.panelBg, borderColor: accent.border }, getSectionEntryStyle(3)]}>
          <Pressable onPress={() => setSettingsOpen((current) => !current)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-5 w-5 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                <MaterialCommunityIcons name="tune-variant" size={12} color={accent.color} />
              </View>
              <Text className="text-base font-semibold" style={{ color: theme.text }}>Personalización de app</Text>
            </View>
            <Text className="text-base font-bold" style={{ color: theme.muted }}>{settingsOpen ? '˄' : '˅'}</Text>
          </Pressable>

          {renderSettingsPanel ? (
            <Animated.View className="mt-4 overflow-hidden" style={getSettingsPanelStyle()}>
              <View className="mb-4 rounded-ind border px-4 py-4" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
                <View className="mb-3 flex-row items-center gap-2">
                  <View className="h-4 w-4 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                    <MaterialCommunityIcons name="palette-outline" size={10} color={accent.color} />
                  </View>
                  <Text className="text-xs font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>Marca, logo y exportación</Text>
                </View>

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre visible de la app</Text>
                <TextInput
                  value={draftPreferences.appName}
                  onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                      ...current,
                      appName: value,
                    }))
                  }
                  placeholder="SurtiTrack"
                  placeholderTextColor={theme.muted}
                  className="mb-3 rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Subtítulo del encabezado</Text>
                <TextInput
                  value={draftPreferences.headerSubtitle}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      headerSubtitle: value,
                    }))
                  }
                  placeholder="Solicitud logística corporativa"
                  placeholderTextColor={theme.muted}
                  className="mb-3 rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre del botón Bolsas</Text>
                <TextInput
                  value={draftPreferences.categoryDisplayNames.bolsas}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      categoryDisplayNames: {
                        ...normalizeCategoryDisplayNames(current.categoryDisplayNames),
                        bolsas: value,
                      },
                    }))
                  }
                  placeholder="Bolsas"
                  placeholderTextColor={theme.muted}
                  className="mb-2 rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre del botón Cajas</Text>
                <TextInput
                  value={draftPreferences.categoryDisplayNames.cajas}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      categoryDisplayNames: {
                        ...normalizeCategoryDisplayNames(current.categoryDisplayNames),
                        cajas: value,
                      },
                    }))
                  }
                  placeholder="Cajas"
                  placeholderTextColor={theme.muted}
                  className="mb-2 rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre del botón Otros</Text>
                <TextInput
                  value={draftPreferences.categoryDisplayNames.otros}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      categoryDisplayNames: {
                        ...normalizeCategoryDisplayNames(current.categoryDisplayNames),
                        otros: value,
                      },
                    }))
                  }
                  placeholder="Otros"
                  placeholderTextColor={theme.muted}
                  className="mb-3 rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Modo visual</Text>
                <View className="mb-3 flex-row gap-2">
                  <Pressable
                    onPress={() =>
                      setDraftPreferences((current) => ({
                        ...current,
                        themeMode: 'dark',
                      }))
                    }
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    className="flex-1 rounded-ind border px-3 py-3"
                    style={draftPreferences.themeMode === 'dark' ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
                  >
                    <Text className="text-center text-xs font-semibold tracking-[0.06em]" style={{ color: draftPreferences.themeMode === 'dark' ? accentTextColor : theme.text }}>
                      Modo oscuro
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setDraftPreferences((current) => ({
                        ...current,
                        themeMode: 'light',
                      }))
                    }
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    className="flex-1 rounded-ind border px-3 py-3"
                    style={draftPreferences.themeMode === 'light' ? { backgroundColor: accent.color, borderColor: accent.border } : { backgroundColor: theme.panelAltBg, borderColor: theme.border }}
                  >
                    <Text className="text-center text-xs font-semibold tracking-[0.06em]" style={{ color: draftPreferences.themeMode === 'light' ? accentTextColor : theme.text }}>
                      Modo claro
                    </Text>
                  </Pressable>
                </View>

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Prefijo del folio</Text>
                <TextInput
                  value={draftPreferences.folioPrefix}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      folioPrefix: normalizeFolioPrefixInput(value),
                    }))
                  }
                  placeholder="CS"
                  placeholderTextColor={theme.muted}
                  className="mb-3 rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />
                <View className="mb-3 rounded-ind border px-3 py-3" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                  <Text className="text-[13px] tracking-[0.08em]" style={{ color: theme.muted }}>Vista de folio</Text>
                  <Text className="mt-1 text-base font-semibold" style={{ color: theme.text }}>
                    {buildRequestCode(draftPreferences.folioPrefix, nextLeadNumber)}
                  </Text>
                  <Text className="mt-1 text-xs" style={{ color: theme.muted }}>Prefijo permitido: A-Z, 0-9 y guion (máx. 8).</Text>
                </View>

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Texto al pie del correo</Text>
                <TextInput
                  value={draftPreferences.emailNote}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      emailNote: value,
                    }))
                  }
                  placeholder="Operación interna segura y trazable."
                  placeholderTextColor={theme.muted}
                  className="mb-4 rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Machote del correo</Text>
                <TextInput
                  value={templateEditorValue}
                  onChangeText={updateTemplateFromText}
                  multiline
                  numberOfLines={8}
                  textAlignVertical="top"
                  placeholder="Escribe el machote y usa placeholders entre llaves."
                  placeholderTextColor={theme.muted}
                  className="mb-2 min-h-[170px] rounded-ind border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />
                <Text className="mb-3 text-xs" style={{ color: theme.muted }}>
                  Placeholders: {'{logo}'} {'{greeting}'} {'{folio}'} {'{totalMaterials}'} {'{totalPieces}'} {'{totalKg}'} {'{attachmentNote}'} {'{emailNote}'}
                </Text>

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Texto para Excel / CSV</Text>
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
                      placeholderTextColor={theme.muted}
                      className="mb-3 min-h-[96px] rounded-ind border px-3 py-3"
                      style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                  />

                <Text className="mb-1 text-xs" style={{ color: theme.muted }}>Logo de la empresa</Text>
                <Text className="mb-3 text-xs" style={{ color: theme.muted }}>
                    Carga el logo desde la galería del dispositivo. La app lo guarda en local al presionar guardar.
                  </Text>

                  <View className="mb-3 flex-row gap-2">
                  <Pressable
                    onPress={() => void pickLogoFromDevice()}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    className="flex-1 min-h-[46px] items-center justify-center rounded-ind border px-3 py-3"
                    style={({ pressed }) => [
                      { borderColor: theme.border, backgroundColor: theme.panelAltBg },
                      pressed ? { opacity: 0.86 } : undefined,
                    ]}
                  >
                    <Text className="text-center text-xs font-semibold tracking-[0.06em]" style={{ color: theme.text }}>
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
                      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                      className="flex-1 min-h-[46px] items-center justify-center rounded-ind border px-3 py-3"
                      style={({ pressed }) => [
                        { borderColor: theme.border, backgroundColor: theme.panelAltBg },
                        pressed ? { opacity: 0.86 } : undefined,
                      ]}
                    >
                      <Text className="text-center text-xs font-semibold tracking-[0.06em]" style={{ color: theme.text }}>
                        Quitar logo
                      </Text>
                    </Pressable>
                  </View>

                  <View className="mb-4 rounded-ind border px-4 py-4" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
                    <Text className="mb-2 text-[13px] tracking-[0.08em]" style={{ color: theme.muted }}>Vista previa</Text>
                    <View className="flex-row items-center gap-3">
                      <View className="h-14 w-14 items-center justify-center rounded-ind overflow-hidden" style={{ backgroundColor: theme.panelAltBg }}>
                        {draftPreferences.logoSource ? (
                          <Image source={{ uri: draftPreferences.logoSource }} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />
                        ) : (
                          <MaterialCommunityIcons name="image-outline" size={22} color={accent.color} />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold" style={{ color: theme.text }}>{draftPreferences.logoLabel || 'Sin logo cargado'}</Text>
                        <Text className="mt-1 text-xs" style={{ color: theme.muted }}>
                          {draftPreferences.logoSource ? 'Se usará en app, correo y exportación cuando guardes.' : 'Todavía no hay un logo personalizado.'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="mb-4 rounded-ind border px-4 py-4" style={{ backgroundColor: theme.panelBg, borderColor: accent.border }}>
                    <Text className="mb-2 text-[13px] tracking-[0.08em]" style={{ color: theme.muted }}>Base de materiales</Text>
                    <Text className="mb-3 text-xs" style={{ color: theme.muted }}>
                      Importa un archivo Excel o CSV con columnas: categoria, titulo, modo, unidad_solicitud, peso_por_100, unidad_peso.
                    </Text>
                    <Pressable
                      onPress={() => void importMaterialsDatabase()}
                      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                      className="min-h-[46px] items-center justify-center rounded-ind border px-3 py-3"
                      style={({ pressed }) => [
                        { borderColor: theme.border, backgroundColor: theme.panelAltBg },
                        pressed ? { opacity: 0.86 } : undefined,
                      ]}
                    >
                      <Text className="text-center text-xs font-semibold tracking-[0.06em]" style={{ color: theme.text }}>
                        Importar base desde Excel/CSV
                      </Text>
                    </Pressable>
                  </View>

                  <Text className="mb-2 text-xs" style={{ color: theme.muted }}>Color de acento</Text>
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
                          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                          className="rounded-ind border border-corporate-border px-3 py-2"
                          style={{
                            borderColor: active ? preset.border : theme.border,
                            backgroundColor: active ? preset.color : theme.panelAltBg,
                          }}
                        >
                          <Text className="text-xs font-semibold" style={{ color: active ? getAccessibleTextColorForAccent(preset.color) : theme.text }}>
                            {preset.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                <View className="mt-4 flex-row items-center justify-between gap-3">
                  <Text className="text-xs font-medium" style={{ color: hasPendingPreferenceChanges ? UI_COLORS.danger : theme.muted }}>
                    {hasPendingPreferenceChanges ? 'Hay cambios sin guardar.' : 'Configuración guardada.'}
                  </Text>
                  <Pressable
                    onPress={savePreferences}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    className="rounded-ind border border-corporate-primary px-4 py-3"
                    style={({ pressed }) => [
                      { backgroundColor: accent.color, borderColor: accent.border },
                      pressed ? { opacity: 0.84 } : undefined,
                    ]}
                  >
                    <Text className="text-xs font-semibold tracking-[0.04em]" style={{ color: isDarkTheme ? UI_COLORS.white : accentTextColor }}>Guardar cambios</Text>
                  </Pressable>
                </View>
              </View>

              {currentMaterials.map((item) => (
                <ConfigRow
                  key={item.id}
                  item={item}
                  accent={accent}
                    accentTextColor={accentTextColor}
                    theme={theme}
                  onChange={updateMaterialById}
                  onDelete={removeMaterial}
                  categoryIcon={categoryIcon}
                  unitLabel={unitLabel}
                />
              ))}
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

