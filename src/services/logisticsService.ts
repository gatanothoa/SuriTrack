import { Linking, Platform } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as MailComposer from 'expo-mail-composer';
import * as XLSX from 'xlsx-js-style';
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

function formatDateTime(date: Date) {
  return date.toLocaleString('es-MX');
}

function formatRequestMaterial(item: CartItem, categoryDisplayNames?: CategoryDisplayNames) {
  return `${categoryLabel(item.category, categoryDisplayNames)} - ${item.materialTitle}`;
}

function formatSupplyAmount(item: CartItem) {
  return `${formatNumber(item.calculatedValue)} ${unitLabel(item.calculatedUnit)}`;
}

function calculateSupplySummary(cartItems: CartItem[]) {
  const totals = new Map<MaterialUnit, number>();

  cartItems.forEach((item) => {
    const current = totals.get(item.calculatedUnit) ?? 0;
    totals.set(item.calculatedUnit, current + item.calculatedValue);
  });

  return Array.from(totals.entries())
    .sort(([leftUnit], [rightUnit]) => {
      const order: Record<MaterialUnit, number> = { kg: 0, g: 1, l: 2, pieces: 3 };
      return order[leftUnit] - order[rightUnit];
    })
    .map(([unit, value]) => `${formatNumber(value)} ${unitLabel(unit)}`)
    .join(' · ');
}

function escapeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeSpreadsheetCell(value: string) {
  const normalized = value.trimStart();

  if (/^[=+\-@]/.test(normalized)) {
    return `'${value}`;
  }

  return value;
}

function buildMailLogoHtml(logoDataUri?: string | null) {
  if (logoDataUri) {
    return `<img src="${logoDataUri}" alt="Logo de la empresa" style="height:42px; max-width:170px; object-fit:contain; display:block;" />`;
  }

  return `<div style="width:42px; height:42px; border-radius:10px; background:#DBEAFE; color:#1D4ED8; display:flex; align-items:center; justify-content:center; font-size:18px;">📦</div>`;
}

function buildMailLogoText(appName: string) {
  return `${appName}`;
}

function buildGreetingHtml(greeting: string) {
  return `<p style="margin:0; font-size:14px; line-height:1.7; color:#0D2447;">${escapeHtml(greeting)}</p>`;
}

function buildGreetingText(greeting: string) {
  return `${greeting}`;
}

function buildFolioHtml(folio: string) {
  return `<div style="display:inline-block; background:#DBEAFE; color:#1D4ED8; border:1px solid #93C5FD; border-radius:999px; padding:7px 12px; font-size:12px; font-weight:700;">📌 Folio ${escapeHtml(folio)}</div>`;
}

function buildFolioText(folio: string) {
  return `📌 Folio ${folio}`;
}

function buildMaterialTableHtml(rows: CartItem[], categoryDisplayNames?: CategoryDisplayNames) {
  const tableRows = rows.length > 0
    ? rows
        .map(
          (item, index) => `
            <tr>
              <td style="padding:12px 10px; border-bottom:1px solid #D7E4F5; color:#0D2447; font-size:13px;">${index + 1}. ${escapeHtml(formatRequestMaterial(item, categoryDisplayNames))}</td>
              <td style="padding:12px 10px; border-bottom:1px solid #D7E4F5; color:#0D2447; font-size:13px; font-weight:700; white-space:nowrap;">${escapeHtml(formatSupplyAmount(item))}</td>
              <td style="padding:12px 10px; border-bottom:1px solid #D7E4F5; color:#4E6B94; font-size:12px; white-space:nowrap;">${escapeHtml(formatDateTime(new Date(item.createdAt)))}</td>
            </tr>
          `
        )
        .join('')
    : `
        <tr>
          <td colspan="3" style="padding:14px 10px; color:#4E6B94; font-size:13px; text-align:center;">Sin materiales para mostrar</td>
        </tr>
      `;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; border:1px solid #D7E4F5; border-radius:12px; overflow:hidden;">
      <thead>
        <tr style="background:#EFF6FF;">
          <th align="left" style="padding:11px 10px; color:#1E3A8A; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; border-bottom:1px solid #D7E4F5;">Tipo de material</th>
          <th align="left" style="padding:11px 10px; color:#1E3A8A; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; border-bottom:1px solid #D7E4F5;">Cantidad a surtir</th>
          <th align="left" style="padding:11px 10px; color:#1E3A8A; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; border-bottom:1px solid #D7E4F5;">Fecha</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
}

