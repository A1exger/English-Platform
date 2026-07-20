'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { useRouter } from '@/i18n/routing';
import { Skeleton } from './Skeleton';
import { DataList } from './DataList';
import { ScoreRing } from './ScoreRing';
import { Icon } from './Icon';

interface Entry {
  id: string;
  word: string;
  translation: string | null;
  repetitions: number;
  due: boolean;
  nextReviewAt: string | null;
}

// Mastery threshold: an entry reviewed this many times is counted "learned".
const LEARNED_AT = 5;

// Personal dictionary + spaced-repetition trainer (Phase 6). Words arrive from
// lesson wordlists ("add to dictionary"); the trainer drills the ones due today.
export function DictionaryView() {
  const t = useTranslations('dictionary');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [mode, setMode] = useState<'list' | 'train'>('list');
  const [queue, setQueue] = useState<Entry[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);

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
  const learnedCount = entries.filter((e) => e.repetitions >= LEARNED_AT).length;
  const learnedPct = entries.length ? Math.round((learnedCount / entries.length) * 100) : 0;

  function startTraining() {
    setQueue(entries.filter((e) => e.due));
    setIdx(0);
    setRevealed(false);
    setMode('train');
  }

  const review = useCallback(
    async (remembered: boolean) => {
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
    },
    [queue, idx, locale, load]
  );

  // Trainer keyboard shortcuts: space reveals, 1 = didn't know, 2 = knew it.
  useEffect(() => {
    if (mode !== 'train') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!revealed) setRevealed(true);
      } else if (revealed && e.key === '1') {
        e.preventDefault();
        void review(false);
      } else if (revealed && e.key === '2') {
        e.preventDefault();
        void review(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, revealed, review]);

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
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
        <p className="note dict-shortcuts">{t('shortcuts')}</p>
      </div>
    );
  }

  // Next review date when nothing is due — the "Train" button used to just sit disabled.
  const upcoming = entries
    .map((e) => e.nextReviewAt)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d))
    .filter((d) => d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <div className="content">
      <div className="row-between dict-head">
        <h2>{t('title')}</h2>
        <div className="dict-head-side">
          {entries.length > 0 && <ScoreRing value={learnedPct} label={t('learned')} size={56} stroke={4} />}
          {dueCount > 0 ? (
            <button type="button" onClick={startTraining}>{t('train')} · {dueCount}</button>
          ) : (
            <span className="muted dict-nothing">
              {t('nothingDue')}
              {upcoming ? ` · ${t('nextReview', { date: format.dateTime(upcoming, { dateStyle: 'medium' }) })}` : ''}
            </span>
          )}
        </div>
      </div>

      <DataList
        items={entries}
        getKey={(e) => e.id}
        searchText={(e) => `${e.word} ${e.translation ?? ''}`}
        listClassName="dict-list"
        rowClassName="dict-row"
        filterFn={dueOnly ? (e) => e.due : undefined}
        toolbar={
          <label className="check dict-due-filter">
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
            {t('due')}
          </label>
        }
        empty={{ title: t('empty') }}
        renderRow={(e) => (
          <>
            <span>
              <b>{e.word}</b>
              {e.translation ? <span className="muted"> — {e.translation}</span> : null}
            </span>
            <span className="dict-meta">
              {e.due ? <span className="chip status-in_progress">{t('due')}</span> : null}
              <span className="muted mono-num dict-reps" title={t('repsHint')}>
                <Icon name="star" size={12} /> {e.repetitions}
              </span>
            </span>
          </>
        )}
      />
    </div>
  );
}
