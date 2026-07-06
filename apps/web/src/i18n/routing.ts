import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

// Поддерживаемые языки. Добавление нового языка = добавить код сюда и файл
// messages/<locale>.json — бизнес-логика при этом не меняется.
export const locales = ['en', 'ru', 'de', 'fr', 'nl', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

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
