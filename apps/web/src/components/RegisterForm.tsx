'use client';

import { FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore, Tokens } from '@/lib/auth';

export function RegisterForm() {
  const t = useTranslations('register');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({
    role: 'student',
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tokens = await apiFetch<Tokens>('/auth/register', {
        method: 'POST',
        locale,
        body: { ...form, locale }
      });
      tokenStore.set(tokens);
      router.push('/dashboard');
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card login" onSubmit={onSubmit}>
      <label>
        {t('role')}
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="student">{t('roleStudent')}</option>
          <option value="tutor">{t('roleTutor')}</option>
        </select>
      </label>
      <label>
        {t('firstName')}
        <input
          required
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
        />
      </label>
      <label>
        {t('lastName')}
        <input
          required
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
      </label>
      <label>
        {tc('email')}
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </label>
      <label>
        {tc('password')}
        <input
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? t('creating') : t('submit')}
      </button>
      {error && <p className="error">{error}</p>}
      <Link className="link" href="/">
        {t('haveAccount')} {tc('signIn')}
      </Link>
    </form>
  );
}
