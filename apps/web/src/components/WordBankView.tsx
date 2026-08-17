'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';
import { Icon } from './Icon';

interface BankEntry {
  id: string;
  word: string;
  /** English definition — what the word MEANS, shown first. */
  definition: string | null;
  /** Gloss in the reader's own language, revealed on request. */
  translation: string | null;
  example: string | null;
  topic: string | null;
  source: string;
}

/**
 * The shared word bank: one pool a tutor curates, that every student copies from
 * into their own dictionary. Same screen for both roles — a tutor sees import
 * and delete, a student sees "add to my dictionary".
 */
export function WordBankView() {
  const t = useTranslations('dictionary');
  const tApp = useTranslations('app');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const [rows, setRows] = useState<BankEntry[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  // Which rows have had their translation revealed. Meeting the English first
  // and choosing to check the translation is the point — showing both at once
  // makes the English decorative.
  const [shown, setShown] = useState<Record<string, boolean>>({});

  // Import drawer
  const [importOpen, setImportOpen] = useState(false);
  const [text, setText] = useState('');
  const [importTopic, setImportTopic] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Free-dictionary lookup
  const [lookupWord, setLookupWord] = useState('');
  const [lookup, setLookup] = useState<{
    definition: string | null;
    example: string | null;
    phonetic: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setIsStaff(me.role === 'tutor' || me.role === 'admin');
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (topic) params.set('topic', topic);
      const suffix = params.toString() ? `?${params}` : '';
      setRows(await apiFetch<BankEntry[]>(`/content/word-bank${suffix}`, { token, locale }));
      setTopics(await apiFetch<string[]>('/content/word-bank/topics', { token, locale }).catch(() => []));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [locale, router, q, topic]);

  useEffect(() => {
    void load();
  }, [load]);

  async function seed() {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/content/word-bank/seed', { method: 'POST', token, locale });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    const token = tokenStore.get();
    if (!token || !text.trim()) return;
    setBusy(true);
    setImportMsg(null);
    try {
      const r = await apiFetch<{ imported: number }>('/content/word-bank/import', {
        method: 'POST',
        token,
        locale,
        body: { text, topic: importTopic.trim() || undefined }
      });
      setImportMsg(t('imported', { count: r.imported }));
      setText('');
      await load();
    } catch {
      setImportMsg(tApp('loadError'));
    } finally {
      setBusy(false);
    }
  }

  async function doLookup() {
    const token = tokenStore.get();
    if (!token || !lookupWord.trim()) return;
    setBusy(true);
    try {
      setLookup(
        await apiFetch(`/content/word-bank/lookup?word=${encodeURIComponent(lookupWord.trim())}`, {
          token,
          locale
        })
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    await apiFetch(`/content/word-bank/${id}`, { method: 'DELETE', token, locale }).catch(
      () => undefined
    );
  }

  async function addToMine(entry: BankEntry) {
    const token = tokenStore.get();
    if (!token) return;
    // Optimistic tick: adding is idempotent server-side (upsert on the word), so
    // a double click cannot create a duplicate.
    setAdded((prev) => ({ ...prev, [entry.id]: true }));
    await apiFetch(`/content/word-bank/${entry.id}/add`, { method: 'POST', token, locale }).catch(
      () => setAdded((prev) => ({ ...prev, [entry.id]: false }))
    );
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <PageHeader
        title={t('bankTitle')}
        primary={isStaff ? { label: t('import'), onClick: () => setImportOpen(true) } : undefined}
      />
      <p className="muted">{isStaff ? t('bankHintStaff') : t('bankHintStudent')}</p>

      {/* One-click starter pack, so the bank is useful before anyone types a
          word. Only offered while it is empty — after that, import is the way. */}
      {isStaff && rows.length === 0 && !q && !topic && (
        <button type="button" disabled={busy} onClick={() => void seed()}>
          {t('loadStarter')}
        </button>
      )}

      <div className="inline-form">
        <input
          placeholder={tc('search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">{t('allTopics')}</option>
          {topics.map((tp) => (
            <option key={tp} value={tp}>{tp}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="note">{t('bankEmpty')}</p>
      ) : (
        <ul className="assign-list">
          {rows.map((r) => (
            <li key={r.id} className="assign-row catalog-row">
              <span className="assign-row-main">
                <strong>{r.word}</strong>
                {r.definition && <span className="muted">{r.definition}</span>}
                {r.example && <span className="muted ex-hint">{r.example}</span>}
                {r.translation &&
                  (shown[r.id] ? (
                    <span className="bank-translation">{r.translation}</span>
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setShown((p) => ({ ...p, [r.id]: true }))}
                    >
                      {t('showTranslation')}
                    </button>
                  ))}
              </span>
              <span className="row-actions">
                {r.topic && <span className="chip">{r.topic}</span>}
                {isStaff ? (
                  <button type="button" className="tree-del ghost" aria-label={tc('delete')} onClick={() => void remove(r.id)}>
                    <Icon name="close" />
                  </button>
                ) : added[r.id] ? (
                  <span className="ex-ok">
                    <Icon name="check" /> {t('addedToMine')}
                  </span>
                ) : (
                  <button type="button" onClick={() => void addToMine(r)}>
                    {t('addToMine')}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={importOpen} onClose={() => setImportOpen(false)} title={t('import')}>
        <div className="assign-form">
          <label>
            {t('topic')}
            <input
              value={importTopic}
              placeholder={t('topicHint')}
              onChange={(e) => setImportTopic(e.target.value)}
            />
          </label>
          <label>
            {t('importWords')}
            <textarea
              rows={10}
              value={text}
              placeholder={'business = бизнес\ndeadline = срок\nnegotiate'}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <small className="muted">{t('importHint')}</small>
          {importMsg && <p className="ex-ok">{importMsg}</p>}
          <button type="button" disabled={busy || !text.trim()} onClick={() => void runImport()}>
            {t('import')}
          </button>

          {/* Free Dictionary API: no key, no quota, English definitions only —
              a way to check a word's meaning and example while curating. */}
          <hr />
          <label>
            {t('lookup')}
            <input
              value={lookupWord}
              onChange={(e) => setLookupWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void doLookup()}
            />
          </label>
          <button type="button" className="ghost" disabled={busy || !lookupWord.trim()} onClick={() => void doLookup()}>
            {t('lookupBtn')}
          </button>
          {lookup && (
            <div className="card">
              {lookup.phonetic && <p className="mono-num">{lookup.phonetic}</p>}
              <p>{lookup.definition ?? t('lookupNothing')}</p>
              {lookup.example && <p className="muted">“{lookup.example}”</p>}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