function buildMaterialTableText(rows: CartItem[], categoryDisplayNames?: CategoryDisplayNames) {
  if (rows.length === 0) {
    return 'Sin materiales para mostrar';
  }

  return rows
    .map((item, index) => `${index + 1}. Tipo de material: ${formatRequestMaterial(item, categoryDisplayNames)}\n   Cantidad a surtir: ${formatSupplyAmount(item)}\n   Fecha: ${formatDateTime(new Date(item.createdAt))}`)
    .join('\n\n');
}

function buildTotalSupplyHtml(totalSupply: string) {
  return `
    <div style="margin-top:16px; padding:14px 16px; border:1px solid #D7E4F5; border-radius:12px; background:#F8FBFF;">
      <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#4E6B94;">Total a surtir</div>
      <div style="margin-top:4px; font-size:18px; font-weight:700; color:#0D2447;">${escapeHtml(totalSupply || '0')}</div>
    </div>
  `;
}

function buildTotalSupplyText(totalSupply: string) {
  return `Total a surtir: ${totalSupply || '0'}`;
}

function buildRequestDateHtml(requestDate: string) {
  return `<div style="margin-top:10px; font-size:12px; color:#4E6B94;">Fecha: ${escapeHtml(requestDate)}</div>`;
}

function buildRequestDateText(requestDate: string) {
  return `Fecha: ${requestDate}`;
}

function buildAttachmentNoteHtml(attachmentNote: string) {
  return `<div style="margin-top:16px; padding:12px 14px; border-left:4px solid #93C5FD; background:#EFF6FF; color:#0D2447; font-size:13px; line-height:1.6;">${escapeHtml(attachmentNote)}</div>`;
}

function buildAttachmentNoteText(attachmentNote: string) {
  return attachmentNote;
}

function buildClosingHtml(emailNote: string) {
  return `<p style="margin:10px 0 0; font-size:13px; line-height:1.7; color:#0D2447;">Saludos cordiales.</p><p style="margin:4px 0 0; font-size:13px; line-height:1.7; color:#4E6B94;">${escapeHtml(emailNote)}</p>`;
}

function buildClosingText(emailNote: string) {
  return `Saludos cordiales.\n${emailNote}`;
}

function renderTemplateBlocks(template: string | TemplateElement[], context: {
  appName: string;
  greeting: string;
  folio: string;
  totalKg: string;
  requestDate: string;
  attachmentNote: string;
  emailNote: string;
  rows: CartItem[];
  categoryDisplayNames?: CategoryDisplayNames;
  logoDataUri?: string | null;
}, mode: 'html' | 'text') {
  const templateElements = Array.isArray(template) ? template : stringToTemplateElements(template);
  const fieldValues: Record<AvailableField, string> = {
    logo: mode === 'html' ? buildMailLogoHtml(context.logoDataUri) : buildMailLogoText(context.appName),
    greeting: mode === 'html' ? buildGreetingHtml(context.greeting) : buildGreetingText(context.greeting),
    folio: mode === 'html' ? buildFolioHtml(context.folio) : buildFolioText(context.folio),
    materialTable: mode === 'html' ? buildMaterialTableHtml(context.rows, context.categoryDisplayNames) : buildMaterialTableText(context.rows, context.categoryDisplayNames),
    requestDate: mode === 'html' ? buildRequestDateHtml(context.requestDate) : buildRequestDateText(context.requestDate),
    totalKg: mode === 'html' ? buildTotalSupplyHtml(context.totalKg) : buildTotalSupplyText(context.totalKg),
    totalMaterials: mode === 'html' ? `<div style="margin-top:10px; font-size:12px; color:#4E6B94;">Total de materiales: ${context.rows.length}</div>` : `Total de materiales: ${context.rows.length}`,
    totalPieces: mode === 'html' ? `<div style="margin-top:10px; font-size:12px; color:#4E6B94;">Total de piezas: ${context.rows.reduce((sum, item) => sum + (item.requestUnit === 'pieces' ? Math.ceil(item.requestValue) : 0), 0)}</div>` : `Total de piezas: ${context.rows.reduce((sum, item) => sum + (item.requestUnit === 'pieces' ? Math.ceil(item.requestValue) : 0), 0)}`,
    attachmentNote: mode === 'html' ? buildAttachmentNoteHtml(context.attachmentNote) : buildAttachmentNoteText(context.attachmentNote),
    emailNote: mode === 'html' ? buildClosingHtml(context.emailNote) : buildClosingText(context.emailNote),
  };

  return templateElements
    .map((element) => {
      if (element.type === 'text') {
        if (mode === 'html') {
          return element.content
            .split('\n')
            .map((line) => escapeHtml(line))
            .join('<br/>');
        }

        return element.content;
      }

      return fieldValues[element.name] || '';
    })
    .join(mode === 'html' ? '' : '\n');
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
  const fieldPattern = /\{(logo|greeting|folio|materialTable|requestDate|totalKg|totalMaterials|totalPieces|attachmentNote|emailNote)\}/g;
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
  context: {
    appName: string;
    greeting: string;
    folio: string;
    totalKg: string;
    requestDate: string;
    attachmentNote: string;
    emailNote: string;
    rows: CartItem[];
    categoryDisplayNames?: CategoryDisplayNames;
    logoDataUri?: string | null;
  },
  mode: 'html' | 'text' = 'html'
) {
  return renderTemplateBlocks(template, context, mode);
}

