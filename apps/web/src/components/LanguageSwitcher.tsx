'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, type Locale } from '@/i18n/routing';

const labels: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  ar: 'العربية'
};

// Быстрое переключение языка без перезагрузки страницы: меняем сегмент локали в
// текущем маршруте; выбранный язык сохраняется в cookie middleware'ом next-intl.
export function LanguageSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="lang-switcher">
      <span className="sr-only">{t('language')}</span>
      🌐
      <select
        value={locale}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value as Locale;
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {labels[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
