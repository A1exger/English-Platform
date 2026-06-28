'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch, apiUpload, fileUrl } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';

interface Material {
  id: string;
  type: string;
  title: string;
  url?: string | null;
  language?: string | null;
}

const TYPES = ['pdf', 'video', 'audio', 'image', 'exercise', 'link'];

export function MaterialsView() {
  const t = useTranslations('materials');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Material[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: 'pdf', title: '', url: '', language: '' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const [profile, list] = await Promise.all([
        fetchMe(token, locale),
        apiFetch<Material[]>('/materials', { token, locale })
      ]);
      setMe(profile);
      setItems(list);
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

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/materials', {
        method: 'POST',
        token,
        locale,
        body: {
          type: form.type,
          title: form.title,
          url: form.url || undefined,
          language: form.language || undefined
        }
      });
      setForm({ type: 'pdf', title: '', url: '', language: '' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const token = tokenStore.get();
    if (!file || !token) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      await apiUpload('/materials/upload', fd, { token, locale });
      await load();
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function remove(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/${id}`, { method: 'DELETE', token, locale });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const canManage = me?.role === 'tutor' || me?.role === 'admin';

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      {canManage && (
        <div className="card upload-row">
          <strong>{t('uploadFile')}</strong>
          <input type="file" disabled={busy} onChange={upload} />
        </div>
      )}

      {canManage && (
        <form className="card form-grid" onSubmit={create}>
          <strong>{t('add')}</strong>
          <label>
            {t('type')}
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {ty}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('titleField')}
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {t('url')}
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </label>
          <label>
            {t('language')}
            <input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="en" />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t('creating') : t('create')}
          </button>
        </form>
      )}

      <div className="card">
        {items.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {items.map((m) => (
              <li key={m.id}>
                <span>
                  {m.url ? (
                    <a className="link" href={fileUrl(m.url)} target="_blank" rel="noreferrer">
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}
                </span>
                <span className="muted">
                  {m.type}
                  {m.language ? ` · ${m.language}` : ''}
                </span>
                {canManage && (
                  <button type="button" disabled={busy} onClick={() => remove(m.id)}>
                    {t('delete')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
