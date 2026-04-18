export type CalculationMode = 'bags' | 'pieces' | 'other';
export type CalculationUnit = 'pieces' | 'kg' | 'g' | 'l';

export type CalculationMaterial = {
  calcMode: CalculationMode;
  requestValue: number;
  weightPer100Kg: number;
  requestUnit: CalculationUnit;
};

export function parsePositiveNumber(value: string) {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);

  if (!normalized || Number.isNaN(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

export function parseOptionalPositiveNumber(value: string) {
  const normalized = value.replace(',', '.').trim();

  if (!normalized) {
    return 0;
  }

  return parsePositiveNumber(value);
}

export function isNonEmptyPositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatWeight(value: number) {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatPieces(value: number) {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function convertToKg(value: number, unit: 'kg' | 'g') {
  if (!isNonEmptyPositive(value)) {
    return 0;
  }

  return unit === 'g' ? value / 1000 : value;
}

export function convertFromKg(valueKg: number, unit: 'kg' | 'g') {
  if (!isNonEmptyPositive(valueKg)) {
    return 0;
  }

  return unit === 'g' ? valueKg * 1000 : valueKg;
}

export function convertWeightUnitToKg(value: number, unit: CalculationUnit) {
  if (!isNonEmptyPositive(value)) {
    return 0;
  }

  if (unit === 'kg') {
    return value;
  }

  if (unit === 'g') {
    return value / 1000;
  }

  return 0;
}

export function calculateRequestedValue(material: CalculationMaterial) {
  if (material.calcMode === 'bags') {
    return (material.requestValue / 100) * material.weightPer100Kg;
  }

  return material.requestValue;
}

export function calculateRequestedUnit(material: CalculationMaterial): CalculationUnit {
  if (material.calcMode === 'bags') {
    return 'kg';
  }

  if (material.calcMode === 'pieces') {
    return 'pieces';
  }

  return material.requestUnit;
}

function parseCoordinateValue(value: string) {
  const normalized = value.replace(',', '.').trim();

  if (!normalized) {
    return Number.NaN;
  }

  return Number(normalized);
}

export function validateGpsCoordinates(latitude: string, longitude: string) {
  const parsedLatitude = parseCoordinateValue(latitude);
  const parsedLongitude = parseCoordinateValue(longitude);

  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    return 'Error';
  }

  if (parsedLatitude < -90 || parsedLatitude > 90) {
    return 'Error';
  }

  if (parsedLongitude < -180 || parsedLongitude > 180) {
    return 'Error';
  }

  return 'OK';
}
