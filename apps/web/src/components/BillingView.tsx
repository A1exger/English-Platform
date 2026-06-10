'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';

interface Pkg {
  id: string;
  name: string;
  lessonsCount: number;
  priceCents: number;
  currency: string;
}
interface Balance {
  balanceCents: number;
  lessonsRemaining: number;
}
interface Txn {
  id: string;
  type: string;
  amountCents: number;
  currency: string;
  status: string;
}
interface Invoice {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  status: string;
}
interface Checkout {
  transactionId: string;
  checkoutUrl: string;
}

function money(format: ReturnType<typeof useFormatter>, cents: number, currency: string) {
  return format.number(cents / 100, { style: 'currency', currency });
}

export function BillingView() {
  const t = useTranslations('billing');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', lessons: '10', price: '20000' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const profile = await fetchMe(token, locale);
      setMe(profile);
      const pkgs = await apiFetch<Pkg[]>('/billing/packages', { token, locale });
      setPackages(pkgs);
      if (profile.role === 'student') {
        const [bal, tx, inv] = await Promise.all([
          apiFetch<Balance>('/billing/balance', { token, locale }),
          apiFetch<Txn[]>('/billing/transactions', { token, locale }),
          apiFetch<Invoice[]>('/billing/invoices', { token, locale })
        ]);
        setBalance(bal);
        setTxns(tx);
        setInvoices(inv);
      }
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(packageId: string) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiFetch<Checkout>('/billing/checkout', {
        method: 'POST',
        token,
        locale,
        body: { provider: 'stripe', packageId }
      });
      setCheckout(res);
    } finally {
      setBusy(false);
    }
  }

  async function createPackage(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/billing/packages', {
        method: 'POST',
        token,
        locale,
        body: {
          name: form.name,
          lessonsCount: Number(form.lessons) || 1,
          priceCents: Number(form.price) || 0
        }
      });
      setForm({ name: '', lessons: '10', price: '20000' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error')
    return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const isTutor = me?.role === 'tutor';

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      {balance && (
        <div className="metrics">
          <div className="metric card">
            <span className="metric-value">
              {money(format, balance.balanceCents, 'EUR')}
            </span>
            <span className="metric-label">{t('balance')}</span>
          </div>
          <div className="metric card">
            <span className="metric-value">{balance.lessonsRemaining}</span>
            <span className="metric-label">{t('lessonsRemaining')}</span>
          </div>
        </div>
      )}

      {isTutor && (
        <form className="card form-grid" onSubmit={createPackage}>
          <strong>{t('newPackage')}</strong>
          <label>
            {t('name')}
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            {t('lessons')}
            <input
              type="number"
              min={1}
              value={form.lessons}
              onChange={(e) => setForm({ ...form, lessons: e.target.value })}
            />
          </label>
          <label>
            {t('price')}
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t('processing') : t('create')}
          </button>
        </form>
      )}

      <div className="card">
        <strong>{t('packages')}</strong>
        {packages.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {packages.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name} · {p.lessonsCount}
                </span>
                <span className="muted">{money(format, p.priceCents, p.currency)}</span>
                {!isTutor && (
                  <button type="button" disabled={busy} onClick={() => buy(p.id)}>
                    {t('buy')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {checkout && (
          <p className="note">
            {t('checkoutReady')}{' '}
            <a className="link" href={checkout.checkoutUrl} target="_blank" rel="noreferrer">
              {checkout.checkoutUrl}
            </a>
          </p>
        )}
      </div>

      {!isTutor && (
        <div className="two-col">
          <div className="card">
            <strong>{t('transactions')}</strong>
            {txns.length === 0 ? (
              <p className="note">{t('empty')}</p>
            ) : (
              <ul className="lesson-list">
                {txns.map((x) => (
                  <li key={x.id}>
                    <span>{x.type}</span>
                    <span className="muted">
                      {money(format, x.amountCents, x.currency)} · {x.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <strong>{t('invoices')}</strong>
            {invoices.length === 0 ? (
              <p className="note">{t('empty')}</p>
            ) : (
              <ul className="lesson-list">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <span>{i.number}</span>
                    <span className="muted">
                      {money(format, i.amountCents, i.currency)} · {i.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
