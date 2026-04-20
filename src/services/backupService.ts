import * as FileSystem from 'expo-file-system/legacy';
import type { AppPreferences, CartItem, MaterialCategory, MaterialOption, StoredConfig } from '../types/logistics';

const BACKUP_SCHEMA_VERSION = 1;

export type BackupEnvelope = {
  app: 'SurtiTrack';
  schemaVersion: number;
  exportedAt: string;
  data: StoredConfig;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMaterialCategory(value: unknown): value is MaterialCategory {
  return value === 'bolsas' || value === 'cajas' || value === 'otros';
}

function isValidMaterialOption(value: unknown): value is MaterialOption {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    isMaterialCategory(value.category) &&
    typeof value.title === 'string' &&
    (value.calcMode === 'bags' || value.calcMode === 'pieces' || value.calcMode === 'other') &&
    typeof value.requestValue === 'number' &&
    (value.requestUnit === 'pieces' || value.requestUnit === 'kg' || value.requestUnit === 'g' || value.requestUnit === 'l') &&
    typeof value.weightPer100Kg === 'number' &&
    (value.weightUnit === 'kg' || value.weightUnit === 'g')
  );
}

function isValidCartItem(value: unknown): value is CartItem {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.materialId === 'string' &&
    typeof value.materialTitle === 'string' &&
    isMaterialCategory(value.category) &&
    (value.calcMode === 'bags' || value.calcMode === 'pieces' || value.calcMode === 'other') &&
    typeof value.requestValue === 'number' &&
    (value.requestUnit === 'pieces' || value.requestUnit === 'kg' || value.requestUnit === 'g' || value.requestUnit === 'l') &&
    typeof value.weightPer100Kg === 'number' &&
    (value.weightUnit === 'kg' || value.weightUnit === 'g') &&
    typeof value.calculatedValue === 'number' &&
    (value.calculatedUnit === 'pieces' || value.calculatedUnit === 'kg' || value.calculatedUnit === 'g' || value.calculatedUnit === 'l') &&
    typeof value.createdAt === 'string'
  );
}

function isValidPreferences(value: unknown): value is AppPreferences {
  if (!isObject(value)) {
    return false;
  }

  const categoryDisplayNames = value.categoryDisplayNames;

  if (!isObject(categoryDisplayNames)) {
    return false;
  }

  return (
    typeof value.appName === 'string' &&
    typeof value.headerSubtitle === 'string' &&
    (value.themeMode === 'dark' || value.themeMode === 'light') &&
    typeof value.folioPrefix === 'string' &&
    (typeof value.emailTemplate === 'string' || Array.isArray(value.emailTemplate)) &&
    typeof value.emailNote === 'string' &&
    typeof value.sheetNote === 'string' &&
    typeof value.logoSource === 'string' &&
    typeof value.logoLabel === 'string' &&
    (value.accentKey === 'red' || value.accentKey === 'blue' || value.accentKey === 'green' || value.accentKey === 'amber') &&
    typeof categoryDisplayNames.bolsas === 'string' &&
    typeof categoryDisplayNames.cajas === 'string' &&
    typeof categoryDisplayNames.otros === 'string'
  );
}

function isValidStoredConfig(value: unknown): value is StoredConfig {
  if (!isObject(value)) {
    return false;
  }

  return (
    isMaterialCategory(value.selectedCategory) &&
    typeof value.selectedMaterialId === 'string' &&
    typeof value.recipientEmail === 'string' &&
    Array.isArray(value.materials) &&
    value.materials.every(isValidMaterialOption) &&
    Array.isArray(value.cartItems) &&
    value.cartItems.every(isValidCartItem) &&
    typeof value.nextLeadNumber === 'number' &&
    value.nextLeadNumber >= 1 &&
    isValidPreferences(value.preferences)
  );
}

function sanitizeBackupFileNameTimestamp(isoDate: string) {
  return isoDate.replace(/[:.]/g, '-');
}

export async function createBackupFile(config: StoredConfig) {
  const exportedAt = new Date().toISOString();
  const envelope: BackupEnvelope = {
    app: 'SurtiTrack',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    data: config,
  };

  const json = JSON.stringify(envelope, null, 2);
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!baseDirectory) {
    throw new Error('No se encontró un directorio para crear el respaldo.');
  }

  const fileName = `surtitrack-backup-${sanitizeBackupFileNameTimestamp(exportedAt)}.json`;
  const fileUri = `${baseDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return { fileUri, fileName, exportedAt };
}

export async function readBackupFile(fileUri: string) {
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const parsed = JSON.parse(content) as unknown;

  if (isObject(parsed) && 'data' in parsed && isObject(parsed.data)) {
    if (!isValidStoredConfig(parsed.data)) {
      throw new Error('El respaldo no tiene un formato válido para esta versión de la app.');
    }

    const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined;
    return { config: parsed.data, exportedAt };
  }

  if (isValidStoredConfig(parsed)) {
    return { config: parsed, exportedAt: undefined };
  }

  throw new Error('El archivo seleccionado no corresponde a un respaldo válido.');
}
