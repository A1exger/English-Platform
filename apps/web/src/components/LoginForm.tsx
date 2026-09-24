'use client';

import { FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { login, tokenStore } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

export function LoginForm() {
  const t = useTranslations('common');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Forgot password" swaps the form for a single address field. The response
  // is deliberately the same whether or not the address is registered.
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tokens = await login(email, password, locale);
      tokenStore.set(tokens);
      router.push('/dashboard');
    } catch {
      setError(tApp('authError'));
    } finally {
      setLoading(false);
    }
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        locale,
        body: { email, locale }
      });
    } catch {
      /* Never surface a failure here: it would reveal whether the address
         exists. The confirmation below is unconditional. */
    } finally {
      setSent(true);
      setLoading(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <form className="card login" onSubmit={sendReset}>
        <strong>{t('forgotTitle')}</strong>
        {sent ? (
          <>
            <p className="muted">{t('forgotSent')}</p>
            <button type="button" onClick={() => { setMode('signin'); setSent(false); }}>
              {t('backToSignIn')}
            </button>
          </>
        ) : (
          <>
            <p className="muted">{t('forgotHint')}</p>
            <label>
              {t('email')}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <button type="submit" disabled={loading || !email}>
              {loading ? '…' : t('forgotSubmit')}
            </button>
            <button type="button" className="link-button" onClick={() => setMode('signin')}>
              {t('backToSignIn')}
            </button>
          </>
        )}
      </form>
    );
  }

  return (
    <form className="card login" onSubmit={onSubmit}>
      <label>
        {t('email')}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
      </label>
      <label>
        {t('password')}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? tApp('signingIn') : t('signIn')}
      </button>
      <button type="button" className="link-button" onClick={() => setMode('forgot')}>
        {t('forgotPassword')}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
