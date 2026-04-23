import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import zh from '../locales/zh.json';
import en from '../locales/en.json';
import {
  getStoredLocalLanguagePreference,
  persistLocalLanguagePreference,
  resolveLanguage,
  type AppLanguage,
} from './language';

function detectLanguage(): string {
  return resolveLanguage(getStoredLocalLanguagePreference());
}

i18next.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function changeLanguage(lang: AppLanguage) {
  persistLocalLanguagePreference(lang);
  i18next.changeLanguage(resolveLanguage(lang));
}

export const useT = useTranslation;
export default i18next;
