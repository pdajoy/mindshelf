export type AppLanguage = 'auto' | 'zh' | 'en';
export type ResolvedLanguage = 'zh' | 'en';

export const SETTINGS_STORAGE_KEY = 'mindshelf_settings';
export const LOCAL_LANGUAGE_KEY = 'mindshelf_language';

export interface UiPreferences {
  language: AppLanguage;
  selectionToolbarEnabled: boolean;
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'auto' || value === 'zh' || value === 'en';
}

export function getDetectedLanguage(): ResolvedLanguage {
  try {
    const uiLanguage =
      (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
      (typeof navigator !== 'undefined' ? navigator.language : undefined) ||
      'en';
    return uiLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function resolveLanguage(language: AppLanguage | null | undefined): ResolvedLanguage {
  if (language === 'zh' || language === 'en') return language;
  return getDetectedLanguage();
}

export function getStoredLocalLanguagePreference(): AppLanguage {
  if (typeof localStorage === 'undefined') return 'auto';
  try {
    const stored = localStorage.getItem(LOCAL_LANGUAGE_KEY);
    return isAppLanguage(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function persistLocalLanguagePreference(language: AppLanguage) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_LANGUAGE_KEY, language);
  } catch {}
}

export function parseStoredUiPreferences(value: unknown): UiPreferences {
  const settings = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  return {
    language: isAppLanguage(settings.language) ? settings.language : 'auto',
    selectionToolbarEnabled: settings.selectionToolbarEnabled !== false,
  };
}

export async function readStoredUiPreferences(): Promise<UiPreferences> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { language: 'auto', selectionToolbarEnabled: true };
  }

  try {
    const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    return parseStoredUiPreferences(result[SETTINGS_STORAGE_KEY]);
  } catch {
    return { language: 'auto', selectionToolbarEnabled: true };
  }
}
