import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  Platform,
  KeyboardAvoidingView,
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
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useAppColorScheme } from '../hooks/useAppColorScheme';
import { useAppPreferences } from '../hooks/useAppPreferences';
import { useCart } from '../hooks/useCart';
import { useMaterials } from '../hooks/useMaterials';
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
import Typography from '../components/Typography';
import CorporateButton from '../components/CorporateButton';
import { useHeaderPreferencesStore } from '../store/useHeaderPreferencesStore';
import { persistLogoLocally, sendLogisticsEmail, stringToTemplateElements, templateElementsToString } from '../services/logisticsService';
import { createBackupFile, readBackupFile } from '../services/backupService';
import { loadStoredConfigFromDb, saveStoredConfigToDb } from '../services/databaseService';
import type {
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

const BRAND_ACCENT = {
  label: 'Azul Corporativo',
  color: '#1D4ED8',
  border: '#2563EB',
  soft: '#DBEAFE',
};

const UI_COLORS = {
  blue: '#0052CC',
  white: '#FFFFFF',
  text: '#0D2447',
  muted: '#4E6B94',
  darkMuted: '#A9C4EA',
  border: '#D7E4F5',
  surface: '#FFFFFF',
  background: '#F2F7FD',
  danger: '#DC2626',
  darkBackground: '#081A33',
  darkSurface: '#0E2748',
  darkBorder: '#23456F',
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
    '',
    'Folio: {folio}',
    '',
    '{materialTable}',
    '',
    'Total a surtir: {totalKg}',
    'Fecha: {requestDate}',
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
const BACKUP_META_KEY = 'calcpack.materials.backup.meta.v1';
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

export default function BolsasScreen() {
  // Cargar fuentes profesionales Inter
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Detectar automáticamente tema del SO (y permitir override manual)
  const { theme: osTheme } = useAppColorScheme();

  const { selectedCategory, setSelectedCategory, selectedMaterialId, setSelectedMaterialId, materials, setMaterials } = useMaterials();
  const { recipientEmail, setRecipientEmail, cartItems, setCartItems, nextLeadNumber, setNextLeadNumber } = useCart();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);
  const {
    preferences,
    setPreferences,
    draftPreferences,
    setDraftPreferences,
    templateElements,
    setTemplateElements,
    draftTemplateElements,
    setDraftTemplateElements,
    runtimeLogoSource,
    setRuntimeLogoSource,
    logoPermissionDenied,
    setLogoPermissionDenied,
    drafts,
    setDrafts,
  } = useAppPreferences(DEFAULT_PREFERENCES);
  const sectionAnimations = useRef(Array.from({ length: 4 }, () => new Animated.Value(0))).current;
  const categorySectionAnimation = useRef(new Animated.Value(1)).current;
  const settingsPanelAnimation = useRef(new Animated.Value(0)).current;
  const [renderSettingsPanel, setRenderSettingsPanel] = useState(false);
  const accent = BRAND_ACCENT;
  const setHeaderPreferences = useHeaderPreferencesStore((state) => state.setHeaderPreferences);
  
  // Tema automático del SO + preferencia manual del usuario
  const isDarkTheme = draftPreferences.themeMode === 'dark' ? true : draftPreferences.themeMode === 'light' ? false : osTheme === 'dark';
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
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const effectiveHeaderLogoSource = draftPreferences.logoSource || runtimeLogoSource;
  const effectiveSavedLogoSource = preferences.logoSource || runtimeLogoSource;
  const effectiveDraftLogoPreviewSource = draftPreferences.logoSource || runtimeLogoSource;

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
    let isMounted = true;

    async function loadStoredConfig() {
      try {
        await AsyncStorage.multiRemove(LEGACY_STORAGE_KEYS);

        const dbStoredConfig = await loadStoredConfigFromDb();

        if (dbStoredConfig) {
          let logoSourceToUse = dbStoredConfig.preferences.logoSource;

          if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
            try {
              const storedLogoDataUri = sessionStorage.getItem('calcpack.logo.datauri');
              if (storedLogoDataUri && storedLogoDataUri.startsWith('data:image/')) {
                logoSourceToUse = storedLogoDataUri;
              }
            } catch {
              // Si sessionStorage falla, se continúa con logo persistido.
            }
          }

          const persistableLogoSource = Platform.OS === 'web' && logoSourceToUse.startsWith('data:image/') ? '' : logoSourceToUse;
          const nextPreferencesFromDb: AppPreferences = {
            ...dbStoredConfig.preferences,
            logoSource: persistableLogoSource,
            categoryDisplayNames: normalizeCategoryDisplayNames(dbStoredConfig.preferences.categoryDisplayNames),
          };

          setSelectedCategory(dbStoredConfig.selectedCategory);
          setSelectedMaterialId(dbStoredConfig.selectedMaterialId);
          setRecipientEmail(dbStoredConfig.recipientEmail);
          setMaterials(dbStoredConfig.materials);
          setCartItems(dbStoredConfig.cartItems);
          setNextLeadNumber(dbStoredConfig.nextLeadNumber);
          setRuntimeLogoSource(logoSourceToUse);
          setPreferences(nextPreferencesFromDb);
          setDraftPreferences(nextPreferencesFromDb);
          setHeaderPreferences({
            appName: nextPreferencesFromDb.appName,
            headerSubtitle: nextPreferencesFromDb.headerSubtitle,
            logoSource: logoSourceToUse,
            themeMode: nextPreferencesFromDb.themeMode,
          });

          const templateStr = typeof nextPreferencesFromDb.emailTemplate === 'string' ? nextPreferencesFromDb.emailTemplate : DEFAULT_PREFERENCES.emailTemplate;
          const elements = typeof templateStr === 'string' ? stringToTemplateElements(templateStr as string) : templateStr;
          setTemplateElements(elements);
          setDraftTemplateElements(elements);

          setStatusMessage('Configuración cargada desde SQLite');
          setStatusType('success');
          setIsLoading(false);
          return;
        }

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

          const persistableLogoSource = Platform.OS === 'web' && logoSourceToUse.startsWith('data:image/') ? '' : logoSourceToUse;
          
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
            logoSource: persistableLogoSource,
            logoLabel:
              typeof parsed.preferences.logoLabel === 'string' && parsed.preferences.logoLabel.trim()
                ? parsed.preferences.logoLabel.trim()
                : DEFAULT_PREFERENCES.logoLabel,
            accentKey: DEFAULT_PREFERENCES.accentKey,
            categoryDisplayNames: normalizeCategoryDisplayNames(parsed.preferences.categoryDisplayNames),
          };

          setRuntimeLogoSource(logoSourceToUse);
          setPreferences(nextPreferences);
          setDraftPreferences(nextPreferences);
          setHeaderPreferences({
            appName: nextPreferences.appName,
            headerSubtitle: nextPreferences.headerSubtitle,
            logoSource: logoSourceToUse,
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

  useEffect(() => {
    let mounted = true;

    async function loadBackupMeta() {
      try {
        const stored = await AsyncStorage.getItem(BACKUP_META_KEY);

        if (!mounted || !stored) {
          return;
        }

        const parsed = JSON.parse(stored) as { lastBackupAt?: string };

        if (typeof parsed.lastBackupAt === 'string' && parsed.lastBackupAt.trim()) {
          setLastBackupAt(parsed.lastBackupAt);
        }
      } catch {
        // Si falla la lectura del metadata, no se bloquea la app.
      }
    }

    void loadBackupMeta();

    return () => {
      mounted = false;
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
      // Persistent storage now handled exclusively by SQLite
      void saveStoredConfigToDb(payload);
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
    const persistableLogoSource = Platform.OS === 'web' && persistedLogo.logoSource.startsWith('data:image/')
      ? ''
      : persistedLogo.logoSource;

    const nextPreferences: AppPreferences = {
      appName: normalizePreferenceText(draftPreferences.appName, DEFAULT_PREFERENCES.appName),
      headerSubtitle: normalizePreferenceText(draftPreferences.headerSubtitle, DEFAULT_PREFERENCES.headerSubtitle),
      themeMode: draftPreferences.themeMode === 'light' ? 'light' : 'dark',
      folioPrefix: sanitizeFolioPrefix(draftPreferences.folioPrefix),
      emailTemplate: templateElementsToString(draftTemplateElements),
      emailNote: normalizePreferenceText(draftPreferences.emailNote, DEFAULT_PREFERENCES.emailNote),
      sheetNote: normalizePreferenceText(draftPreferences.sheetNote, DEFAULT_PREFERENCES.sheetNote),
      // En web, NO guardar data URI completo en AsyncStorage (es muy grande); se guarda en sessionStorage
      logoSource: persistableLogoSource,
      logoLabel: normalizePreferenceText(persistedLogo.logoLabel, DEFAULT_PREFERENCES.logoLabel),
      accentKey: DEFAULT_PREFERENCES.accentKey,
      categoryDisplayNames: normalizeCategoryDisplayNames(draftPreferences.categoryDisplayNames),
    };

    setRuntimeLogoSource(persistedLogo.logoSource);
    setPreferences(nextPreferences);
    setDraftPreferences(nextPreferences);
    setTemplateElements(draftTemplateElements);
    setDraftTemplateElements(draftTemplateElements);
    setHeaderPreferences({
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
      setLogoPermissionDenied(true);
      Alert.alert('Carga de logo', 'Se necesita permiso para acceder a la galería.');
      return;
    }

    setLogoPermissionDenied(false);

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

      let rows: Record<string, unknown>[] = [];

      if (isCsv) {
        const parsedCsv = Papa.parse<Record<string, string>>(fileContent, {
          header: true,
          skipEmptyLines: 'greedy',
          transformHeader: (header: string) => header.trim(),
        });

        if (parsedCsv.errors.length > 0) {
          setStatusMessage(`CSV inválido: ${parsedCsv.errors[0]?.message ?? 'Error de formato'}`);
          setStatusType('error');
          return;
        }

        rows = parsedCsv.data.map((row: Record<string, string>) => ({ ...row }));
      } else {
        const workbook = XLSX.read(fileContent, { type: 'base64' });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
          setStatusMessage('El archivo no contiene hojas para importar.');
          setStatusType('error');
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      }
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

  async function shareBackupFile(fileUri: string, fileName: string) {
    if (Platform.OS === 'web') {
      const jsonContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const canShare = await Sharing.isAvailableAsync();

    if (!canShare) {
      throw new Error('No se encontró un método para compartir el respaldo en este dispositivo.');
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Respaldar SurtiTrack',
      UTI: 'public.json',
    });
  }

  function buildStoredConfigSnapshot(): StoredConfig {
    return {
      selectedCategory,
      selectedMaterialId,
      recipientEmail,
      materials,
      cartItems,
      nextLeadNumber,
      preferences: {
        ...preferences,
        logoSource: effectiveSavedLogoSource,
      },
    };
  }

  async function createCloudBackup() {
    try {
      setIsCreatingBackup(true);
      const snapshot = buildStoredConfigSnapshot();
      const backup = await createBackupFile(snapshot);
      await shareBackupFile(backup.fileUri, backup.fileName);

      setLastBackupAt(backup.exportedAt);
      await AsyncStorage.setItem(BACKUP_META_KEY, JSON.stringify({ lastBackupAt: backup.exportedAt }));

      setStatusMessage('Respaldo generado. Súbelo a Drive, OneDrive o iCloud desde el menú compartir.');
      setStatusType('success');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'No se pudo generar el respaldo.';
      setStatusMessage(message);
      setStatusType('error');
    } finally {
      setIsCreatingBackup(false);
    }
  }

  async function restoreFromBackup() {
    try {
      setIsRestoringBackup(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];
      const parsed = await readBackupFile(asset.uri);
      const restored = parsed.config;
      const logoSourceToUse = typeof restored.preferences.logoSource === 'string' ? restored.preferences.logoSource.trim() : '';
      const persistableLogoSource = Platform.OS === 'web' && logoSourceToUse.startsWith('data:image/') ? '' : logoSourceToUse;

      if (Platform.OS === 'web' && logoSourceToUse.startsWith('data:image/') && typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem('calcpack.logo.datauri', logoSourceToUse);
        } catch {
          // Si falla sessionStorage, no se bloquea la restauración.
        }
      }

      const normalizedPreferences: AppPreferences = {
        ...restored.preferences,
        logoSource: persistableLogoSource,
        categoryDisplayNames: normalizeCategoryDisplayNames(restored.preferences.categoryDisplayNames),
      };

      setRuntimeLogoSource(logoSourceToUse);
      setSelectedCategory(restored.selectedCategory);
      setSelectedMaterialId(restored.selectedMaterialId);
      setRecipientEmail(restored.recipientEmail);
      setMaterials(restored.materials);
      setCartItems(restored.cartItems);
      setNextLeadNumber(restored.nextLeadNumber);
      setPreferences(normalizedPreferences);
      setDraftPreferences(normalizedPreferences);

      const restoredTemplate = typeof normalizedPreferences.emailTemplate === 'string'
        ? stringToTemplateElements(normalizedPreferences.emailTemplate)
        : normalizedPreferences.emailTemplate;
      setTemplateElements(restoredTemplate);
      setDraftTemplateElements(restoredTemplate);

      setHeaderPreferences({
        appName: normalizedPreferences.appName,
        headerSubtitle: normalizedPreferences.headerSubtitle,
        logoSource: logoSourceToUse,
        themeMode: normalizedPreferences.themeMode,
      });

      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...restored,
          preferences: normalizedPreferences,
        })
      );

      await saveStoredConfigToDb({
        ...restored,
        preferences: normalizedPreferences,
      });

      setStatusMessage('Respaldo restaurado correctamente.');
      setStatusType('success');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'No se pudo restaurar el respaldo.';
      setStatusMessage(message);
      setStatusType('error');
    } finally {
      setIsRestoringBackup(false);
    }
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
          <Typography variant="body" weight="semibold" color={theme.text}>Cargando configuración...</Typography>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1" style={{ backgroundColor: theme.pageBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: theme.pageBg }}
        contentContainerClassName="px-4 pb-36 pt-5"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <View className="w-full max-w-[1120px] self-center rounded-2xl border px-5 py-5 shadow-sm" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
        {statusMessage ? (
          <View className="mb-4">
            <View className={`rounded-xl border px-4 py-3 ${statusType === 'error' ? 'border-corporate-error bg-corporate-error/10' : 'border-corporate-primary/20'}`} style={{ backgroundColor: theme.panelAltBg }}>
              <Typography variant="body" weight="medium" color={statusType === 'error' ? UI_COLORS.danger : accent.color}>{statusMessage}</Typography>
            </View>
          </View>
        ) : null}

        <Animated.View className="mb-5 rounded-2xl border px-5 py-5 shadow-sm" style={[{ backgroundColor: theme.panelBg, borderColor: theme.border }, getSectionEntryStyle(0)]}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Typography variant="caption" color={theme.muted} tracking="wide">{preferences.appName}</Typography>
              <Typography variant="h1" weight="bold" color={theme.text} style={{ marginTop: 4 }}>{preferences.headerSubtitle}</Typography>
            </View>
            <View className="items-center justify-center rounded-xl border px-3 py-3" style={{ borderColor: theme.border, backgroundColor: theme.panelAltBg }}>
              {effectiveSavedLogoSource ? (
                <Image source={{ uri: effectiveSavedLogoSource }} style={{ width: 48, height: 48, borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <MaterialCommunityIcons name="clipboard-text-outline" size={22} color={accent.color} />
              )}
            </View>
          </View>
          <Typography variant="body" color={theme.muted} style={{ marginTop: 8 }}>
            {preferences.emailNote}
          </Typography>
        </Animated.View>

        <Animated.View className="mb-5 rounded-2xl border px-4 py-4 shadow-sm" style={[{ backgroundColor: theme.panelBg, borderColor: theme.border }, getSectionEntryStyle(0)]}>
          <View className="flex-row flex-wrap gap-2">
            <View className="min-w-[31%] flex-1 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Typography variant="caption" color={theme.muted} tracking="tight">Catálogo</Typography>
              <Typography variant="h2" weight="bold" color={theme.text} style={{ marginTop: 4 }}>{currentMaterials.length}</Typography>
              <Typography variant="caption" color={theme.muted}>{categoryLabelForUi(selectedCategory)}</Typography>
            </View>
            <View className="min-w-[31%] flex-1 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Typography variant="caption" color={theme.muted} tracking="tight">En curso</Typography>
              <Typography variant="h2" weight="bold" color={theme.text} style={{ marginTop: 4 }}>{requestSummary.materials}</Typography>
              <Typography variant="caption" color={theme.muted}>Materiales</Typography>
            </View>
            <View className="min-w-[31%] flex-1 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Typography variant="caption" color={theme.muted} tracking="tight">Kg programados</Typography>
              <Typography variant="h2" weight="bold" color={theme.text} style={{ marginTop: 4 }}>{formatNumber(requestSummary.totalKg)}</Typography>
              <Typography variant="caption" color={theme.muted}>Acumulado</Typography>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={getCategoryTransitionStyle()}>
        <View className="mb-3">
          <Typography variant="body" weight="semibold" color={theme.muted} tracking="wide" style={{ marginBottom: 8 }}>Tipo de material</Typography>
          <View className="flex-row gap-2">
            {CATEGORIES.map((category) => {
              const active = category.key === selectedCategory;

              return (
                <CorporateButton
                  key={category.key}
                  onPress={() => setSelectedCategory(category.key)}
                  label={categoryLabelForUi(category.key)}
                  icon={{ name: category.icon, position: 'left' }}
                  variant={active ? 'primary' : 'secondary'}
                  size="md"
                  fullWidth
                  theme={theme}
                  accent={accent}
                  accentTextColor={accentTextColor}
                  className="min-h-[48px]"
                />
              );
            })}
          </View>
        </View>

        <View className="mb-4 rounded-2xl border px-4 py-4 shadow-sm" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
          <View className="mb-3 flex-row items-center justify-between">
            <Typography className="text-sm font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>Alta de material</Typography>
            <Typography className="text-xs" style={{ color: theme.muted }}>{categoryLabelForUi(selectedCategory)}</Typography>
          </View>

          <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre</Typography>
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
            className="mb-3 rounded-ind border px-3 py-2.5"
            style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
          />

          {selectedCategory === 'bolsas' ? (
            <>
              <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Unidad base del peso</Typography>
              <View className="mb-3 flex-row gap-2">
                <CorporateButton
                  onPress={() =>
                    setDrafts((current) => ({
                      ...current,
                      bolsas: { ...current.bolsas, weightUnit: 'g' },
                    }))
                  }
                  label="Gramos"
                  variant={drafts.bolsas.weightUnit === 'g' ? 'primary' : 'secondary'}
                  size="sm"
                  fullWidth
                  theme={theme}
                  accent={accent}
                  accentTextColor={accentTextColor}
                  className="min-h-[44px]"
                />
                <CorporateButton
                  onPress={() =>
                    setDrafts((current) => ({
                      ...current,
                      bolsas: { ...current.bolsas, weightUnit: 'kg' },
                    }))
                  }
                  label="Kilogramos"
                  variant={drafts.bolsas.weightUnit === 'kg' ? 'primary' : 'secondary'}
                  size="sm"
                  fullWidth
                  theme={theme}
                  accent={accent}
                  accentTextColor={accentTextColor}
                  className="min-h-[44px]"
                />
              </View>

              <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Peso por 100 piezas ({drafts.bolsas.weightUnit})</Typography>
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
                className={`rounded-ind border px-3 py-2.5 ${drafts.bolsas.weightInput.trim().length > 0 && !isNonEmptyPositive(convertToKg(parseOptionalPositiveNumber(drafts.bolsas.weightInput), drafts.bolsas.weightUnit)) ? 'border-corporate-error bg-corporate-error/10' : ''}`}
                style={{ backgroundColor: theme.inputBg, borderColor: drafts.bolsas.weightInput.trim().length > 0 && !isNonEmptyPositive(convertToKg(parseOptionalPositiveNumber(drafts.bolsas.weightInput), drafts.bolsas.weightUnit)) ? UI_COLORS.danger : theme.inputBorder, color: theme.text }}
              />
            </>
          ) : null}

          {selectedCategory === 'cajas' ? (
            <View className="rounded-ind border px-3 py-3" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
              <Typography className="text-sm" style={{ color: theme.text }}>Las cajas se solicitarán directamente por piezas.</Typography>
            </View>
          ) : null}

          {selectedCategory === 'otros' ? (
            <>
              <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Unidad de solicitud</Typography>
              <View className="flex-row gap-2">
                {(['l', 'kg', 'g'] as const).map((unit) => {
                  const active = drafts.otros.otherUnit === unit;

                  return (
                    <CorporateButton
                      key={unit}
                      onPress={() =>
                        setDrafts((current) => ({
                          ...current,
                          otros: { ...current.otros, otherUnit: unit },
                        }))
                      }
                      label={unitLabel(unit)}
                      variant={active ? 'primary' : 'secondary'}
                      size="sm"
                      fullWidth
                      theme={theme}
                      accent={accent}
                      accentTextColor={accentTextColor}
                      className="min-h-[44px]"
                    />
                  );
                })}
              </View>
            </>
          ) : null}

          <CorporateButton
            onPress={addMaterialToCurrentCategory}
            label={`Agregar material en ${categoryLabelForUi(selectedCategory)}`}
            variant="primary"
            size="md"
            theme={theme}
            accent={accent}
            accentTextColor={accentTextColor}
            className="mt-4"
          />
        </View>

        {currentMaterials.length === 0 ? (
          <View className="mb-4 rounded-xl border px-4 py-5" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
            <Typography className="text-sm font-medium" style={{ color: theme.text }}>No hay materiales en {categoryLabelForUi(selectedCategory)}.</Typography>
            <Typography className="mt-1 text-xs" style={{ color: theme.muted }}>Agrega uno desde la sección superior para comenzar la solicitud.</Typography>
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

        <View className="mt-3 rounded-2xl border px-4 py-4 shadow-sm" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
          <Typography className="mb-2 text-sm font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>
            {selectedMaterial ? getInputLabel(selectedMaterial) : 'Cantidad'}
          </Typography>
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
            className={`rounded-ind border px-4 py-3 text-xl font-semibold ${selectedMaterial && !isNonEmptyPositive(selectedMaterial.requestValue) ? 'border-corporate-error bg-corporate-error/10' : ''}`}
            style={{ backgroundColor: theme.inputBg, borderColor: selectedMaterial && !isNonEmptyPositive(selectedMaterial.requestValue) ? UI_COLORS.danger : theme.inputBorder, color: theme.text }}
          />
          <Typography className="mt-2 text-xs" style={{ color: theme.muted }}>
            Captura el dato base y el sistema calcula automáticamente el resultado.
          </Typography>
        </View>

        <View className="mt-4 rounded-2xl border px-5 py-6 shadow-sm" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
          <Typography className="text-center text-[13px] font-semibold tracking-[0.12em]" style={{ color: theme.muted }}>
            {selectedMaterial ? getResultLabel(selectedMaterial) : 'Resultado'}
          </Typography>
          <Typography className="mt-2 text-center text-4xl font-bold" style={{ color: theme.text }}>
            {selectedMaterial ? formatNumber(selectedResultValue) : '0.000'}
          </Typography>
          <Typography className="mt-1 text-center text-xs" style={{ color: accent.soft }}>
            {selectedMaterial ? unitLabel(selectedResultUnit) : 'Selecciona o crea un material'}
          </Typography>
          <Typography className="mt-2 text-center text-xs" style={{ color: theme.muted }}>
            {selectedMaterial ? `Categoría activa: ${categoryLabelForUi(selectedMaterial.category)} · ${selectedMaterial.title}` : 'Sin material seleccionado'}
          </Typography>
        </View>

        <CorporateButton
          onPress={addToRequest}
          label="Agregar a la solicitud"
          variant="primary"
          size="md"
          theme={theme}
          accent={accent}
          accentTextColor={accentTextColor}
          className="mt-4"
        />
        </Animated.View>

        <Animated.View className="mt-7" style={getSectionEntryStyle(2)}>
          <View className="mb-3 flex-row items-start justify-between">
            <View className="flex-row items-start gap-2">
              <View className="h-5 w-5 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={16} color={UI_COLORS.blue} />
              </View>
              <View>
                <Typography className="text-xl font-semibold" style={{ color: theme.text }}>Resumen de solicitud</Typography>
                <Typography className="mt-1 text-xs" style={{ color: theme.muted }}>Control operativo previo al envío</Typography>
              </View>
            </View>
            <View className="items-end gap-1">
              <View className="rounded-pill border px-2.5 py-1" style={{ borderColor: theme.border, backgroundColor: theme.panelAltBg }}>
                <Typography className="text-[11px]" style={{ color: theme.muted }}>Próximo folio: {buildRequestCode(preferences.folioPrefix, nextLeadNumber)}</Typography>
              </View>
              <Typography className="text-xs" style={{ color: theme.muted }}>
                {formatNumber(requestSummary.totalPieces)} pzas · {formatNumber(requestSummary.totalKg)} kg
              </Typography>
            </View>
          </View>

          <View className="rounded-2xl border p-2 shadow-sm" style={{ borderColor: theme.border, backgroundColor: theme.panelBg }}>
            <View className="mb-2 rounded-xl border px-3 py-2" style={{ borderColor: theme.border, backgroundColor: theme.panelAltBg }}>
              <View className="mb-2 flex-row items-center gap-2">
                <View className="h-4 w-4 items-center justify-center rounded border" style={{ borderColor: theme.border }}>
                  <MaterialCommunityIcons name="email-fast-outline" size={10} color={UI_COLORS.blue} />
                </View>
                <Typography className="text-xs font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>Destino de envío</Typography>
              </View>
              <TextInput
                value={recipientEmail}
                onChangeText={setRecipientEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="correo@empresa.com"
                placeholderTextColor={theme.muted}
                className={`rounded-ind border px-3 py-3 ${recipientEmail.trim().length > 0 && !isValidEmail(recipientEmail) ? 'border-corporate-error bg-corporate-error/10' : ''}`}
                style={{ backgroundColor: theme.inputBg, borderColor: recipientEmail.trim().length > 0 && !isValidEmail(recipientEmail) ? UI_COLORS.danger : theme.inputBorder, color: theme.text }}
              />
              <Typography className="mt-2 text-xs" style={{ color: recipientEmail.trim().length === 0 || isValidEmail(recipientEmail) ? theme.muted : UI_COLORS.danger }}>
                {recipientEmail.trim().length === 0
                  ? 'Este correo se usa para enviar el resumen y queda guardado localmente.'
                  : isValidEmail(recipientEmail)
                    ? 'Correo válido para envío.'
                    : 'Formato de correo no válido.'}
              </Typography>
            </View>

            {cartItems.length === 0 ? (
              <View className="rounded-xl border border-dashed px-4 py-5" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                <View className="flex-row items-center gap-2">
                  <MaterialCommunityIcons name="tray-minus" size={16} color={theme.muted} />
                  <Typography className="text-sm font-medium" style={{ color: theme.text }}>No hay materiales en el resumen.</Typography>
                </View>
                <Typography className="mt-1 text-xs" style={{ color: theme.muted }}>Agrega materiales para habilitar el envío.</Typography>
              </View>
            ) : (
              cartItems.map((item) => (
                <View key={item.id} className="mb-2 rounded-xl border px-3 py-3" style={{ borderColor: theme.border, backgroundColor: theme.inputBg }}>
                  <View className="gap-3">
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="flex-1 pr-2">
                        <Typography className="text-sm font-semibold" style={{ color: theme.text }}>{item.materialTitle}</Typography>
                        <Typography className="text-[13px]" style={{ color: theme.muted }}>
                          {categoryLabelForUi(item.category)} · {modeLabel(item.calcMode)}
                        </Typography>
                      </View>
                      <CorporateButton
                        onPress={() => removeCartItem(item.id)}
                        label="Quitar"
                        variant="outline"
                        size="sm"
                        fullWidth={false}
                        theme={theme}
                        accent={accent}
                        accentTextColor={accentTextColor}
                        className="min-w-10"
                      />
                    </View>

                    <View className="flex-row flex-wrap gap-3">
                      <View className="rounded-ind border px-2 py-1" style={{ borderColor: theme.border }}>
                        <Typography className="text-[11px] tracking-[0.04em]" style={{ color: theme.muted }}>Capturado</Typography>
                        <Typography className="text-sm font-semibold" style={{ color: theme.text }}>{formatNumber(item.requestValue)}</Typography>
                      </View>
                      <View className="rounded-ind border px-2 py-1" style={{ borderColor: theme.border }}>
                        <Typography className="text-[11px] tracking-[0.04em]" style={{ color: theme.muted }}>Resultado</Typography>
                        <Typography className="text-sm font-semibold" style={{ color: theme.text }}>{formatNumber(item.calculatedValue)}</Typography>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}

            <View className="mt-2 flex-row gap-2">
              <CorporateButton
                onPress={clearCart}
                label="Vaciar solicitud"
                variant="secondary"
                size="sm"
                fullWidth
                theme={theme}
                accent={accent}
                accentTextColor={accentTextColor}
              />
              <CorporateButton
                onPress={() => {
                  void sendCartByEmail();
                }}
                label={isSendingEmail ? 'Enviando...' : 'Enviar solicitud'}
                variant="primary"
                size="sm"
                fullWidth
                disabled={!canSendEmail || isSendingEmail}
                theme={theme}
                accent={accent}
                accentTextColor={accentTextColor}
              />
            </View>
          </View>
        </Animated.View>

        <Animated.View className="mt-6 rounded-2xl border px-4 py-4 shadow-sm" style={[{ backgroundColor: theme.panelBg, borderColor: theme.border }, getSectionEntryStyle(3)]}>
          <CorporateButton
            onPress={() => setSettingsOpen((current) => !current)}
            label="Personalización de app"
            icon={{ name: settingsOpen ? 'chevron-up' : 'chevron-down', position: 'right' }}
            variant="secondary"
            size="md"
            theme={theme}
            accent={accent}
            accentTextColor={accentTextColor}
            className="w-full"
          />
          <Typography className="mt-1 text-xs" style={{ color: theme.muted }}>Marca, respaldo, plantilla y configuración visual</Typography>

          {renderSettingsPanel ? (
            <Animated.View className="mt-4 overflow-hidden" style={getSettingsPanelStyle()}>
              <View className="mb-4 rounded-2xl border px-4 py-4 shadow-sm" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
                <View className="mb-3 flex-row items-center gap-2">
                  <View className="h-4 w-4 items-center justify-center rounded border" style={{ borderColor: theme.border }}>
                    <MaterialCommunityIcons name="palette-outline" size={10} color={accent.color} />
                  </View>
                  <Typography className="text-xs font-semibold tracking-[0.06em]" style={{ color: theme.muted }}>Configuración general</Typography>
                </View>
                <Typography className="mb-3 text-xs" style={{ color: theme.muted }}>Ajusta marca, plantilla y operación en bloques independientes.</Typography>

                <View className="mb-3 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                  <Typography className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: theme.muted }}>Marca y encabezado</Typography>
                </View>

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre visible de la app</Typography>
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
                  className="mb-3 rounded-xl border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Subtítulo del encabezado</Typography>
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
                  className="mb-3 rounded-xl border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre del botón Bolsas</Typography>
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
                  className="mb-2 rounded-xl border px-3 py-2.5"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre del botón Cajas</Typography>
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
                  className="mb-2 rounded-xl border px-3 py-2.5"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Nombre del botón Otros</Typography>
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
                  className="mb-3 rounded-xl border px-3 py-2.5"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Modo visual</Typography>
                <View className="mb-3 flex-row gap-2">
                  {(() => {
                    const darkModeActive = draftPreferences.themeMode === 'dark';
                    const lightModeActive = draftPreferences.themeMode === 'light';

                    return (
                      <>
                        <CorporateButton
                          onPress={() =>
                            setDraftPreferences((current) => ({
                              ...current,
                              themeMode: 'dark',
                            }))
                          }
                          label="Modo oscuro"
                          variant={darkModeActive ? 'primary' : 'secondary'}
                          size="sm"
                          fullWidth
                          theme={theme}
                          accent={accent}
                          accentTextColor={accentTextColor}
                        />
                        <CorporateButton
                          onPress={() =>
                            setDraftPreferences((current) => ({
                              ...current,
                              themeMode: 'light',
                            }))
                          }
                          label="Modo claro"
                          variant={lightModeActive ? 'primary' : 'secondary'}
                          size="sm"
                          fullWidth
                          theme={theme}
                          accent={accent}
                          accentTextColor={accentTextColor}
                        />
                      </>
                    );
                  })()}
                </View>

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Prefijo del folio</Typography>
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
                  className="mb-3 rounded-xl border px-3 py-2.5"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />
                <View className="mb-3 rounded-xl border px-3 py-3" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                  <Typography className="text-[13px] tracking-[0.08em]" style={{ color: theme.muted }}>Vista de folio</Typography>
                  <Typography className="mt-1 text-base font-semibold" style={{ color: theme.text }}>
                    {buildRequestCode(draftPreferences.folioPrefix, nextLeadNumber)}
                  </Typography>
                  <Typography className="mt-1 text-xs" style={{ color: theme.muted }}>Prefijo permitido: A-Z, 0-9 y guion (máx. 8).</Typography>
                </View>

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Texto al pie del correo</Typography>
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
                  className="mb-4 rounded-xl border px-3 py-2.5"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />

                <View className="mb-3 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                  <Typography className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: theme.muted }}>Plantilla y comunicación</Typography>
                </View>

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Machote del correo</Typography>
                <TextInput
                  value={templateEditorValue}
                  onChangeText={updateTemplateFromText}
                  multiline
                  numberOfLines={8}
                  textAlignVertical="top"
                  placeholder="Escribe el machote y usa placeholders entre llaves."
                  placeholderTextColor={theme.muted}
                  className="mb-2 min-h-[170px] rounded-xl border px-3 py-3"
                  style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                />
                <Typography className="mb-3 text-xs" style={{ color: theme.muted }}>
                  Variables: {'{logo}'} {'{greeting}'} {'{folio}'} {'{materialTable}'} {'{requestDate}'} {'{totalKg}'} {'{attachmentNote}'} {'{emailNote}'}
                </Typography>

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Texto para Excel</Typography>
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
                        className="mb-3 min-h-[96px] rounded-xl border px-3 py-3"
                      style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }}
                  />

                <Typography className="mb-1 text-xs" style={{ color: theme.muted }}>Logo de la empresa</Typography>
                <Typography className="mb-3 text-xs" style={{ color: theme.muted }}>
                    Carga el logo desde la galería del dispositivo. La app lo guarda en local al presionar guardar.
                  </Typography>

                  <View className="mb-3 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                    <Typography className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: theme.muted }}>Identidad visual</Typography>
                  </View>

                  <View className="mb-3 flex-row gap-2">
                    <CorporateButton
                      onPress={() => void pickLogoFromDevice()}
                      label="Cargar desde galería"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      theme={theme}
                      accent={accent}
                      accentTextColor={accentTextColor}
                    />
                    <CorporateButton
                      onPress={() => {
                        setRuntimeLogoSource('');
                        setDraftPreferences((current) => ({
                          ...current,
                          logoSource: '',
                          logoLabel: DEFAULT_PREFERENCES.logoLabel,
                        }));
                      }}
                      label="Quitar logo"
                      variant="secondary"
                      size="sm"
                      fullWidth
                      theme={theme}
                      accent={accent}
                      accentTextColor={accentTextColor}
                    />
                  </View>

                  {logoPermissionDenied ? (
                    <View className="mb-3 rounded-xl border px-3 py-3" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                      <Typography className="text-xs font-semibold" style={{ color: UI_COLORS.danger }}>
                        Acceso a galería denegado.
                      </Typography>
                      <Typography className="mt-1 text-xs" style={{ color: theme.muted }}>
                        Habilítalo en ajustes del sistema para cargar logos desde imágenes.
                      </Typography>
                    </View>
                  ) : null}

                  <View className="mb-4 rounded-xl border px-4 py-4" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                    <Typography className="mb-2 text-[13px] tracking-[0.08em]" style={{ color: theme.muted }}>Vista previa</Typography>
                    <View className="flex-row items-center gap-3">
                      <View className="h-14 w-14 items-center justify-center rounded-ind overflow-hidden" style={{ backgroundColor: theme.panelAltBg }}>
                        {effectiveDraftLogoPreviewSource ? (
                          <Image source={{ uri: effectiveDraftLogoPreviewSource }} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />
                        ) : (
                          <MaterialCommunityIcons name="image-outline" size={22} color={accent.color} />
                        )}
                      </View>
                      <View className="flex-1">
                        <Typography className="text-sm font-semibold" style={{ color: theme.text }}>{draftPreferences.logoLabel || 'Sin logo cargado'}</Typography>
                        <Typography className="mt-1 text-xs" style={{ color: theme.muted }}>
                          {effectiveDraftLogoPreviewSource ? 'Se usará en app, correo y exportación cuando guardes.' : 'Todavía no hay un logo personalizado.'}
                        </Typography>
                      </View>
                    </View>
                  </View>

                  <View className="mb-4 rounded-xl border px-4 py-4" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                    <View className="mb-2 rounded-xl border px-3 py-2" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
                      <Typography className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: theme.muted }}>Datos operativos</Typography>
                    </View>
                    <Typography className="mb-2 text-[13px] tracking-[0.08em]" style={{ color: theme.muted }}>Base de materiales</Typography>
                    <Typography className="mb-3 text-xs" style={{ color: theme.muted }}>
                      Importa Excel/CSV con columnas: categoria, titulo, modo, unidad_solicitud, peso_por_100, unidad_peso.
                    </Typography>
                    <CorporateButton
                      onPress={() => void importMaterialsDatabase()}
                      label="Importar base desde Excel/CSV"
                      variant="secondary"
                      size="sm"
                      theme={theme}
                      accent={accent}
                      accentTextColor={accentTextColor}
                    />
                  </View>

                  <View className="mb-4 rounded-xl border px-4 py-4" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                    <Typography className="mb-2 text-[13px] tracking-[0.08em]" style={{ color: theme.muted }}>Respaldo en nube (JSON)</Typography>
                    <Typography className="mb-3 text-xs" style={{ color: theme.muted }}>
                      Genera un respaldo JSON y súbelo a Drive, OneDrive o iCloud desde compartir.
                    </Typography>
                    <View className="flex-row gap-2">
                      <CorporateButton
                        onPress={() => void createCloudBackup()}
                        label={isCreatingBackup ? 'Generando...' : 'Crear respaldo'}
                        variant="secondary"
                        size="sm"
                        fullWidth
                        disabled={isCreatingBackup || isRestoringBackup}
                        theme={theme}
                        accent={accent}
                        accentTextColor={accentTextColor}
                      />
                      <CorporateButton
                        onPress={() => void restoreFromBackup()}
                        label={isRestoringBackup ? 'Restaurando...' : 'Restaurar respaldo'}
                        variant="secondary"
                        size="sm"
                        fullWidth
                        disabled={isCreatingBackup || isRestoringBackup}
                        theme={theme}
                        accent={accent}
                        accentTextColor={accentTextColor}
                      />
                    </View>
                    <Typography className="mt-3 text-xs" style={{ color: theme.muted }}>
                      {lastBackupAt ? `Último respaldo: ${new Date(lastBackupAt).toLocaleString('es-MX')}` : 'Aún no has generado respaldos.'}
                    </Typography>
                  </View>

                <View className="mt-5 rounded-xl border px-3 py-3" style={{ backgroundColor: theme.panelAltBg, borderColor: theme.border }}>
                  <Typography className="mb-3 text-xs font-medium" style={{ color: hasPendingPreferenceChanges ? UI_COLORS.danger : theme.muted }}>
                    {hasPendingPreferenceChanges ? 'Hay cambios sin guardar.' : 'Configuración guardada.'}
                  </Typography>
                  <CorporateButton
                    onPress={savePreferences}
                    label="Guardar cambios"
                    variant="primary"
                    size="sm"
                    theme={theme}
                    accent={accent}
                    accentTextColor={accentTextColor}
                  />
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



