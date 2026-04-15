import { Linking, Platform } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as MailComposer from 'expo-mail-composer';
import { convertWeightUnitToKg, formatNumber, formatPieces, formatWeight } from '../utils/calculations';
import type { AppPreferences, CartItem, MaterialCalcMode, MaterialCategory, MaterialUnit, TemplateElement, AvailableField, CategoryDisplayNames } from '../types/logistics';

const DEFAULT_CATEGORY_DISPLAY_NAMES: CategoryDisplayNames = {
  bolsas: 'Bolsas',
  cajas: 'Cajas',
  otros: 'Otros',
};

function categoryLabel(category: MaterialCategory, categoryDisplayNames?: CategoryDisplayNames) {
  const names = categoryDisplayNames ?? DEFAULT_CATEGORY_DISPLAY_NAMES;

  switch (category) {
    case 'bolsas':
      return names.bolsas;
    case 'cajas':
      return names.cajas;
    default:
      return names.otros;
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

function buildMailtoUrl(recipient: string, subject: string, body: string) {
  const query = new URLSearchParams({ subject, body }).toString();
  return `mailto:${recipient}?${query}`;
}

function sanitizeCsvCell(value: string) {
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  if (/^[=+\-@]/.test(normalized) || /^[\t ]+[=+\-@]/.test(normalized)) {
    return `'${normalized}`;
  }

  return normalized;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLogoExtension(sourceUri: string, fileName?: string) {
  const nameExtension = fileName?.split('.').pop()?.trim().toLowerCase();

  if (nameExtension === 'jpeg') {
    return 'jpg';
  }

  if (nameExtension && nameExtension.length <= 5) {
    return nameExtension;
  }

  const dataUriMatch = sourceUri.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/i);

  if (dataUriMatch?.[1]) {
    const dataExtension = dataUriMatch[1].toLowerCase();
    return dataExtension === 'jpeg' ? 'jpg' : dataExtension;
  }

  return 'png';
}

export function templateElementsToString(elements: TemplateElement[]): string {
  return elements
    .map((element) => {
      if (element.type === 'text') {
        return element.content;
      }
      return `{${element.name}}`;
    })
    .join('');
}

export function stringToTemplateElements(template: string): TemplateElement[] {
  const elements: TemplateElement[] = [];
  const fieldPattern = /\{(logo|greeting|folio|totalMaterials|totalPieces|totalKg|attachmentNote|emailNote)\}/g;
  let lastIndex = 0;
  let match;

  while ((match = fieldPattern.exec(template)) !== null) {
    // Agregar texto antes del campo
    if (match.index > lastIndex) {
      const textContent = template.substring(lastIndex, match.index);
      if (textContent.trim()) {
        elements.push({ type: 'text', content: textContent });
      }
    }

    // Agregar el campo
    const fieldName = match[1] as AvailableField;
    elements.push({ type: 'field', name: fieldName });

    lastIndex = match.index + match[0].length;
  }

  // Agregar texto restante
  if (lastIndex < template.length) {
    const textContent = template.substring(lastIndex);
    if (textContent.trim()) {
      elements.push({ type: 'text', content: textContent });
    }
  }

  return elements.length > 0 ? elements : [{ type: 'text', content: template }];
}

export function renderEmailTemplate(
  template: string | TemplateElement[],
  context: { greeting: string; folio: string; totalMaterials: string; totalPieces: string; totalKg: string; attachmentNote: string; emailNote: string; logoDataUri?: string | null }
) {
  const fieldValues: Record<AvailableField, string> = {
    logo: context.logoDataUri ? `<img src="${context.logoDataUri}" style="display:block; height:48px; max-width:200px; object-fit:contain; margin:0 0 12px 0;" />` : '',
    greeting: context.greeting,
    folio: context.folio,
    totalMaterials: context.totalMaterials,
    totalPieces: context.totalPieces,
    totalKg: context.totalKg,
    attachmentNote: context.attachmentNote,
    emailNote: context.emailNote,
  };

  // Si el template es un array de elementos (nuevo formato)
  if (Array.isArray(template)) {
    return template
      .map((element) => {
        if (element.type === 'text') {
          return element.content;
        }
        return fieldValues[element.name] || '';
      })
      .join('');
  }

  // Si es string (formato antiguo), mantener compatibilidad
  return template
    .replace(/\{logo\}/g, fieldValues.logo)
    .replace(/\{greeting\}/g, fieldValues.greeting)
    .replace(/\{folio\}/g, fieldValues.folio)
    .replace(/\{totalMaterials\}/g, fieldValues.totalMaterials)
    .replace(/\{totalPieces\}/g, fieldValues.totalPieces)
    .replace(/\{totalKg\}/g, fieldValues.totalKg)
    .replace(/\{attachmentNote\}/g, fieldValues.attachmentNote)
    .replace(/\{emailNote\}/g, fieldValues.emailNote);
}

export async function persistLogoLocally(sourceUri: string, fileName: string | undefined, defaultLogoLabel: string) {
  const normalized = sourceUri.trim();
  const label = fileName?.trim() || defaultLogoLabel;

  if (!normalized) {
    return { logoSource: '', logoLabel: defaultLogoLabel };
  }

  if (Platform.OS === 'web') {
    // En web, guardar data URI en sessionStorage en lugar de AsyncStorage para evitar límites de tamaño
    if (normalized.startsWith('data:image/')) {
      try {
        sessionStorage.setItem('calcpack.logo.datauri', normalized);
        return { logoSource: normalized, logoLabel: label };
      } catch {
        // Si sessionStorage falla (ej: límite de tamaño), retornar igualmente
        console.warn('[logisticsService] Logo demasiado grande para sessionStorage');
        return { logoSource: normalized, logoLabel: label };
      }
    }
    // Si no es data URI (ej: URL externa), retornar como está
    return { logoSource: normalized, logoLabel: label };
  }

  const localDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

  if (!localDirectory) {
    return { logoSource: normalized, logoLabel: label };
  }

  if (normalized.startsWith(localDirectory)) {
    return { logoSource: normalized, logoLabel: label };
  }

  const extension = getLogoExtension(normalized, fileName);
  const targetUri = `${localDirectory}company-logo-${Date.now()}.${extension}`;

  try {
    if (normalized.startsWith('data:image/')) {
      const base64 = normalized.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
      await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      return { logoSource: targetUri, logoLabel: label };
    }

    if (/^https?:\/\//i.test(normalized)) {
      const downloaded = await FileSystem.downloadAsync(normalized, targetUri);
      return { logoSource: downloaded.uri, logoLabel: label };
    }

    if (normalized.startsWith('file://') || normalized.startsWith('content://')) {
      try {
        await FileSystem.copyAsync({ from: normalized, to: targetUri });
        return { logoSource: targetUri, logoLabel: label };
      } catch {
        const base64 = await FileSystem.readAsStringAsync(normalized, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        return { logoSource: targetUri, logoLabel: label };
      }
    }
  } catch {
    return { logoSource: normalized, logoLabel: label };
  }

  return { logoSource: normalized, logoLabel: label };
}

async function resolveLogoAsDataUri(logoSource: string) {
  let source = logoSource.trim();

  try {
    if (!source) {
      const logoAsset = Asset.fromModule(require('../../assets/logo.png'));
      await logoAsset.downloadAsync();
      source = logoAsset.localUri ?? logoAsset.uri;
    }

    if (source.startsWith('data:image/')) {
      return source;
    }

    const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

    if (/^https?:\/\//i.test(source)) {
      if (!baseDirectory) {
        return null;
      }

      const extension = getLogoExtension(source);
      const downloadTarget = `${baseDirectory}mail-logo-${Date.now()}.${extension}`;
      const downloaded = await FileSystem.downloadAsync(source, downloadTarget);
      source = downloaded.uri;
    }

    if (source.startsWith('content://')) {
      if (!baseDirectory) {
        return null;
      }

      const extension = getLogoExtension(source);
      const copyTarget = `${baseDirectory}mail-logo-content-${Date.now()}.${extension}`;

      try {
        await FileSystem.copyAsync({ from: source, to: copyTarget });
        source = copyTarget;
      } catch {
        return null;
      }
    }

    const base64 = await FileSystem.readAsStringAsync(source, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const extension = getLogoExtension(source);
    const mimeSubType = extension === 'jpg' ? 'jpeg' : extension;

    return `data:image/${mimeSubType};base64,${base64}`;
  } catch {
    return null;
  }
}

function buildCsv(items: CartItem[], requestCode: string, categoryDisplayNames?: CategoryDisplayNames) {
  const headers = [
    'FOLIO',
    'CATEGORIA',
    'DESCRIPCION',
    'MODO',
    'CANTIDAD SOLICITADA',
    'UNIDAD SOLICITADA',
    'PESO CALCULADO',
    'UNIDAD RESULTADO',
    'FECHA REGISTRO',
  ];

  const rows = items.map((item) => [
    requestCode,
    categoryLabel(item.category, categoryDisplayNames),
    item.materialTitle,
    modeLabel(item.calcMode),
    formatNumber(item.requestValue),
    unitLabel(item.requestUnit),
    formatNumber(item.calculatedValue),
    unitLabel(item.calculatedUnit),
    new Date(item.createdAt).toLocaleString('es-MX'),
  ]);

  const delimiter = ';';

  return `\uFEFF${[headers, ...rows]
    .map((columns) => columns.map((column) => `"${sanitizeCsvCell(String(column)).replace(/"/g, '""')}"`).join(delimiter))
    .join('\n')}`;
}

function buildTemplateHtml(body: string) {
  return escapeHtml(body)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p style="margin:0 0 10px 0; font-size:13px; line-height:1.65; color:#e2e8f0;">${line}</p>`)
    .join('');
}

