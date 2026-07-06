'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { useRouter } from '@/i18n/routing';

interface Entry {
  id: string;
  word: string;
  translation: string | null;
  repetitions: number;
  due: boolean;
  nextReviewAt: string | null;
}

// Personal dictionary + spaced-repetition trainer (Phase 6). Words arrive from
// lesson wordlists ("add to dictionary"); the trainer drills the ones due today.
export function DictionaryView() {
  const t = useTranslations('dictionary');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [mode, setMode] = useState<'list' | 'train'>('list');
  const [queue, setQueue] = useState<Entry[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      setEntries(await apiFetch<Entry[]>('/content/dictionary', { token, locale }));
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

  const dueCount = entries.filter((e) => e.due).length;

  function startTraining() {
    setQueue(entries.filter((e) => e.due));
    setIdx(0);
    setRevealed(false);
    setMode('train');
  }

  async function review(remembered: boolean) {
    const token = tokenStore.get();
    const card = queue[idx];
    if (!token || !card) return;
    await apiFetch(`/content/dictionary/${card.id}/review`, {
      method: 'POST',
      token,
      locale,
      body: { remembered }
    }).catch(() => undefined);
    if (idx + 1 >= queue.length) {
      await load();
      setMode('list');
    } else {
      setIdx(idx + 1);
      setRevealed(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  if (mode === 'train') {
    const card = queue[idx];
    return (
      <div className="content dict-train">
        <div className="row-between">
          <button type="button" className="ghost" onClick={() => setMode('list')}>
            ← {t('back')}
          </button>
          <span className="muted mono-num">
            {idx + 1} / {queue.length}
          </span>
        </div>
        {card && (
          <div className="card flashcard">
            <span className="flash-word">{card.word}</span>
            {revealed ? (
              <>
                <span className="flash-translation">{card.translation || '—'}</span>
                <div className="flash-actions">
                  <button type="button" className="ghost" onClick={() => review(false)}>
                    {t('forgot')}
                  </button>
                  <button type="button" onClick={() => review(true)}>
                    {t('remembered')}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setRevealed(true)}>
                {t('reveal')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="content">
      <div className="row-between">
        <h2>{t('title')}</h2>
        <button type="button" onClick={startTraining} disabled={dueCount === 0}>
          {t('train')} {dueCount > 0 ? `· ${dueCount}` : ''}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="note">{t('empty')}</p>
      ) : (
        <ul className="dict-list">
          {entries.map((e) => (
            <li key={e.id} className="dict-row">
              <span>
                <b>{e.word}</b>
                {e.translation ? <span className="muted"> — {e.translation}</span> : null}
              </span>
              <span className="dict-meta">
                {e.due ? <span className="chip status-in_progress">{t('due')}</span> : null}
                <span className="muted mono-num">★ {e.repetitions}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
