export type MaterialCategory = 'bolsas' | 'cajas' | 'otros';
export type MaterialUnit = 'pieces' | 'kg' | 'g' | 'l';
export type MaterialCalcMode = 'bags' | 'pieces' | 'other';

export type MaterialOption = {
  id: string;
  category: MaterialCategory;
  title: string;
  calcMode: MaterialCalcMode;
  requestValue: number;
  requestUnit: MaterialUnit;
  weightPer100Kg: number;
  weightUnit: 'kg' | 'g';
};

export type CartItem = {
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

export type MaterialDraft = {
  title: string;
  weightInput: string;
  weightUnit: 'kg' | 'g';
  otherUnit: 'kg' | 'g' | 'l';
};

export type AccentKey = 'red' | 'blue' | 'green' | 'amber';

export type AccentPreset = {
  label: string;
  color: string;
  border: string;
  soft: string;
};

export type AvailableField = 'logo' | 'greeting' | 'folio' | 'totalMaterials' | 'totalPieces' | 'totalKg' | 'attachmentNote' | 'emailNote';

export type TemplateElement =
  | { type: 'text'; content: string }
  | { type: 'field'; name: AvailableField };

export type AppPreferences = {
  appName: string;
  headerSubtitle: string;
  themeMode: 'dark' | 'light';
  folioPrefix: string;
  emailTemplate: string | TemplateElement[];
  emailNote: string;
  sheetNote: string;
  logoSource: string;
  logoLabel: string;
  accentKey: AccentKey;
};

export type HeaderPreferencesPayload = Pick<AppPreferences, 'appName' | 'headerSubtitle' | 'logoSource' | 'themeMode'>;

export type StoredConfig = {
  selectedCategory: MaterialCategory;
  selectedMaterialId: string;
  recipientEmail: string;
  materials: MaterialOption[];
  cartItems: CartItem[];
  nextLeadNumber: number;
  preferences: AppPreferences;
};
