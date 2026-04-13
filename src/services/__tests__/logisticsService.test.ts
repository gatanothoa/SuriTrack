import * as FileSystem from 'expo-file-system/legacy';
import * as MailComposer from 'expo-mail-composer';
import { sendLogisticsEmail } from '../logisticsService';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: {
    canOpenURL: jest.fn(async () => true),
    openURL: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  EncodingType: {
    UTF8: 'utf8',
    Base64: 'base64',
  },
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => 'YmFzZTY0'),
  downloadAsync: jest.fn(async (_from: string, to: string) => ({ uri: to })),
  copyAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-mail-composer', () => ({
  isAvailableAsync: jest.fn(async () => true),
  composeAsync: jest.fn(async () => ({ status: 'sent' })),
  MailComposerStatus: {
    SENT: 'sent',
    SAVED: 'saved',
  },
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: jest.fn(async () => undefined),
      localUri: 'file:///logo.png',
      uri: 'file:///logo.png',
    })),
  },
}));

describe('logisticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('genera CSV limpio con BOM, separador punto y coma y solo datos de la solicitud', async () => {
    const result = await sendLogisticsEmail({
      recipientEmail: 'logistica@empresa.com',
      requestCode: 'CS001',
      greeting: 'Buenos dias equipo,',
      preferences: {
        appName: 'SurtiTrack',
        headerSubtitle: 'Solicitud logística corporativa',
        themeMode: 'dark',
        folioPrefix: 'CS',
        emailTemplate: '{greeting}\nFolio: {folio}\n{emailNote}',
        emailNote: 'Operacion interna segura y trazable.',
        sheetNote: 'Registro interno para control y seguimiento.',
        logoSource: 'data:image/png;base64,AAAA',
        logoLabel: 'logo',
        accentKey: 'red',
      },
      cartItems: [
        {
          id: 'c1',
          materialId: 'm1',
          materialTitle: 'Caja corrugada',
          category: 'cajas',
          calcMode: 'pieces',
          requestValue: 12,
          requestUnit: 'pieces',
          weightPer100Kg: 0,
          weightUnit: 'kg',
          calculatedValue: 12,
          calculatedUnit: 'pieces',
          createdAt: new Date('2026-04-12T10:00:00.000Z').toISOString(),
        },
      ],
    });

    expect(result.statusType).toBe('success');
    expect(result.reserveFolio).toBe(true);

    const writeMock = FileSystem.writeAsStringAsync as jest.Mock;
    expect(writeMock).toHaveBeenCalled();

    const csvPayload = String(writeMock.mock.calls[0][1]);
    expect(csvPayload.startsWith('\uFEFF')).toBe(true);
    expect(csvPayload).toContain('"FOLIO";"CATEGORIA";"DESCRIPCION";"MODO";"CANTIDAD SOLICITADA";"UNIDAD SOLICITADA";"PESO CALCULADO";"UNIDAD RESULTADO";"FECHA REGISTRO"');
    expect(csvPayload).toContain('"CS001";"Cajas";"Caja corrugada";"Piezas";"12";"piezas";"12";"piezas";"');
    expect(csvPayload).not.toContain('EMPRESA');
    expect(csvPayload).not.toContain('SUBTITULO');
    expect(csvPayload).not.toContain('NOTA');

    expect((MailComposer.composeAsync as jest.Mock)).toHaveBeenCalled();
  });
});
