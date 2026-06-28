'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { locales, type Locale } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';

// Curated IANA time zones (label = UTC offset shown for orientation).
const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Warsaw',
  'Europe/Kyiv',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Africa/Tunis',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney'
];

const localeLabels: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  ar: 'العربية'
};

export function SettingsView() {
  const t = useTranslations('settings');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    timezone: '',
    locale
  });

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    (async () => {
      try {
        const profile = await apiFetch<Me & { timezone?: string }>('/users/me', {
          token,
          locale
        });
        setMe(profile);
        setForm({
          email: profile.email ?? '',
          firstName: profile.firstName ?? '',
          lastName: profile.lastName ?? '',
          timezone: (profile as { timezone?: string }).timezone ?? 'UTC',
          locale: (profile.locale as Locale) ?? locale
        });
        setState('ready');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          router.push('/');
          return;
        }
        setState('error');
      }
    })();
  }, [locale, router]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/users/me', {
        method: 'PATCH',
        token,
        locale,
        body: {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          timezone: form.timezone,
          locale: form.locale
        }
      });
      setSaved(true);
      // If the UI language changed, switch the route locale so it takes effect.
      if (form.locale !== locale) {
        router.replace('/settings', { locale: form.locale });
      }
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <h2>{t('title')}</h2>
      <form className="card form-grid" onSubmit={save}>
        <label>
          {t('email')}
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        {me?.role !== 'student' && (
          <label>
            {t('role')}
            <input value={me?.role ?? ''} disabled />
          </label>
        )}
        <label>
          {t('firstName')}
          <input
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </label>
        <label>
          {t('lastName')}
          <input
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </label>
        <label>
          {t('timezone')}
          <select
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          >
            {!TIMEZONES.includes(form.timezone) && form.timezone && (
              <option value={form.timezone}>{form.timezone}</option>
            )}
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('language')}
          <select
            value={form.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value as Locale })}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeLabels[l]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saving}>
          {saving ? '…' : saved ? t('saved') : t('save')}
        </button>
      </form>
    </div>
  );
}
