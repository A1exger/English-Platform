'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { ExerciseRenderer, Question } from './ExerciseRenderer';

interface ExerciseRow {
  id: string;
  type: string;
  title: string;
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

const TYPES = ['order', 'match', 'fill', 'categorize'] as const;

function parseFill(text: string) {
  const segments: ({ text: string } | { blank: number })[] = [];
  const answers: string[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ blank: answers.length });
    answers.push(m[1].trim());
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return { segments, answers };
}

function parsePairs(text: string) {
  return text
    .split('\n')
    .map((l) => l.split('='))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ left: p[0].trim(), right: p[1].trim() }));
}

function parseItems(text: string) {
  return text
    .split('\n')
    .map((l) => l.split('='))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ text: p[0].trim(), category: p[1].trim() }));
}

export function ExercisesView() {
  const t = useTranslations('exercises');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [list, setList] = useState<ExerciseRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [state, setStateName] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({});

  const [type, setType] = useState<(typeof TYPES)[number]>('order');
  const [title, setTitle] = useState('');
  const [words, setWords] = useState('I go to school');
  const [prompt, setPrompt] = useState('');
  const [pairs, setPairs] = useState('dog = chien\ncat = chat');
  const [fillText, setFillText] = useState('I [go] to [school].');
  const [categories, setCategories] = useState('noun, verb');
  const [items, setItems] = useState('run = verb\nbook = noun');

  // Assign panel
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [due, setDue] = useState('');

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      setList(await apiFetch<ExerciseRow[]>('/exercises', { token, locale }));
      setStudents(await apiFetch<StudentRow[]>('/crm/students', { token, locale }).catch(() => []));
      setStateName('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setStateName('error');
    }
  }, [locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const payload = useMemo(() => {
    if (type === 'order') return { words: words.trim().split(/\s+/).filter(Boolean), prompt: prompt || undefined };
    if (type === 'match') return { pairs: parsePairs(pairs) };
    if (type === 'fill') return { text: fillText };
    return { categories: categories.split(',').map((c) => c.trim()).filter(Boolean), items: parseItems(items) };
  }, [type, words, prompt, pairs, fillText, categories, items]);

  const question = useMemo<Question>(() => {
    if (type === 'order')
      return { type, title: title || t('order'), prompt, tokens: (payload as { words: string[] }).words };
    if (type === 'match') {
      const p = (payload as { pairs: { left: string; right: string }[] }).pairs;
      return { type, title: title || t('match'), lefts: p.map((x) => x.left), rights: p.map((x) => x.right) };
    }
    if (type === 'fill') {
      const { segments, answers } = parseFill(fillText);
      return { type, title: title || t('fill'), segments, blanks: answers.length, bank: answers };
    }
    const cat = (payload as { categories: string[]; items: { text: string }[] });
    return { type, title: title || t('categorize'), categories: cat.categories, items: cat.items.map((i) => i.text) };
  }, [type, title, payload, fillText, prompt, t]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/exercises', {
        method: 'POST',
        token,
        locale,
        body: { type, title: title || t(type), payload }
      });
      setTitle('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, method: 'POST' | 'DELETE') {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(path, { method, token, locale });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function assign(exerciseId: string) {
    const token = tokenStore.get();
    if (!token) return;
    const studentProfileIds = Object.entries(picked).filter(([, v]) => v).map(([k]) => k);
    if (studentProfileIds.length === 0) return;
    setBusy(true);
    try {
      await apiFetch('/homework/assign', {
        method: 'POST',
        token,
        locale,
        body: { studentProfileIds, exerciseIds: [exerciseId], dueAt: due || undefined }
      });
      setAssignFor(null);
      setPicked({});
      setDue('');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      <div className="two-col">
        <form className="card ex-form" onSubmit={create}>
          <strong>{t('create')}</strong>
          <label>
            {t('type')}
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>{t(ty)}</option>
              ))}
            </select>
          </label>
          <label>
            {t('title')}
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          {type === 'order' && (
            <>
              <label>{t('words')}<input value={words} onChange={(e) => setWords(e.target.value)} /></label>
              <small className="muted">{t('wordsHint')}</small>
              <label>{t('prompt')}<input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
            </>
          )}
          {type === 'match' && (
            <>
              <label>{t('pairs')}<textarea value={pairs} onChange={(e) => setPairs(e.target.value)} /></label>
              <small className="muted">{t('pairsHint')}</small>
            </>
          )}
          {type === 'fill' && (
            <>
              <label>{t('fillText')}<textarea value={fillText} onChange={(e) => setFillText(e.target.value)} /></label>
              <small className="muted">{t('fillHint')}</small>
            </>
          )}
          {type === 'categorize' && (
            <>
              <label>{t('categories')}<input value={categories} onChange={(e) => setCategories(e.target.value)} /></label>
              <small className="muted">{t('categoriesHint')}</small>
              <label>{t('items')}<textarea value={items} onChange={(e) => setItems(e.target.value)} /></label>
              <small className="muted">{t('itemsHint')}</small>
            </>
          )}
          <button type="submit" disabled={busy}>{busy ? t('creating') : t('save')}</button>
        </form>

        <div className="card">
          <strong>{t('preview')}</strong>
          <ExerciseRenderer question={question} state={preview} onChange={setPreview} />
        </div>
      </div>

      <div className="card">
        <strong>{t('library')}</strong>
        {list.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {list.map((ex) => (
              <li key={ex.id} className="stacked">
                <div className="row-between">
                  <span>{ex.title} <span className="muted">· {t(ex.type)}</span></span>
                  <span className="row-actions">
                    <button type="button" onClick={() => act(`/exercises/${ex.id}/duplicate`, 'POST')}>{t('duplicate')}</button>
                    <button type="button" onClick={() => setAssignFor(assignFor === ex.id ? null : ex.id)}>{t('assign')}</button>
                    <button type="button" onClick={() => act(`/exercises/${ex.id}`, 'DELETE')}>{t('delete')}</button>
                  </span>
                </div>
                {assignFor === ex.id && (
                  <div className="inline-form" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <span className="muted">{t('chooseStudents')}</span>
                    {students.map((s) => (
                      <label key={s.studentProfileId} className="check">
                        <input
                          type="checkbox"
                          checked={!!picked[s.studentProfileId]}
                          onChange={(e) => setPicked({ ...picked, [s.studentProfileId]: e.target.checked })}
                        />
                        {s.name}
                      </label>
                    ))}
                    <label>{t('due')}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
                    <button type="button" disabled={busy} onClick={() => assign(ex.id)}>{t('assignBtn')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
