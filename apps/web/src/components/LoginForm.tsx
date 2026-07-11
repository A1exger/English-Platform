'use client';

import { FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { login, tokenStore } from '@/lib/auth';

export function LoginForm() {
  const t = useTranslations('common');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {error && <p className="error">{error}</p>}
    </form>
  );
}
