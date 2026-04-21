import * as SQLite from 'expo-sqlite';
import type { AppPreferences, CartItem, MaterialCategory, MaterialOption, MaterialUnit, StoredConfig } from '../types/logistics';

const DB_NAME = 'surtitrack.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function toMaterialCategory(value: string | null | undefined): MaterialCategory {
  if (value === 'cajas' || value === 'otros') {
    return value;
  }

  return 'bolsas';
}

function toMaterialUnit(value: string | null | undefined): MaterialUnit {
  if (value === 'kg' || value === 'g' || value === 'l') {
    return value;
  }

  return 'pieces';
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }

  return dbPromise;
}

export async function initDatabase() {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS app_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      app_name TEXT NOT NULL,
      header_subtitle TEXT NOT NULL,
      theme_mode TEXT NOT NULL,
      folio_prefix TEXT NOT NULL,
      email_template TEXT NOT NULL,
      email_note TEXT NOT NULL,
      sheet_note TEXT NOT NULL,
      logo_source TEXT NOT NULL,
      logo_label TEXT NOT NULL,
      accent_key TEXT NOT NULL,
      category_bolsas TEXT NOT NULL,
      category_cajas TEXT NOT NULL,
      category_otros TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      calc_mode TEXT NOT NULL,
      request_value REAL NOT NULL,
      request_unit TEXT NOT NULL,
      weight_per_100_kg REAL NOT NULL,
      weight_unit TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY NOT NULL,
      material_id TEXT NOT NULL,
      material_title TEXT NOT NULL,
      category TEXT NOT NULL,
      calc_mode TEXT NOT NULL,
      request_value REAL NOT NULL,
      request_unit TEXT NOT NULL,
      weight_per_100_kg REAL NOT NULL,
      weight_unit TEXT NOT NULL,
      calculated_value REAL NOT NULL,
      calculated_unit TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

async function getStateValue(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM app_state WHERE key = ?', key);
  return row?.value ?? null;
}

async function setStateValue(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
}

export async function loadStoredConfigFromDb(): Promise<StoredConfig | null> {
  await initDatabase();
  const db = await getDb();

  const prefRow = await db.getFirstAsync<{
    app_name: string;
    header_subtitle: string;
    theme_mode: string;
    folio_prefix: string;
    email_template: string;
    email_note: string;
    sheet_note: string;
    logo_source: string;
    logo_label: string;
    accent_key: string;
    category_bolsas: string;
    category_cajas: string;
    category_otros: string;
  }>('SELECT * FROM app_preferences WHERE id = 1');

  const materialRows = await db.getAllAsync<{
    id: string;
    category: string;
    title: string;
    calc_mode: string;
    request_value: number;
    request_unit: string;
    weight_per_100_kg: number;
    weight_unit: string;
  }>('SELECT * FROM materials');

  const cartRows = await db.getAllAsync<{
    id: string;
    material_id: string;
    material_title: string;
    category: string;
    calc_mode: string;
    request_value: number;
    request_unit: string;
    weight_per_100_kg: number;
    weight_unit: string;
    calculated_value: number;
    calculated_unit: string;
    created_at: string;
  }>('SELECT * FROM cart_items');

  const selectedCategoryRaw = await getStateValue(db, 'selectedCategory');
  const selectedMaterialId = (await getStateValue(db, 'selectedMaterialId')) ?? '';
  const recipientEmail = (await getStateValue(db, 'recipientEmail')) ?? '';
  const nextLeadNumberRaw = await getStateValue(db, 'nextLeadNumber');

  const hasData = Boolean(prefRow) || materialRows.length > 0 || cartRows.length > 0 || Boolean(selectedCategoryRaw) || Boolean(recipientEmail);

  if (!hasData) {
    return null;
  }

  const preferences: AppPreferences = {
    appName: prefRow?.app_name ?? 'SurtiTrack',
    headerSubtitle: prefRow?.header_subtitle ?? 'Solicitud logística corporativa',
    themeMode: prefRow?.theme_mode === 'light' ? 'light' : 'dark',
    folioPrefix: prefRow?.folio_prefix ?? 'CS',
    emailTemplate: prefRow?.email_template ?? '{greeting}\n\n{materialTable}',
    emailNote: prefRow?.email_note ?? 'Operación interna segura y trazable.',
    sheetNote: prefRow?.sheet_note ?? 'Registro interno para control y seguimiento.',
    logoSource: prefRow?.logo_source ?? '',
    logoLabel: prefRow?.logo_label ?? 'Logo de la empresa',
    accentKey: (prefRow?.accent_key as AppPreferences['accentKey']) ?? 'blue',
    categoryDisplayNames: {
      bolsas: prefRow?.category_bolsas ?? 'Bolsas',
      cajas: prefRow?.category_cajas ?? 'Cajas',
      otros: prefRow?.category_otros ?? 'Otros',
    },
  };

  const materials: MaterialOption[] = materialRows.map((row) => ({
    id: row.id,
    category: toMaterialCategory(row.category),
    title: row.title,
    calcMode: row.calc_mode === 'bags' || row.calc_mode === 'pieces' || row.calc_mode === 'other' ? row.calc_mode : 'other',
    requestValue: Number(row.request_value) || 0,
    requestUnit: toMaterialUnit(row.request_unit),
    weightPer100Kg: Number(row.weight_per_100_kg) || 0,
    weightUnit: row.weight_unit === 'g' ? 'g' : 'kg',
  }));

  const cartItems: CartItem[] = cartRows.map((row) => ({
    id: row.id,
    materialId: row.material_id,
    materialTitle: row.material_title,
    category: toMaterialCategory(row.category),
    calcMode: row.calc_mode === 'bags' || row.calc_mode === 'pieces' || row.calc_mode === 'other' ? row.calc_mode : 'other',
    requestValue: Number(row.request_value) || 0,
    requestUnit: toMaterialUnit(row.request_unit),
    weightPer100Kg: Number(row.weight_per_100_kg) || 0,
    weightUnit: row.weight_unit === 'g' ? 'g' : 'kg',
    calculatedValue: Number(row.calculated_value) || 0,
    calculatedUnit: toMaterialUnit(row.calculated_unit),
    createdAt: row.created_at,
  }));

  const nextLeadNumber = Number(nextLeadNumberRaw);

  return {
    selectedCategory: toMaterialCategory(selectedCategoryRaw),
    selectedMaterialId,
    recipientEmail,
    materials,
    cartItems,
    nextLeadNumber: Number.isFinite(nextLeadNumber) && nextLeadNumber >= 1 ? nextLeadNumber : 1,
    preferences,
  };
}

export async function saveStoredConfigToDb(config: StoredConfig) {
  await initDatabase();
  const db = await getDb();

  await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

  try {
    await setStateValue(db, 'selectedCategory', config.selectedCategory);
    await setStateValue(db, 'selectedMaterialId', config.selectedMaterialId);
    await setStateValue(db, 'recipientEmail', config.recipientEmail);
    await setStateValue(db, 'nextLeadNumber', String(config.nextLeadNumber));

    await db.runAsync(
      `INSERT INTO app_preferences (
        id, app_name, header_subtitle, theme_mode, folio_prefix, email_template,
        email_note, sheet_note, logo_source, logo_label, accent_key,
        category_bolsas, category_cajas, category_otros
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_name = excluded.app_name,
        header_subtitle = excluded.header_subtitle,
        theme_mode = excluded.theme_mode,
        folio_prefix = excluded.folio_prefix,
        email_template = excluded.email_template,
        email_note = excluded.email_note,
        sheet_note = excluded.sheet_note,
        logo_source = excluded.logo_source,
        logo_label = excluded.logo_label,
        accent_key = excluded.accent_key,
        category_bolsas = excluded.category_bolsas,
        category_cajas = excluded.category_cajas,
        category_otros = excluded.category_otros`,
      config.preferences.appName,
      config.preferences.headerSubtitle,
      config.preferences.themeMode,
      config.preferences.folioPrefix,
      typeof config.preferences.emailTemplate === 'string' ? config.preferences.emailTemplate : JSON.stringify(config.preferences.emailTemplate),
      config.preferences.emailNote,
      config.preferences.sheetNote,
      config.preferences.logoSource,
      config.preferences.logoLabel,
      config.preferences.accentKey,
      config.preferences.categoryDisplayNames.bolsas,
      config.preferences.categoryDisplayNames.cajas,
      config.preferences.categoryDisplayNames.otros
    );

    await db.execAsync('DELETE FROM materials;');
    for (const material of config.materials) {
      await db.runAsync(
        `INSERT INTO materials (
          id, category, title, calc_mode, request_value, request_unit, weight_per_100_kg, weight_unit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        material.id,
        material.category,
        material.title,
        material.calcMode,
        material.requestValue,
        material.requestUnit,
        material.weightPer100Kg,
        material.weightUnit
      );
    }

    await db.execAsync('DELETE FROM cart_items;');
    for (const item of config.cartItems) {
      await db.runAsync(
        `INSERT INTO cart_items (
          id, material_id, material_title, category, calc_mode, request_value, request_unit,
          weight_per_100_kg, weight_unit, calculated_value, calculated_unit, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.materialId,
        item.materialTitle,
        item.category,
        item.calcMode,
        item.requestValue,
        item.requestUnit,
        item.weightPer100Kg,
        item.weightUnit,
        item.calculatedValue,
        item.calculatedUnit,
        item.createdAt
      );
    }

    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function isMigrationCompleted(): Promise<boolean> {
  await initDatabase();
  const db = await getDb();

  const migrationFlag = await getStateValue(db, 'migration_completed');
  return migrationFlag === 'true';
}

export async function markMigrationCompleted() {
  await initDatabase();
  const db = await getDb();

  await setStateValue(db, 'migration_completed', 'true');
}
