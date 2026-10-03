'use client';

import { FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore, Tokens } from '@/lib/auth';

// 0 = none … 4 = strong. Length gate + character-class variety.
function pwStrength(p: string): number {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

export function RegisterForm() {
  const t = useTranslations('register');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  // Public sign-up is for students only; tutors/admins are provisioned by an
  // admin.
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [accepted, setAccepted] = useState(false);
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
        body: { ...form, role: 'student', locale }
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

      {form.password.length > 0 &&
        (() => {
          const s = pwStrength(form.password);
          const label = s <= 1 ? t('strengthWeak') : s === 2 ? t('strengthFair') : s === 3 ? t('strengthGood') : t('strengthStrong');
          const tier = s <= 1 ? 'low' : s <= 2 ? 'mid' : 'high';
          return (
            <div className="pw-strength">
              <div className="pw-bars" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`pw-bar${i < s ? ` on tier-${tier}` : ''}`} />
                ))}
              </div>
              <span className={`pw-label tier-${tier}`}>
                {t('passwordStrength')}: {label}
              </span>
            </div>
          );
        })()}

      <label className="check">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        {t('terms')}
      </label>

      <button type="submit" disabled={loading || !accepted}>
        {loading ? t('creating') : t('submit')}
      </button>
      {error && <p className="error">{error}</p>}
      <p className="note">{t('tutorNote')}</p>
      <Link className="link" href="/">
        {t('haveAccount')} {tc('signIn')}
      </Link>
    </form>
  );
}
