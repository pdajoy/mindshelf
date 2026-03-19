import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import zh from '../locales/zh.json';
import en from '../locales/en.json';

function detectLanguage(): string {
  try {
    const stored = localStorage.getItem('mindshelf_language');
    if (stored && stored !== 'auto') return stored;
  } catch {}
  try {
    const lang = chrome?.i18n?.getUILanguage?.() || navigator.language || 'en';
    return lang.startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

i18next.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function changeLanguage(lang: 'auto' | 'zh' | 'en') {
  if (lang === 'auto') {
    const detected = detectLanguage();
    i18next.changeLanguage(detected);
  } else {
    i18next.changeLanguage(lang);
  }
  try { localStorage.setItem('mindshelf_language', lang); } catch {}
}

export const useT = useTranslation;
export default i18next;