async function buildExcelAttachment(params: {
  appName: string;
  requestCode: string;
  rows: CartItem[];
  categoryDisplayNames?: CategoryDisplayNames;
  requestDate: string;
}) {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [sanitizeSpreadsheetCell(params.appName), '', ''],
    ['Solicitud de surtido', '', ''],
    [sanitizeSpreadsheetCell(`Folio: ${params.requestCode}`), '', ''],
    ['Tipo de material', 'Cantidad a surtir', 'Fecha'],
    ...params.rows.map((item) => [
      sanitizeSpreadsheetCell(formatRequestMaterial(item, params.categoryDisplayNames)),
      sanitizeSpreadsheetCell(formatSupplyAmount(item)),
      sanitizeSpreadsheetCell(params.requestDate),
    ]),
    [sanitizeSpreadsheetCell('Total a surtir'), sanitizeSpreadsheetCell(calculateSupplySummary(params.rows)), ''],
    [sanitizeSpreadsheetCell(`Fecha: ${params.requestDate}`), '', ''],
  ]);

  const totalRowIndex = 5 + params.rows.length;
  const noteRowIndex = totalRowIndex + 1;

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
    { s: { r: noteRowIndex - 1, c: 0 }, e: { r: noteRowIndex - 1, c: 2 } },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitud');

  const headerStyle = {
    font: { bold: true, color: { rgb: '1E3A8A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'D7E4F5' } },
      bottom: { style: 'thin', color: { rgb: 'D7E4F5' } },
      left: { style: 'thin', color: { rgb: 'D7E4F5' } },
      right: { style: 'thin', color: { rgb: 'D7E4F5' } },
    },
  } as const;

  const titleStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0E2748' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  } as const;

  const subtitleStyle = {
    font: { bold: true, color: { rgb: '1D4ED8' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  } as const;

  const folioStyle = {
    font: { bold: true, color: { rgb: '0D2447' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } as const;

  const bodyStyle = {
    font: { color: { rgb: '0D2447' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'D7E4F5' } },
      bottom: { style: 'thin', color: { rgb: 'D7E4F5' } },
      left: { style: 'thin', color: { rgb: 'D7E4F5' } },
      right: { style: 'thin', color: { rgb: 'D7E4F5' } },
    },
  } as const;

  const ws = workbook.Sheets['Solicitud'];
  if (ws?.A1) ws.A1.s = titleStyle;
  if (ws?.A2) ws.A2.s = subtitleStyle;
  if (ws?.A3) ws.A3.s = folioStyle;

  ['A4', 'B4', 'C4'].forEach((cellRef) => {
    if (ws?.[cellRef]) ws[cellRef].s = headerStyle;
  });

  for (let rowIndex = 5; rowIndex < 5 + params.rows.length; rowIndex += 1) {
    const firstCell = ws?.[`A${rowIndex}`];
    const secondCell = ws?.[`B${rowIndex}`];
    const thirdCell = ws?.[`C${rowIndex}`];

    if (firstCell) firstCell.s = bodyStyle;
    if (secondCell) secondCell.s = { ...bodyStyle, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, font: { color: { rgb: '0D2447' }, bold: true } };
    if (thirdCell) thirdCell.s = { ...bodyStyle, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, font: { color: { rgb: '4E6B94' } } };
  }

  if (ws?.[`A${totalRowIndex}`]) ws[`A${totalRowIndex}`].s = { ...bodyStyle, fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } }, font: { bold: true, color: { rgb: '1E3A8A' } } };
  if (ws?.[`B${totalRowIndex}`]) ws[`B${totalRowIndex}`].s = { ...bodyStyle, fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } }, font: { bold: true, color: { rgb: '0D2447' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };

  if (ws?.[`A${noteRowIndex}`]) ws[`A${noteRowIndex}`].s = { font: { italic: true, color: { rgb: '4E6B94' } }, alignment: { horizontal: 'left', vertical: 'center' } };

  ws['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 22 }];
  ws['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };

  const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64', cellStyles: true });
  const safeRequestCode = params.requestCode.replace(/[^A-Z0-9-]/gi, '');
  const fileName = `Solicitud_surtido_${safeRequestCode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!baseDirectory) {
    return null;
  }

  const fileUri = `${baseDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { fileUri, fileName };
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

export async function sendLogisticsEmail({ recipientEmail, requestCode, cartItems, preferences, greeting }: SendLogisticsEmailParams): Promise<SendLogisticsEmailResult> {
  const now = new Date();
  const subject = `Solicitud de material auxiliar ${requestCode} ${now.toLocaleDateString('es-MX')}`;
  const logoDataUri = await resolveLogoAsDataUri(preferences.logoSource);
  const requestDate = formatDateTime(now);
  const totalSupply = calculateSupplySummary(cartItems);
  const emailContext = {
    appName: preferences.appName,
    greeting,
    folio: requestCode,
    totalKg: totalSupply,
    requestDate,
    attachmentNote: 'Revisa el desglose por material en el detalle adjunto.',
    emailNote: preferences.emailNote,
    rows: cartItems,
    categoryDisplayNames: preferences.categoryDisplayNames,
    logoDataUri,
  };
  const htmlBody = renderEmailTemplate(preferences.emailTemplate, emailContext, 'html');
  const textBody = renderEmailTemplate(preferences.emailTemplate, emailContext, 'text');

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
      statusMessage: 'Se abrio la app de correo con formato de texto.',
      reserveFolio: true,
    };
  }

  let attachment: Awaited<ReturnType<typeof buildExcelAttachment>> | null = null;
  let attachmentGenerationFailed = false;

  try {
    attachment = await buildExcelAttachment({
      appName: preferences.appName,
      requestCode,
      rows: cartItems,
      categoryDisplayNames: preferences.categoryDisplayNames,
      requestDate,
    });
  } catch {
    attachment = null;
    attachmentGenerationFailed = true;
  }

  const composePayload: Parameters<typeof MailComposer.composeAsync>[0] = {
    recipients: [recipientEmail.trim()],
    subject,
    body: htmlBody,
    isHtml: true,
  };

  if (attachment) {
    composePayload.attachments = [attachment.fileUri];
  }

  const composeResult = await MailComposer.composeAsync(composePayload);

  if (composeResult.status === MailComposer.MailComposerStatus.SENT || composeResult.status === MailComposer.MailComposerStatus.SAVED) {
    return {
      statusType: 'success',
      statusMessage: attachmentGenerationFailed
        ? 'Solicitud enviada sin adjunto de Excel. El correo se preparó correctamente.'
        : 'Solicitud preparada correctamente en formato profesional.',
      reserveFolio: true,
    };
  }

  return {
    statusType: 'error',
    statusMessage: 'Envio cancelado. El folio no se incremento.',
    reserveFolio: false,
  };
}
