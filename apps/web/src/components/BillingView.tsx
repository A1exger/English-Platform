'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';

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
interface Transfer {
  transactionId: string;
  method: 'westernunion' | 'moneygram';
  reference: string;
  instructions: string;
  amountCents: number;
  currency: string;
}
interface PendingTransfer {
  id: string;
  provider: string;
  amountCents: number;
  currency: string;
  externalId?: string | null;
  metadata?: string | null;
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
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [mtcn, setMtcn] = useState('');
  const [mtcnSent, setMtcnSent] = useState(false);
  const [pending, setPending] = useState<PendingTransfer[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', lessons: '10', price: '200', currency: 'EUR' });

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
      if (profile.role === 'admin') {
        setPending(
          await apiFetch<PendingTransfer[]>('/billing/transfers/pending', { token, locale })
        );
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

  async function startTransfer(method: 'westernunion' | 'moneygram', packageId: string) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    setMtcn('');
    setMtcnSent(false);
    try {
      const res = await apiFetch<Transfer>('/billing/transfer', {
        method: 'POST',
        token,
        locale,
        body: { method, packageId }
      });
      setTransfer(res);
    } finally {
      setBusy(false);
    }
  }

  async function submitMtcn() {
    const token = tokenStore.get();
    if (!token || !transfer || !mtcn.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/billing/transfer/${transfer.transactionId}/reference`, {
        method: 'POST',
        token,
        locale,
        body: { reference: mtcn }
      });
      setMtcnSent(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmTransfer(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/billing/transfer/${id}/confirm`, { method: 'POST', token, locale });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deletePackage(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/billing/packages/${id}`, { method: 'DELETE', token, locale });
      await load();
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
          // Price is entered in major units (e.g. 200 EUR) -> store as cents.
          priceCents: Math.round((Number(form.price) || 0) * 100),
          currency: form.currency
        }
      });
      setForm({ name: '', lessons: '10', price: '200', currency: 'EUR' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error')
    return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const isTutor = me?.role === 'tutor';
  const isStudent = me?.role === 'student';
  const isAdmin = me?.role === 'admin';

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

      {(isTutor || isAdmin) && (
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
          <label>
            {t('currency')}
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="EUR">EUR €</option>
              <option value="USD">USD $</option>
              <option value="TND">TND (DT)</option>
            </select>
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
                {isStudent && (
                  <span className="row-actions">
                    <button type="button" disabled={busy} onClick={() => buy(p.id)}>
                      {t('buy')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startTransfer('westernunion', p.id)}
                    >
                      {t('westernUnion')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startTransfer('moneygram', p.id)}
                    >
                      {t('moneyGram')}
                    </button>
                  </span>
                )}
                {(isTutor || isAdmin) && (
                  <button type="button" disabled={busy} onClick={() => deletePackage(p.id)}>
                    {t('delete')}
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

      {transfer && (
        <div className="card">
          <strong>
            {transfer.method === 'westernunion' ? t('westernUnion') : t('moneyGram')} ·{' '}
            {money(format, transfer.amountCents, transfer.currency)}
          </strong>
          <p className="note">{transfer.instructions}</p>
          <p className="muted">
            {t('reference')}: <b>{transfer.reference}</b>
          </p>
          {mtcnSent ? (
            <p className="note">{t('transferSent')}</p>
          ) : (
            <div className="inline-form">
              <input
                placeholder={t('mtcn')}
                value={mtcn}
                onChange={(e) => setMtcn(e.target.value)}
              />
              <button type="button" disabled={busy} onClick={submitMtcn}>
                {t('submitReference')}
              </button>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <strong>{t('pendingTransfers')}</strong>
          {pending.length === 0 ? (
            <p className="note">{t('empty')}</p>
          ) : (
            <ul className="lesson-list">
              {pending.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.provider === 'westernunion' ? t('westernUnion') : t('moneyGram')} ·{' '}
                    {p.externalId}
                  </span>
                  <span className="muted">{money(format, p.amountCents, p.currency)}</span>
                  <button type="button" disabled={busy} onClick={() => confirmTransfer(p.id)}>
                    {t('confirm')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isStudent && (
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
