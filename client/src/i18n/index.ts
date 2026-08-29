import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { arTranslation } from './locales/ar/translation'
import { enTranslation } from './locales/en/translation'

export type AppLanguage = 'ar' | 'en'

const LANGUAGE_STORAGE_KEY = 'qnh-taskhub-language'

function isAppLanguage(value: string | null): value is AppLanguage {
  return value === 'ar' || value === 'en'
}

function getInitialLanguage(): AppLanguage {
  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isAppLanguage(storedLanguage) ? storedLanguage : 'ar'
}

function applyDocumentLanguage(language: AppLanguage): void {
  document.documentElement.lang = language
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
}

const initialLanguage = getInitialLanguage()

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: arTranslation },
    en: { translation: enTranslation },
  },
  lng: initialLanguage,
  fallbackLng: 'ar',
  interpolation: {
    escapeValue: false,
  },
})

applyDocumentLanguage(initialLanguage)

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  applyDocumentLanguage(language)
  await i18n.changeLanguage(language)
}

export function getAppLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : 'ar'
}

export { i18n }
