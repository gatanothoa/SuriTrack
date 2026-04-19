import { Linking, Platform } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as MailComposer from 'expo-mail-composer';
import { formatNumber } from '../utils/calculations';
import type { AppPreferences, CartItem, MaterialCategory, MaterialUnit, TemplateElement, AvailableField, CategoryDisplayNames } from '../types/logistics';

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

function buildMaterialType(item: CartItem, categoryDisplayNames?: CategoryDisplayNames) {
  const category = categoryLabel(item.category, categoryDisplayNames);
  return `${category} - ${item.materialTitle}`;
}

function buildSupplyQuantity(item: CartItem) {
  return `${formatNumber(item.calculatedValue)} ${unitLabel(item.calculatedUnit)}`;
}

function buildRequestDate(now: Date) {
  return now.toLocaleString('es-MX');
}

function buildMailBodyText(requestCode: string, rows: CartItem[], now: Date, categoryDisplayNames?: CategoryDisplayNames) {
  const requestDate = buildRequestDate(now);
  const detail = rows
    .map((item, index) => `${index + 1}. Tipo de material: ${buildMaterialType(item, categoryDisplayNames)}\n   Cantidad a surtir: ${buildSupplyQuantity(item)}\n   Fecha: ${requestDate}`)
    .join('\n\n');

  return `Folio: ${requestCode}\n\n${detail}`;
}

function buildProfessionalEmailHtml(params: {
  appName: string;
  logoDataUri?: string | null;
  requestCode: string;
  rows: CartItem[];
  now: Date;
  categoryDisplayNames?: CategoryDisplayNames;
}) {
  const requestDate = buildRequestDate(params.now);
  const logoBlock = params.logoDataUri
    ? `<img src="${params.logoDataUri}" alt="Logo" style="height:42px; max-width:170px; object-fit:contain; display:block;" />`
    : `<div style="width:42px; height:42px; border-radius:10px; background:#DBEAFE; color:#1D4ED8; display:flex; align-items:center; justify-content:center; font-size:18px;">📦</div>`;

  const rowsHtml = params.rows
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 10px; border-bottom:1px solid #D7E4F5; color:#0D2447; font-size:13px;">${escapeHtml(buildMaterialType(item, params.categoryDisplayNames))}</td>
          <td style="padding:12px 10px; border-bottom:1px solid #D7E4F5; color:#0D2447; font-size:13px; font-weight:600;">${escapeHtml(buildSupplyQuantity(item))}</td>
          <td style="padding:12px 10px; border-bottom:1px solid #D7E4F5; color:#4E6B94; font-size:12px;">${escapeHtml(requestDate)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div style="margin:0; padding:24px 14px; background:#F2F7FD; font-family:Segoe UI, Arial, Helvetica, sans-serif; color:#0D2447;">
      <div style="max-width:720px; margin:0 auto; background:#FFFFFF; border:1px solid #D7E4F5; border-radius:16px; overflow:hidden; box-shadow:0 10px 28px rgba(13,36,71,0.08);">
        <div style="padding:18px 20px; background:linear-gradient(135deg,#0E2748 0%,#1D4ED8 100%); color:#FFFFFF;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div>
              <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; opacity:0.88;">Solicitud de surtido</div>
              <div style="font-size:20px; font-weight:700; margin-top:4px;">${escapeHtml(params.appName)}</div>
            </div>
            ${logoBlock}
          </div>
        </div>

        <div style="padding:18px 20px;">
          <div style="display:inline-block; background:#DBEAFE; color:#1D4ED8; border:1px solid #93C5FD; border-radius:999px; padding:7px 12px; font-size:12px; font-weight:700; margin-bottom:14px;">📌 Folio ${escapeHtml(params.requestCode)}</div>

          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; border:1px solid #D7E4F5; border-radius:10px; overflow:hidden;">
            <thead>
              <tr style="background:#EFF6FF;">
                <th align="left" style="padding:11px 10px; color:#1E3A8A; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; border-bottom:1px solid #D7E4F5;">Tipo de material</th>
                <th align="left" style="padding:11px 10px; color:#1E3A8A; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; border-bottom:1px solid #D7E4F5;">Cantidad a surtir</th>
                <th align="left" style="padding:11px 10px; color:#1E3A8A; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; border-bottom:1px solid #D7E4F5;">Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
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

export async function sendLogisticsEmail({ recipientEmail, requestCode, cartItems, preferences, greeting: _greeting }: SendLogisticsEmailParams): Promise<SendLogisticsEmailResult> {
  const now = new Date();
  const subject = `Solicitud de material auxiliar ${requestCode} ${now.toLocaleDateString('es-MX')}`;
  const logoDataUri = await resolveLogoAsDataUri(preferences.logoSource);
  const textBody = buildMailBodyText(requestCode, cartItems, now, preferences.categoryDisplayNames);

  if (Platform.OS === 'web') {
    const mailtoUrl = buildMailtoUrl(recipientEmail.trim(), subject, textBody);
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
    const mailtoUrl = buildMailtoUrl(recipientEmail.trim(), subject, textBody);
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
  const htmlBody = buildProfessionalEmailHtml({
    appName: preferences.appName,
    logoDataUri,
    requestCode,
    rows: cartItems,
    now,
    categoryDisplayNames: preferences.categoryDisplayNames,
  });

  const composeResult = await MailComposer.composeAsync({
    recipients: [recipientEmail.trim()],
    subject,
    body: htmlBody,
    isHtml: true,
  });

  if (composeResult.status === MailComposer.MailComposerStatus.SENT || composeResult.status === MailComposer.MailComposerStatus.SAVED) {
    return {
      statusType: 'success',
      statusMessage: 'Solicitud preparada correctamente en formato profesional.',
      reserveFolio: true,
    };
  }

  return {
    statusType: 'error',
    statusMessage: 'Envio cancelado. El folio no se incremento.',
    reserveFolio: false,
  };
}
