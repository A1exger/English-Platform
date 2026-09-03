'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { locales, type Locale } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { Icon } from './Icon';
import { useAppTimeZone } from './AppIntlProvider';

// Curated IANA time zones offered as an explicit override. "Auto" (empty value)
// is added in the <select> and means "use the viewer's own browser zone".
const TIMEZONES = [
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

// '' means "auto (browser zone)". The legacy default 'UTC' is treated as auto too,
// so users who never picked a zone keep seeing their own local time.
function autoTz(v?: string): string {
  return v && v !== 'UTC' ? v : '';
}

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
  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  const { setProfileTimeZone } = useAppTimeZone();

  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Telegram is opt-in per person: the bot cannot message anyone who has not
  // pressed Start, so each user connects their own chat from here (one tap).
  const [telegram, setTelegram] = useState<{ connected: boolean; url: string | null } | null>(
    null
  );
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
          timezone: autoTz((profile as { timezone?: string }).timezone),
          locale: (profile.locale as Locale) ?? locale
        });
        setTelegram(await fetchTelegram(token));
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

  const fetchTelegram = useCallback(
    (token: string) =>
      apiFetch<{ connected: boolean; url: string | null }>('/notifications/telegram', {
        token,
        locale
      }).catch(() => null),
    [locale]
  );

  /**
   * Connecting happens in Telegram, in another tab — this page is never told.
   * Re-check whenever the user comes back to it, so the state flips to connected
   * on its own instead of needing a manual reload.
   */
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      const token = tokenStore.get();
      if (!token) return;
      void fetchTelegram(token).then((tg) => tg && setTelegram(tg));
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [fetchTelegram]);

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
      // Apply the new zone across the app immediately (no reload needed).
      setProfileTimeZone(form.timezone);
      // If the UI language changed, switch the route locale so it takes effect.
      if (form.locale !== locale) {
        router.replace('/settings', { locale: form.locale });
      }
    } finally {
      setSaving(false);
    }
  }

  async function disconnectTelegram() {
    const token = tokenStore.get();
    if (!token) return;
    setTelegram((prev) => (prev ? { ...prev, connected: false } : prev));
    await apiFetch('/notifications/telegram', { method: 'DELETE', token, locale }).catch(
      () => undefined
    );
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
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
            <option value="">
              {t('timezoneAuto')}{browserTz ? ` (${browserTz})` : ''}
            </option>
            {!TIMEZONES.includes(form.timezone) && form.timezone && (
              <option value={form.timezone}>{form.timezone}</option>
            )}
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <small className="muted">{t('timezoneHint')}</small>
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

      {/* Notification channels. Email needs nothing — it goes to the address
          above. Telegram is a one-tap connect, only offered when the server has
          a bot configured. */}
      <div className="card">
        <strong>{t('notifications')}</strong>
        <p className="muted">{t('emailChannel', { email: form.email })}</p>
        {telegram?.url && (
          <div className="row-between tg-row">
            <span className={telegram.connected ? 'tg-connected' : 'muted'}>
              {telegram.connected && <Icon name="check-circle" />}
              {telegram.connected ? t('telegramOn') : t('telegramHint')}
            </span>
            {telegram.connected ? (
              <button type="button" className="ghost" onClick={disconnectTelegram}>
                {t('telegramDisconnect')}
              </button>
            ) : (
              <a
                className="cta-primary"
                href={telegram.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('telegramConnect')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
