import { calculateRequestedValue, convertWeightUnitToKg } from '../calculations';

describe('calculations', () => {
  it('convierte gramos a kilogramos correctamente', () => {
    expect(convertWeightUnitToKg(2500, 'g')).toBe(2.5);
    expect(convertWeightUnitToKg(1.2, 'kg')).toBe(1.2);
  });

  it('devuelve 0 para unidades sin peso o valores invalidos', () => {
    expect(convertWeightUnitToKg(0, 'kg')).toBe(0);
    expect(convertWeightUnitToKg(-10, 'g')).toBe(0);
    expect(convertWeightUnitToKg(10, 'pieces')).toBe(0);
    expect(convertWeightUnitToKg(5, 'l')).toBe(0);
  });

  it('calcula kilos para materiales tipo bags', () => {
    const result = calculateRequestedValue({
      calcMode: 'bags',
      requestValue: 500,
      weightPer100Kg: 2.2,
      requestUnit: 'pieces',
    });

    // 500 piezas => 5 bloques de 100 * 2.2kg
    expect(result).toBeCloseTo(11);
  });

  it('sumatorias separan piezas y kilos de forma correcta', () => {
    const items = [
      { calcMode: 'pieces', requestValue: 10.2, calculatedValue: 10.2, calculatedUnit: 'pieces' as const },
      { calcMode: 'other', requestValue: 0.5, calculatedValue: 500, calculatedUnit: 'g' as const },
      { calcMode: 'bags', requestValue: 200, calculatedValue: 4, calculatedUnit: 'kg' as const },
    ];

    const totalPieces = items.reduce((sum, item) => (item.calcMode === 'pieces' ? sum + Math.ceil(item.requestValue) : sum), 0);
    const totalKg = items.reduce((sum, item) => sum + convertWeightUnitToKg(item.calculatedValue, item.calculatedUnit), 0);

    expect(totalPieces).toBe(11);
    expect(totalKg).toBeCloseTo(4.5);
  });
});
