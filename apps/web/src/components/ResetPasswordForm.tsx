'use client';

import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';

// Set a new password from an emailed link. The link is single-use server-side
// (it is signed with the old password hash), so a stale one fails cleanly.
export function ResetPasswordForm() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        locale,
        body: { token, password }
      });
      setDone(true);
      setTimeout(() => router.push('/'), 1500);
    } catch {
      setError(t('resetInvalid'));
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <p className="card error">{t('resetInvalid')}</p>;
  if (done) return <p className="card">{t('resetDone')}</p>;

  return (
    <form className="card login" onSubmit={onSubmit}>
      <label>
        {t('newPassword')}
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label>
        {t('confirmPassword')}
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      {tooShort && <p className="muted">{t('passwordTooShort')}</p>}
      {mismatch && <p className="error">{t('passwordMismatch')}</p>}
      <button type="submit" disabled={busy || tooShort || mismatch || !password || !confirm}>
        {busy ? '…' : t('resetSubmit')}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
