'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, localeLabels, type Locale } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { Icon } from './Icon';

/**
 * Быстрое переключение языка без перезагрузки страницы: меняем сегмент локали в
 * текущем маршруте.
 *
 * Выбор ещё и СОХРАНЯЕТСЯ в профиль, если пользователь вошёл. Раньше этот
 * переключатель менял только адрес, а поле «Язык» в настройках показывало
 * сохранённое значение — после первого же переключения два списка показывали
 * разное. Хуже того, письма и уведомления берут язык из профиля: интерфейс был
 * английским, а письма приходили на прежнем языке, и объяснить это было нечем.
 */
export function LanguageSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="lang-switcher">
      <span className="sr-only">{t('language')}</span>
      <Icon name="globe" />
      <select
        value={locale}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value as Locale;
          const token = tokenStore.get();
          if (token) {
            // Лучшее усилие: язык интерфейса переключается в любом случае, даже
            // если сохранить не вышло.
            void apiFetch('/users/me', {
              method: 'PATCH',
              token,
              locale: next,
              body: { locale: next }
            }).catch(() => undefined);
          }
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeLabels[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
