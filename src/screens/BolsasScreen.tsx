import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
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
  MaterialDraft,
  MaterialOption,
  MaterialUnit,
  StoredConfig,
} from '../types/logistics';

const ACCENT_PRESETS: Record<AccentKey, { label: string; color: string; border: string; soft: string }> = {
  red: { label: 'Naranja', color: '#FFB020', border: '#FFB020', soft: '#FFD27A' },
  blue: { label: 'Cobalto', color: '#4D8BFF', border: '#7AA7FF', soft: '#BFD3FF' },
  green: { label: 'Oliva', color: '#7BAE4A', border: '#96C268', soft: '#CFE2AF' },
  amber: { label: 'Acero', color: '#8A95A3', border: '#A4AFBC', soft: '#D2D9E2' },
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
  accentKey: 'red',
};

const STORAGE_KEY = 'calcpack.materials.config.v5';
const LEGACY_STORAGE_KEYS = [
  'calcpack.materials.config.v4',
  'calcpack.materials.config.v3',
  'calcpack.bolsas.config.v1',
  'calcpack.bolsas.config.v2',
];

const CATEGORIES: Array<{ key: MaterialCategory; label: string; badge: string }> = [
  { key: 'bolsas', label: 'Bolsas', badge: '🛍️' },
  { key: 'cajas', label: 'Cajas', badge: '📦' },
  { key: 'otros', label: 'Otros', badge: '🧩' },
];

const FOLIO_PREFIX_FALLBACK = 'CS';

