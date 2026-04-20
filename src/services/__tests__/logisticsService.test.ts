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

jest.mock('xlsx-js-style', () => ({
  utils: {
    aoa_to_sheet: jest.fn(() => ({
      A1: {},
      A2: {},
      A3: {},
      A4: {},
      B4: {},
      C4: {},
      A5: {},
      B5: {},
      C5: {},
      A6: {},
      B6: {},
      C6: {},
      '!ref': 'A1:C6',
    })),
    book_new: jest.fn(() => ({ Sheets: {}, SheetNames: [] })),
    book_append_sheet: jest.fn((workbook, worksheet, sheetName) => {
      workbook.Sheets[sheetName] = worksheet;
      workbook.SheetNames.push(sheetName);
    }),
  },
  write: jest.fn(() => 'YmFzZTY0'),
}));

describe('logisticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('genera correo profesional con solo folio, material, cantidad a surtir y fecha', async () => {
    const result = await sendLogisticsEmail({
      recipientEmail: 'logistica@empresa.com',
      requestCode: 'CS001',
      greeting: 'Buenos dias equipo,',
      preferences: {
        appName: 'SurtiTrack',
        headerSubtitle: 'Solicitud logística corporativa',
        themeMode: 'dark',
        folioPrefix: 'CS',
        emailTemplate: '{logo}\n{greeting}\n\nFolio: {folio}\n\n{materialTable}\n\nTotal a surtir: {totalKg}\nFecha: {requestDate}\n\n{attachmentNote}\n\nSaludos cordiales.\n{emailNote}',
        emailNote: 'Operacion interna segura y trazable.',
        sheetNote: 'Registro interno para control y seguimiento.',
        logoSource: 'data:image/png;base64,AAAA',
        logoLabel: 'logo',
        accentKey: 'red',
        categoryDisplayNames: {
          bolsas: 'Bolsas',
          cajas: 'Cajas',
          otros: 'Otros',
        },
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

    const xlsxMock = jest.requireMock('xlsx-js-style') as { write: jest.Mock };
    expect(xlsxMock.write).toHaveBeenCalled();

    const composeMock = MailComposer.composeAsync as jest.Mock;
    expect(composeMock).toHaveBeenCalled();

    const composePayload = composeMock.mock.calls[0][0];
    expect(composePayload.isHtml).toBe(true);
    expect(composePayload.attachments).toHaveLength(1);

    const htmlBody = String(composePayload.body);
    expect(htmlBody).toContain('Folio CS001');
    expect(htmlBody).toContain('Tipo de material');
    expect(htmlBody).toContain('Cantidad a surtir');
    expect(htmlBody).toContain('Fecha');
    expect(htmlBody).toContain('Cajas - Caja corrugada');
    expect(htmlBody).toContain('12 piezas');
    expect(htmlBody).toContain('Total a surtir');
    expect(htmlBody).not.toContain('Total de materiales');
    expect(htmlBody).not.toContain('Total de piezas');
  });
});
