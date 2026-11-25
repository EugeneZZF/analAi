import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ru, LocaleDict } from '@/locales/ru';
import { en } from '@/locales/en';

export type LocaleCode = 'ru' | 'en';

const LOCALE_STORAGE_KEY = 'analai_language';

const DICTIONARIES: Record<LocaleCode, LocaleDict> = {
  ru,
  en,
};

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (next: LocaleCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'ru',
  setLocale: () => {},
  t: (key) => key,
});

const resolvePath = (obj: Record<string, any>, path: string): string | undefined => {
  const parts = path.split('.');
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('ru');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'en' || stored === 'ru') {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = useCallback((next: LocaleCode) => {
    const normalized: LocaleCode = next === 'en' ? 'en' : 'ru';
    setLocaleState(normalized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = DICTIONARIES[locale] || ru;
      let text = resolvePath(dict, key) ?? resolvePath(ru, key) ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useTranslation = () => useContext(I18nContext);
