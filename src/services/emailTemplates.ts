import type { CartItem, CategoryDisplayNames, MaterialCategory, MaterialUnit } from '../types/logistics';
import { formatNumber } from '../utils/calculations';

const DEFAULT_CATEGORY_DISPLAY_NAMES: CategoryDisplayNames = {
  bolsas: 'Bolsas',
  cajas: 'Cajas',
  otros: 'Otros',
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

export function buildProfessionalEmailHtml(params: {
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
