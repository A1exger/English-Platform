import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

// Поддерживаемые языки. Добавление нового языка = добавить код сюда и файл
// messages/<locale>.json — бизнес-логика при этом не меняется.
export const locales = ['en', 'ru', 'de', 'fr', 'nl', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// Название каждого языка на нём самом. Одно место на всё приложение: два списка
// в двух переключателях однажды уже разъехались.
export const localeLabels: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  ar: 'العربية'
};

// Языки с раскладкой справа налево.
export const rtlLocales: Locale[] = ['ar'];

export function isRtl(locale: string): boolean {
  return rtlLocales.includes(locale as Locale);
}

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Префикс локали в URL добавляется всегда: /en/..., /ar/...
  localePrefix: 'always'
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