function calculateTotals(cartItems: CartItem[]) {
  const totalItems = cartItems.length;
  const totalPieces = cartItems.reduce((sum, item) => (item.calcMode === 'pieces' ? sum + Math.ceil(item.requestValue) : sum), 0);
  const totalKg = cartItems.reduce((sum, item) => sum + convertWeightUnitToKg(item.calculatedValue, item.calculatedUnit), 0);

  return {
    totalItems,
    totalPieces,
    totalKg,
  };
}

export type SendLogisticsEmailParams = {
  recipientEmail: string;
  requestCode: string;
  cartItems: CartItem[];
  preferences: AppPreferences;
  greeting: string;
};

export type SendLogisticsEmailResult = {
  statusType: 'success' | 'error';
  statusMessage: string;
  reserveFolio: boolean;
};

export async function sendLogisticsEmail({ recipientEmail, requestCode, cartItems, preferences, greeting }: SendLogisticsEmailParams): Promise<SendLogisticsEmailResult> {
  const now = new Date();
  const { totalItems, totalPieces, totalKg } = calculateTotals(cartItems);
  const subject = `Solicitud de material auxiliar ${requestCode} ${now.toLocaleDateString('es-MX')}`;
  const logoDataUri = await resolveLogoAsDataUri(preferences.logoSource);

  const renderedTemplateBody = renderEmailTemplate(preferences.emailTemplate, {
    greeting,
    folio: requestCode,
    totalMaterials: String(totalItems),
    totalPieces: formatPieces(totalPieces),
    totalKg: formatWeight(totalKg),
    attachmentNote: Platform.OS === 'web'
      ? 'En web no se adjunta archivo automaticamente; revisa el resumen del correo para generar la solicitud.'
      : 'En el archivo adjunto encontraran el detalle por tipo de material.',
    emailNote: preferences.emailNote,
    logoDataUri,
  });

  if (Platform.OS === 'web') {
    const mailtoUrl = buildMailtoUrl(recipientEmail.trim(), subject, renderedTemplateBody);
    const canOpen = await Linking.canOpenURL(mailtoUrl);

    if (!canOpen) {
      return {
        statusType: 'error',
        statusMessage: 'No se detecto cliente de correo en el navegador.',
        reserveFolio: false,
      };
    }

    await Linking.openURL(mailtoUrl);
    return {
      statusType: 'success',
      statusMessage: 'Correo abierto. Folio reservado para evitar duplicados en web.',
      reserveFolio: true,
    };
  }

  const available = await MailComposer.isAvailableAsync();

  if (!available) {
    const mailtoUrl = buildMailtoUrl(recipientEmail.trim(), subject, renderedTemplateBody);
    const canOpen = await Linking.canOpenURL(mailtoUrl);

    if (!canOpen) {
      return {
        statusType: 'error',
        statusMessage: 'No hay app de correo disponible en este dispositivo.',
        reserveFolio: false,
      };
    }

    await Linking.openURL(mailtoUrl);
    return {
      statusType: 'success',
      statusMessage: 'Se abrio la app de correo sin adjunto.',
      reserveFolio: true,
    };
  }

  const csv = buildCsv(cartItems, requestCode, preferences.categoryDisplayNames);
  const safeRequestCode = requestCode.replace(/[^A-Z0-9-]/gi, '');
  const fileName = `Solicitud_material_auxiliar_${safeRequestCode}_${now.toISOString().slice(0, 10)}_${Date.now()}.csv`;
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!baseDirectory) {
    return {
      statusType: 'error',
      statusMessage: 'No se pudo acceder al almacenamiento temporal para el adjunto.',
      reserveFolio: false,
    };
  }

  const fileUri = `${baseDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const templateBodyHtml = buildTemplateHtml(renderedTemplateBody);

  const htmlBody = `
    <div style="margin:0; padding:0; background:#0f1419; color:#f8fafc; font-family:Arial, Helvetica, sans-serif;">
      <div style="max-width:620px; margin:0 auto; padding:24px 16px 32px;">
        <div style="border:1px solid #334155; background:#161b22; border-radius:14px; overflow:hidden; box-shadow:0 16px 40px rgba(0,0,0,0.28);">
          <div style="padding:24px 20px; background:#0f1419;">
            <div style="font-size:16px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#e2e8f0; margin:0 0 6px 0;">${escapeHtml(preferences.headerSubtitle)}</div>
            <div style="font-size:13px; color:#94a3b8; margin:0 0 16px 0;">Folio ${escapeHtml(requestCode)}</div>
            <div style="margin:0 0 16px 0; padding:16px 18px; border:1px solid #334155; border-radius:12px; background:#111827; color:#e2e8f0; font-size:13px; line-height:1.7;">
              ${templateBodyHtml}
            </div>
            <div style="font-size:12px; color:#cbd5e1; text-align:center; padding-top:12px; border-top:1px solid #334155;">
              <div style="margin:12px 0 0 0; color:#94a3b8; font-size:11px; letter-spacing:0.08em; text-transform:uppercase;">Generado por SurtiTrack - Logistica Operativa</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const composeResult = await MailComposer.composeAsync({
    recipients: [recipientEmail.trim()],
    subject,
    body: htmlBody,
    isHtml: true,
    attachments: [fileUri],
  });

  if (composeResult.status === MailComposer.MailComposerStatus.SENT || composeResult.status === MailComposer.MailComposerStatus.SAVED) {
    return {
      statusType: 'success',
      statusMessage: 'Solicitud preparada correctamente con adjunto CSV.',
      reserveFolio: true,
    };
  }

  return {
    statusType: 'error',
    statusMessage: 'Envio cancelado. El folio no se incremento.',
    reserveFolio: false,
  };
}
