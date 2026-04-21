import { useState } from 'react';
import type { AppPreferences, MaterialCategory, MaterialDraft, TemplateElement } from '../types/logistics';

export function useAppPreferences(initialPreferences: AppPreferences) {
  const [preferences, setPreferences] = useState<AppPreferences>(initialPreferences);
  const [draftPreferences, setDraftPreferences] = useState<AppPreferences>(initialPreferences);
  const [templateElements, setTemplateElements] = useState<TemplateElement[]>([]);
  const [draftTemplateElements, setDraftTemplateElements] = useState<TemplateElement[]>([]);
  const [runtimeLogoSource, setRuntimeLogoSource] = useState('');
  const [logoPermissionDenied, setLogoPermissionDenied] = useState(false);
  const [drafts, setDrafts] = useState<Record<MaterialCategory, MaterialDraft>>({
    bolsas: { title: '', weightInput: '', weightUnit: 'g', otherUnit: 'kg' },
    cajas: { title: '', weightInput: '', weightUnit: 'kg', otherUnit: 'kg' },
    otros: { title: '', weightInput: '', weightUnit: 'kg', otherUnit: 'kg' },
  });

  return {
    preferences,
    setPreferences,
    draftPreferences,
    setDraftPreferences,
    templateElements,
    setTemplateElements,
    draftTemplateElements,
    setDraftTemplateElements,
    runtimeLogoSource,
    setRuntimeLogoSource,
    logoPermissionDenied,
    setLogoPermissionDenied,
    drafts,
    setDrafts,
  };
}