function categoryLabel(category: MaterialCategory) {
  return CATEGORIES.find((item) => item.key === category)?.label ?? 'Otros';
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function triggerStatusFeedback(kind: 'success' | 'error') {
  if (Platform.OS === 'web') {
    return;
  }

  if (kind === 'success') {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return;
  }

  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

function normalizePreferenceText(value: string, fallback: string) {
  const normalized = value.trim();
  return normalized || fallback;
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
    left.accentKey === right.accentKey
  );
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

  const accent = ACCENT_PRESETS[preferences.accentKey];
  const isLightMode = draftPreferences.themeMode === 'light';
  const themeColors = isLightMode
    ? {
        pageBg: '#EAF1F7',
        cardBg: '#F7FAFD',
        panelBg: '#FFFFFF',
        border: '#CBD6E2',
        text: '#0F172A',
        muted: '#475569',
        inputBg: '#FFFFFF',
        chipTextBg: '#F1F5F9',
        chipTextBorder: '#C9D4E1',
        chipFieldBg: '#2563EB',
        chipFieldBorder: '#1D4ED8',
        buttonText: '#0F172A',
        buttonTextOnAccent: '#0F172A',
        buttonOutlineBg: '#FFFFFF',
        buttonOutlineBorder: '#B8C7D6',
        buttonGhostBg: '#EEF3F8',
        buttonGhostBorder: '#C6D3E0',
        statusOkText: '#0F766E',
      }
    : {
        pageBg: '#1E2329',
        cardBg: '#232A31',
        panelBg: '#1E2329',
        border: '#3A434D',
        text: '#F8FAFC',
        muted: '#94A3B8',
        inputBg: '#232A31',
        chipTextBg: '#1E2329',
        chipTextBorder: '#3A434D',
        chipFieldBg: '#2563EB',
        chipFieldBorder: '#1D4ED8',
          buttonText: '#F8FAFC',
          buttonTextOnAccent: '#FFFFFF',
          buttonOutlineBg: '#232A31',
          buttonOutlineBorder: '#3A434D',
          buttonGhostBg: '#232A31',
          buttonGhostBorder: '#55606B',
          statusOkText: '#34D399',
      };
        const accentStyle = { backgroundColor: accent.color };
        const accentBorderStyle = { borderColor: accent.border };
        const accentSolidStyle = { backgroundColor: accent.color, borderColor: accent.border };
        const accentGhostStyle = { backgroundColor: themeColors.buttonGhostBg, borderColor: themeColors.buttonGhostBorder };
        const outlineButtonStyle = { backgroundColor: themeColors.buttonOutlineBg, borderColor: themeColors.buttonOutlineBorder };
  const panelStyle = { backgroundColor: themeColors.panelBg, borderColor: themeColors.border };
  const inputFieldStyle = { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text };

  const templateEditorValue = useMemo(() => templateElementsToString(draftTemplateElements), [draftTemplateElements]);

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
    const persistedLogo = await persistLogoLocally(asset.uri, asset.fileName ?? undefined, DEFAULT_PREFERENCES.logoLabel);

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
      <View className="flex-1 items-center justify-center bg-industrial-bg px-6" style={{ backgroundColor: themeColors.pageBg }}>
        <View className="items-center gap-4 rounded-ind border border-industrial-border bg-industrial-surface px-6 py-8" style={{ backgroundColor: themeColors.cardBg, borderColor: themeColors.border }}>
          <ActivityIndicator size="large" color="#FFB020" />
          <Text className="text-base font-semibold text-white" style={{ color: themeColors.text }}>Cargando configuracion...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-industrial-bg" style={{ backgroundColor: themeColors.pageBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <ScrollView
        className="flex-1 bg-industrial-bg"
        style={{ backgroundColor: themeColors.pageBg }}
        contentContainerClassName="px-4 pb-32 pt-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <View className="w-full self-center rounded-ind border border-industrial-border bg-industrial-surface px-4 py-4" style={{ backgroundColor: themeColors.cardBg, borderColor: themeColors.border }}>
        <View className="mb-4" style={{ minHeight: 56 }}>
          {statusMessage ? (
            <View className={`rounded-ind border px-4 py-3 ${statusType === 'error' ? 'border-[#c2410c] bg-[#3a2414]' : 'border-emerald-500/40 bg-emerald-500/10'}`}>
              <Text className={`text-sm font-medium ${statusType === 'error' ? 'text-[#fed7aa]' : 'text-emerald-300'}`}>{statusMessage}</Text>
            </View>
          ) : null}
        </View>

        <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4" style={panelStyle}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[13px] uppercase tracking-[0.28em] text-slate-400" style={{ color: themeColors.muted }}>{preferences.appName}</Text>
              <Text className="mt-1 text-2xl font-bold text-white" style={{ color: themeColors.text }}>{preferences.headerSubtitle}</Text>
            </View>
            <View className="items-center justify-center rounded-ind border border-industrial-border px-3 py-3" style={{ borderColor: accent.border, backgroundColor: isLightMode ? '#EEF3F8' : '#2A3138' }}>
              {preferences.logoSource ? (
                <Image source={{ uri: preferences.logoSource }} style={{ width: 48, height: 48, borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <Text className="text-base">📋</Text>
              )}
            </View>
          </View>
          <Text className="mt-2 text-sm text-slate-400" style={{ color: themeColors.muted }}>
            {preferences.emailNote}
          </Text>
        </View>

        <View className="mb-3">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-slate-400" style={{ color: themeColors.muted }}>Tipo de material</Text>
          <View className="flex-row gap-2">
            {CATEGORIES.map((category) => {
              const active = category.key === selectedCategory;

              return (
                <Pressable
                  key={category.key}
                  onPress={() => setSelectedCategory(category.key)}
                  className={`flex-1 rounded-ind border px-3 py-3 ${active ? '' : 'border-industrial-border bg-industrial-bg'}`}
                  style={active ? { borderColor: accent.border, backgroundColor: accent.color } : { borderColor: themeColors.border, backgroundColor: themeColors.inputBg }}
                >
                  <View className="items-center gap-2">
                    <View className="h-6 w-6 items-center justify-center rounded border" style={{ borderColor: active ? themeColors.buttonTextOnAccent : themeColors.border }}>
                      <Text className="text-sm" style={{ color: active ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>
                        {category.badge}
                      </Text>
                    </View>
                    <Text className={`text-center text-sm font-semibold ${active ? 'text-white' : 'text-slate-300'}`} style={{ color: active ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>
                      {category.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3" style={panelStyle}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400" style={{ color: themeColors.muted }}>Alta de material</Text>
            <Text className="text-xs text-slate-500" style={{ color: themeColors.muted }}>{categoryLabel(selectedCategory)}</Text>
          </View>

          <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Nombre</Text>
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
            placeholderTextColor={themeColors.muted}
            className="mb-3 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3 text-white"
            style={inputFieldStyle}
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
                  style={drafts.bolsas.weightUnit === 'g' ? { backgroundColor: accent.color, borderColor: accent.border } : outlineButtonStyle}
                >
                  <Text className={`text-center text-sm font-semibold ${drafts.bolsas.weightUnit === 'g' ? 'text-white' : 'text-slate-300'}`} style={{ color: drafts.bolsas.weightUnit === 'g' ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>
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
                  style={drafts.bolsas.weightUnit === 'kg' ? { backgroundColor: accent.color, borderColor: accent.border } : outlineButtonStyle}
                >
                  <Text className={`text-center text-sm font-semibold ${drafts.bolsas.weightUnit === 'kg' ? 'text-white' : 'text-slate-300'}`} style={{ color: drafts.bolsas.weightUnit === 'kg' ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>
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
                className={`rounded-ind border px-3 py-3 text-white ${drafts.bolsas.weightInput.trim().length > 0 && !isNonEmptyPositive(convertToKg(parseOptionalPositiveNumber(drafts.bolsas.weightInput), drafts.bolsas.weightUnit)) ? 'border-[#FFB020] bg-[#2a151a]' : 'border-industrial-border bg-industrial-bg'}`}
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
                      style={active ? { backgroundColor: accent.color, borderColor: accent.border } : outlineButtonStyle}
                    >
                      <Text className={`text-center text-sm font-semibold ${active ? 'text-white' : 'text-slate-300'}`} style={{ color: active ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>
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
            className="mt-4 rounded-ind border px-4 py-4"
            style={accentSolidStyle}
          >
            <View className="flex-row items-center justify-center gap-2">
              <Text className="text-center text-sm font-semibold text-white" numberOfLines={2}>
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
            categoryLabel={categoryLabel}
            modeLabel={modeLabel}
            unitLabel={unitLabel}
            getResultLabel={getResultLabel}
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
            className={`rounded-ind border px-4 py-4 text-xl font-semibold text-white ${selectedMaterial && !isNonEmptyPositive(selectedMaterial.requestValue) ? 'border-[#FFB020] bg-[#2a151a]' : 'border-industrial-border bg-industrial-bg'}`}
          />
          <Text className="mt-2 text-xs text-slate-400">
            Captura la cantidad base y el sistema calcula el valor final según la categoría.
          </Text>
        </View>

        <View className="mt-4 rounded-ind border px-5 py-6" style={{ borderColor: accent.border, backgroundColor: '#2A3138' }}>
          <Text className="text-center text-[13px] font-semibold uppercase tracking-[0.28em] text-slate-400">
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
          className="mt-4 rounded-ind border px-4 py-4"
          style={accentSolidStyle}
        >
          <View className="flex-row items-center justify-center gap-2">
            <Text className="text-center text-sm font-bold text-white" style={{ color: themeColors.buttonTextOnAccent }}>Agregar a la solicitud</Text>
          </View>
        </Pressable>

        <View className="mt-6">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-5 w-5 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                <Text className="text-[11px]">🧾</Text>
              </View>
              <Text className="text-xl font-semibold text-slate-100">Resumen de solicitud</Text>
            </View>
            <Text className="text-xs text-slate-400">Próximo folio: {buildRequestCode(preferences.folioPrefix, nextLeadNumber)}</Text>
          </View>

          <View className="rounded-ind border border-industrial-border bg-industrial-bg p-2">
            <View className="mb-2 rounded-ind border px-3 py-2" style={{ borderColor: accent.border, backgroundColor: isLightMode ? '#FFFFFF' : '#232A31' }}>
              <View className="mb-2 flex-row items-center gap-2">
                <View className="h-4 w-4 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                  <Text className="text-[10px]">📧</Text>
                </View>
                <Text className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300" style={{ color: themeColors.muted }}>Destino de envío</Text>
              </View>
              <TextInput
                value={recipientEmail}
                onChangeText={setRecipientEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="correo@empresa.com"
                placeholderTextColor="#64748b"
                className={`rounded-ind border px-3 py-3 text-white ${recipientEmail.trim().length > 0 && !isValidEmail(recipientEmail) ? 'border-[#FFB020] bg-[#2a151a]' : 'border-industrial-border bg-industrial-surface'}`}
              />
              <Text className={`mt-2 text-xs ${recipientEmail.trim().length === 0 || isValidEmail(recipientEmail) ? 'text-slate-400' : 'text-rose-300'}`} style={{ color: recipientEmail.trim().length === 0 || isValidEmail(recipientEmail) ? themeColors.muted : '#B91C1C' }}>
                {recipientEmail.trim().length === 0
                  ? 'Este correo se usará para enviar el resumen y se guarda localmente.'
                  : isValidEmail(recipientEmail)
                    ? 'Correo válido para envío.'
                    : 'Formato de correo no válido.'}
              </Text>
            </View>

            {cartItems.length === 0 ? (
              <View className="rounded-ind border border-dashed border-industrial-border px-3 py-4" style={{ borderColor: themeColors.border, backgroundColor: themeColors.inputBg }}>
                <Text className="text-sm text-slate-400" style={{ color: themeColors.muted }}>Aún no hay materiales en el resumen.</Text>
              </View>
            ) : (
              cartItems.map((item) => (
                <View key={item.id} className="mb-1 rounded-ind border border-industrial-border bg-industrial-surface px-2 py-2" style={{ borderColor: themeColors.border, backgroundColor: themeColors.inputBg }}>
                  <View className="gap-2">
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="flex-1 pr-2">
                        <Text className="text-sm font-semibold text-white" style={{ color: themeColors.text }}>{item.materialTitle}</Text>
                        <Text className="text-[13px] text-industrial-muted" style={{ color: themeColors.muted }}>
                          {categoryLabel(item.category)} · {modeLabel(item.calcMode)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeCartItem(item.id)}
                        className="min-h-10 min-w-10 items-center justify-center rounded-ind border px-3 py-2"
                        style={({ pressed }) => [accentBorderStyle, pressed ? { opacity: 0.82 } : undefined]}
                      >
                        <Text className="text-[12px] font-semibold" style={{ color: isLightMode ? themeColors.buttonText : accent.soft }}>Quitar</Text>
                      </Pressable>
                    </View>

                    <View className="flex-row flex-wrap gap-3">
                      <View className="rounded-ind border px-2 py-1" style={{ borderColor: themeColors.border }}>
                        <Text className="text-[11px] uppercase tracking-[0.1em]" style={{ color: themeColors.muted }}>Capt.</Text>
                        <Text className="text-sm font-semibold" style={{ color: themeColors.text }}>{formatNumber(item.requestValue)}</Text>
                      </View>
                      <View className="rounded-ind border px-2 py-1" style={{ borderColor: themeColors.border }}>
                        <Text className="text-[11px] uppercase tracking-[0.1em]" style={{ color: themeColors.muted }}>Res.</Text>
                        <Text className="text-sm font-semibold" style={{ color: themeColors.text }}>{formatNumber(item.calculatedValue)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}

            <View className="mt-2 flex-row gap-2">
              <Pressable
                onPress={clearCart}
                className="flex-1 rounded-ind border px-3 py-3"
                style={isLightMode ? { backgroundColor: '#E2E8F0', borderColor: '#B8C7D6' } : accentSolidStyle}
              >
                <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-white" style={{ color: isLightMode ? themeColors.buttonText : '#FFFFFF' }}>Vaciar solicitud</Text>
              </Pressable>
              <Pressable
                disabled={!canSendEmail}
                onPress={() => {
                  void sendCartByEmail();
                }}
                className={`flex-1 min-h-[46px] items-center justify-center rounded-ind border px-3 py-3 ${canSendEmail ? '' : 'border-[#55606B] bg-[#55606B]'}`}
                style={canSendEmail ? accentSolidStyle : accentGhostStyle}
              >
                <Text className={`text-center text-xs font-semibold uppercase tracking-[0.16em] ${canSendEmail ? 'text-white' : ''}`} style={!canSendEmail ? { color: isLightMode ? themeColors.buttonText : accent.soft } : undefined}>
                  {isSendingEmail ? 'Enviando...' : 'Enviar solicitud'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View className="mt-4 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4" style={{ backgroundColor: themeColors.panelBg, borderColor: themeColors.border }}>
          <Pressable onPress={() => setSettingsOpen((current) => !current)} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-5 w-5 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                <Text className="text-[10px]">⚙️</Text>
              </View>
              <Text className="text-base font-semibold text-white" style={{ color: themeColors.text }}>Personalización de app</Text>
            </View>
            <Text className="text-base font-bold" style={{ color: themeColors.muted }}>{settingsOpen ? '˄' : '˅'}</Text>
          </Pressable>

          {settingsOpen ? (
            <View className="mt-4">
              <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-bg px-4 py-4" style={{ backgroundColor: themeColors.panelBg, borderColor: themeColors.border }}>
                <View className="mb-3 flex-row items-center gap-2">
                  <View className="h-4 w-4 items-center justify-center rounded border" style={{ borderColor: accent.border }}>
                    <Text className="text-[10px]">🎨</Text>
                  </View>
                    <Text className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300" style={{ color: themeColors.muted }}>Marca, logo y exportación</Text>
                </View>

                <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Nombre visible de la app</Text>
                <TextInput
                    value={draftPreferences.appName}
                  onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                      ...current,
                      appName: value,
                    }))
                  }
                  placeholder="SurtiTrack"
                  placeholderTextColor={themeColors.muted}
                  className="mb-3 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                  style={inputFieldStyle}
                />

                <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Subtítulo del encabezado</Text>
                <TextInput
                    value={draftPreferences.headerSubtitle}
                  onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                      ...current,
                      headerSubtitle: value,
                    }))
                  }
                  placeholder="Solicitud logística corporativa"
                  placeholderTextColor={themeColors.muted}
                  className="mb-3 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                  style={inputFieldStyle}
                />

                <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Modo visual</Text>
                <View className="mb-3 flex-row gap-2">
                  <Pressable
                    onPress={() =>
                      setDraftPreferences((current) => ({
                        ...current,
                        themeMode: 'dark',
                      }))
                    }
                    className="flex-1 rounded-ind border px-3 py-3"
                    style={draftPreferences.themeMode === 'dark' ? accentSolidStyle : outlineButtonStyle}
                  >
                    <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-white" style={{ color: draftPreferences.themeMode === 'dark' ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>
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
                    className="flex-1 rounded-ind border px-3 py-3"
                    style={draftPreferences.themeMode === 'light' ? accentSolidStyle : outlineButtonStyle}
                  >
                    <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-white" style={{ color: draftPreferences.themeMode === 'light' ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>
                      Modo claro
                    </Text>
                  </Pressable>
                </View>

                <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Prefijo del folio</Text>
                <TextInput
                  value={draftPreferences.folioPrefix}
                  onChangeText={(value) =>
                    setDraftPreferences((current) => ({
                      ...current,
                      folioPrefix: normalizeFolioPrefixInput(value),
                    }))
                  }
                  placeholder="CS"
                  placeholderTextColor={themeColors.muted}
                  className="mb-3 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                  style={inputFieldStyle}
                />
                <View className="mb-3 rounded-ind border border-industrial-border bg-industrial-bg px-3 py-3" style={panelStyle}>
                  <Text className="text-[13px] uppercase tracking-[0.18em] text-slate-500" style={{ color: themeColors.muted }}>Vista de folio</Text>
                  <Text className="mt-1 text-base font-semibold text-white" style={{ color: themeColors.text }}>
                    {buildRequestCode(draftPreferences.folioPrefix, nextLeadNumber)}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Prefijo permitido: A-Z, 0-9 y guion (máx. 8).</Text>
                </View>

                  <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Texto al pie del correo</Text>
                <TextInput
                    value={draftPreferences.emailNote}
                  onChangeText={(value) =>
                      setDraftPreferences((current) => ({
                      ...current,
                        emailNote: value,
                    }))
                  }
                  placeholder="Operación interna segura y trazable."
                  placeholderTextColor={themeColors.muted}
                  className="mb-4 rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                  style={inputFieldStyle}
                />

                <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Machote del correo</Text>
                <TextInput
                  value={templateEditorValue}
                  onChangeText={updateTemplateFromText}
                  multiline
                  numberOfLines={8}
                  textAlignVertical="top"
                  placeholder="Escribe el machote y usa placeholders entre llaves."
                  placeholderTextColor={themeColors.muted}
                  className="mb-2 min-h-[170px] rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                  style={inputFieldStyle}
                />
                <Text className="mb-3 text-xs" style={{ color: themeColors.muted }}>
                  Placeholders: {'{logo}'} {'{greeting}'} {'{folio}'} {'{totalMaterials}'} {'{totalPieces}'} {'{totalKg}'} {'{attachmentNote}'} {'{emailNote}'}
                </Text>

                  <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Texto para Excel / CSV</Text>
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
                    placeholderTextColor={themeColors.muted}
                      className="mb-3 min-h-[96px] rounded-ind border border-industrial-border bg-industrial-surface px-3 py-3 text-white"
                      style={inputFieldStyle}
                  />

                  <Text className="mb-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>Logo de la empresa</Text>
                  <Text className="mb-3 text-xs text-slate-500" style={{ color: themeColors.muted }}>
                    Carga el logo desde la galería del dispositivo. La app lo guarda en local al presionar guardar.
                  </Text>

                  <View className="mb-3 flex-row gap-2">
                    <Pressable onPress={() => void pickLogoFromDevice()} className="flex-1 rounded-ind border border-industrial-border px-3 py-3" style={{ borderColor: themeColors.border, backgroundColor: themeColors.inputBg }}>
                      <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-200" style={{ color: themeColors.text }}>
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
                      style={{ borderColor: themeColors.border, backgroundColor: themeColors.inputBg }}
                    >
                      <Text className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-200" style={{ color: themeColors.text }}>
                        Quitar logo
                      </Text>
                    </Pressable>
                  </View>

                  <View className="mb-4 rounded-ind border border-industrial-border bg-industrial-surface px-4 py-4" style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.border }}>
                    <Text className="mb-2 text-[13px] uppercase tracking-[0.22em] text-slate-400" style={{ color: themeColors.muted }}>Vista previa</Text>
                    <View className="flex-row items-center gap-3">
                      <View className="h-14 w-14 items-center justify-center rounded-ind bg-industrial-bg overflow-hidden" style={{ backgroundColor: themeColors.chipTextBg }}>
                        {draftPreferences.logoSource ? (
                          <Image source={{ uri: draftPreferences.logoSource }} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />
                        ) : (
                          <Text className="text-base">🖼️</Text>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-white" style={{ color: themeColors.text }}>{draftPreferences.logoLabel || 'Sin logo cargado'}</Text>
                        <Text className="mt-1 text-xs text-slate-400" style={{ color: themeColors.muted }}>
                          {draftPreferences.logoSource ? 'Se usará en app, correo y exportación cuando guardes.' : 'Todavía no hay un logo personalizado.'}
                        </Text>
                      </View>
                    </View>
                  </View>

                <Text className="mb-2 text-xs text-slate-400" style={{ color: themeColors.muted }}>Color de acento</Text>
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
                        className="rounded-ind border px-3 py-2"
                        style={{
                          borderColor: active ? preset.border : themeColors.buttonOutlineBorder,
                          backgroundColor: active ? preset.color : themeColors.buttonOutlineBg,
                        }}
                      >
                        <Text className="text-xs font-semibold text-white" style={{ color: active ? themeColors.buttonTextOnAccent : themeColors.buttonText }}>{preset.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                  <View className="mt-4 flex-row items-center justify-between gap-3">
                    <Text className={`text-xs font-medium ${hasPendingPreferenceChanges ? 'text-amber-300' : 'text-emerald-300'}`} style={!hasPendingPreferenceChanges ? { color: themeColors.statusOkText } : undefined}>
                      {hasPendingPreferenceChanges ? 'Hay cambios sin guardar.' : 'Configuración guardada.'}
                    </Text>
                    <Pressable
                      onPress={savePreferences}
                      className="rounded-ind border px-4 py-3"
                      style={({ pressed }) => [
                        {
                          backgroundColor: accent.color,
                          borderColor: accent.border,
                          shadowColor: '#000000',
                          shadowOpacity: 0.12,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: 2,
                        },
                        pressed ? { opacity: 0.84 } : undefined,
                      ]}
                    >
                      <Text className="text-xs font-semibold uppercase tracking-[0.08em] text-white" style={{ color: themeColors.buttonTextOnAccent }}>Guardar cambios</Text>
                    </Pressable>
                  </View>
              </View>

              {currentMaterials.map((item) => (
                <ConfigRow
                  key={item.id}
                  item={item}
                  accent={accent}
                  onChange={updateMaterialById}
                  onDelete={removeMaterial}
                  unitLabel={unitLabel}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

