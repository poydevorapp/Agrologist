'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppLocale, MessageKey, message, supportedLocales } from '@/i18n/messages';

const STORAGE_KEY = 'agrologistik.locale';
type Values = Record<string, string | number>;
type LocaleContextValue = {
  locale: AppLocale;
  setLocale(locale: AppLocale): void;
  t(key: MessageKey, values?: Values): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
  date(value: string): string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): AppLocale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (supportedLocales.includes(stored as AppLocale)) return stored as AppLocale;
  const browser = navigator.language;
  return supportedLocales.find((locale) => locale.split('-')[0] === browser.split('-')[0]) ?? 'uz-UZ';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<AppLocale>('uz-UZ');
  useEffect(() => { updateLocale(initialLocale()); }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale(next) {
      window.localStorage.setItem(STORAGE_KEY, next);
      updateLocale(next);
    },
    t(key, values) {
      let result = message(locale, key);
      for (const [name, replacement] of Object.entries(values ?? {})) {
        result = result.replaceAll(`{${name}}`, String(replacement));
      }
      return result;
    },
    number: (numberValue, options) => new Intl.NumberFormat(locale, options).format(numberValue),
    date: (dateValue) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(dateValue)),
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n must be used inside LocaleProvider');
  return value;
}
