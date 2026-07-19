'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { ExerciseRenderer, ExerciseState, Question } from './ExerciseRenderer';
import { TaskRenderer } from './tasks/TaskRenderer';
import type { SentenceDef, SentenceState } from './tasks/types';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';
import { PageHeader } from './PageHeader';
import { Icon } from './Icon';

interface ExerciseRow {
  id: string;
  type: string;
  title: string;
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

// Legacy authoring types (graded by exercise.logic) and the canonical
// interactive types (SPEC §4, dnd-kit renderer). Stage 2 ships the first
// canonical constructor — sentence_ordering; the rest arrive in Stage 4.
const TYPES = ['order', 'match', 'fill', 'categorize'] as const;
const CANONICAL_TYPES = ['sentence_ordering'] as const;
const ALL_TYPES = [...TYPES, ...CANONICAL_TYPES] as const;
const ASPECTS = ['Grammar', 'Reading', 'Listening', 'Vocabulary', 'Speaking', 'Writing'] as const;

const isCanonical = (ty: string): boolean => (CANONICAL_TYPES as readonly string[]).includes(ty);

/** Shuffled [0..n-1] so the preview shows the student's scrambled order. */
function shuffledIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

// Build a renderable question from a stored payload (for viewing/preview).
function buildQuestion(type: string, title: string, payload: Record<string, unknown>): Question {
  if (type === 'match') {
    const pairs = (payload.pairs as { left: string; right: string }[]) ?? [];
    return { type: 'match', title, lefts: pairs.map((p) => p.left), rights: pairs.map((p) => p.right) };
  }
  if (type === 'fill') {
    const { segments, answers } = parseFill(String(payload.text ?? ''));
    return { type: 'fill', title, segments, blanks: answers.length, bank: answers };
  }
  if (type === 'categorize') {
    const items = (payload.items as { text: string }[]) ?? [];
    return { type: 'categorize', title, categories: (payload.categories as string[]) ?? [], items: items.map((i) => i.text) };
  }
  return { type: 'order', title, prompt: payload.prompt as string, tokens: (payload.words as string[]) ?? [] };
}

function parseItems(text: string) {
  return text
    .split('\n')
    .map((l) => l.split('='))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ text: p[0].trim(), category: p[1].trim() }));
}

// What a preview modal shows: a legacy question, or a canonical task.
type Viewing =
  | { kind: 'legacy'; q: Question; state: ExerciseState }
  | { kind: 'canonical'; type: string; title: string; def: SentenceDef; state: SentenceState };

export function ExercisesView() {
  const t = useTranslations('exercises');
  const tApp = useTranslations('app');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { showUndo } = useToast();

  const [list, setList] = useState<ExerciseRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [state, setStateName] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | (typeof ALL_TYPES)[number]>('all');

  const [type, setType] = useState<string>('order');
  const [title, setTitle] = useState('');
  const [words, setWords] = useState('I go to school');
  const [prompt, setPrompt] = useState('');
  const [pairs, setPairs] = useState('dog = chien\ncat = chat');
  const [fillText, setFillText] = useState('I [go] to [school].');
  const [categories, setCategories] = useState('noun, verb');
  const [items, setItems] = useState('run = verb\nbook = noun');

  // Canonical sentence_ordering constructor state.
  const [sentence, setSentence] = useState('I have never been to London');
  const [aspect, setAspect] = useState<string>('Grammar');
  const [isPublic, setIsPublic] = useState(false);
  const [sentencePreview, setSentencePreview] = useState<SentenceState>({ order: [] });

  // Assign panel
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [due, setDue] = useState('');
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      setList(await apiFetch<ExerciseRow[]>('/exercises', { token, locale }));
      setStudents(await apiFetch<StudentRow[]>('/crm/students/all', { token, locale }).catch(() => []));
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

  const canonicalTokens = useMemo(() => sentence.trim().split(/\s+/).filter(Boolean), [sentence]);
  const canonicalDef = useMemo<SentenceDef>(() => ({ tokens: canonicalTokens }), [canonicalTokens]);
  const canonicalValid = canonicalTokens.length >= 2; // ФТ-У105

  // Reshuffle the preview whenever the sentence text changes.
  useEffect(() => {
    setSentencePreview({ order: shuffledIndices(canonicalTokens.length) });
  }, [sentence]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useMemo(() => {
    if (isCanonical(type)) return {};
    if (type === 'order') return { words: words.trim().split(/\s+/).filter(Boolean), prompt: prompt || undefined };
    if (type === 'match') return { pairs: parsePairs(pairs) };
    if (type === 'fill') return { text: fillText };
    return { categories: categories.split(',').map((c) => c.trim()).filter(Boolean), items: parseItems(items) };
  }, [type, words, prompt, pairs, fillText, categories, items]);

  const question = useMemo<Question>(() => {
    if (isCanonical(type)) return { type: 'order', title: '', tokens: [] } as Question;
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
    return { type: 'categorize', title: title || t('categorize'), categories: cat.categories, items: cat.items.map((i) => i.text) };
  }, [type, title, payload, fillText, prompt, t]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;

    if (isCanonical(type)) {
      if (!canonicalValid) return; // ФТ-У105 blocks the save
      setBusy(true);
      try {
        const body = {
          title: title || t(type),
          prompt: prompt || undefined,
          aspect,
          isPublic,
          payload: { tokens: canonicalTokens }
        };
        if (editingId) {
          await apiFetch(`/exercises/${editingId}`, { method: 'PATCH', token, locale, body });
          setEditingId(null);
        } else {
          await apiFetch('/exercises', { method: 'POST', token, locale, body: { type, ...body } });
        }
        setTitle('');
        await load();
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      if (editingId) {
        await apiFetch(`/exercises/${editingId}`, {
          method: 'PATCH',
          token,
          locale,
          body: { title: title || t(type), payload }
        });
        setEditingId(null);
      } else {
        await apiFetch('/exercises', {
          method: 'POST',
          token,
          locale,
          body: { type, title: title || t(type), payload }
        });
      }
      setTitle('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Load a saved exercise into the form for editing.
  async function edit(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    const ex = await apiFetch<{
      type: string;
      title: string;
      prompt?: string | null;
      aspect?: string | null;
      isPublic?: boolean;
      payload: Record<string, unknown>;
    }>(`/exercises/${id}`, { token, locale });
    setType(ex.type);
    setTitle(ex.title);
    if (isCanonical(ex.type)) {
      setSentence(((ex.payload.tokens as string[]) ?? []).join(' '));
      setPrompt(ex.prompt ?? '');
      setAspect(ex.aspect ?? 'Grammar');
      setIsPublic(!!ex.isPublic);
    } else {
      const p = ex.payload;
      if (ex.type === 'order') {
        setWords(((p.words as string[]) ?? []).join(' '));
        setPrompt((p.prompt as string) ?? '');
      } else if (ex.type === 'match') {
        setPairs(((p.pairs as { left: string; right: string }[]) ?? []).map((x) => `${x.left} = ${x.right}`).join('\n'));
      } else if (ex.type === 'fill') {
        setFillText((p.text as string) ?? '');
      } else if (ex.type === 'categorize') {
        setCategories(((p.categories as string[]) ?? []).join(', '));
        setItems(((p.items as { text: string; category: string }[]) ?? []).map((x) => `${x.text} = ${x.category}`).join('\n'));
      }
    }
    setEditingId(id);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle('');
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

  // Optimistic + undoable delete (global rule: no deletion without showUndo).
  function removeExercise(id: string) {
    setList((prev) => prev.filter((x) => x.id !== id));
    if (assignFor === id) setAssignFor(null);
    if (editingId === id) cancelEdit();
    showUndo(t('deleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const token = tokenStore.get();
        if (!token) return;
        await apiFetch(`/exercises/${id}`, { method: 'DELETE', token, locale }).catch(() => undefined);
        await load();
      }
    });
  }

  async function openAssign(id: string) {
    if (assignFor === id) {
      setAssignFor(null);
      return;
    }
    const token = tokenStore.get();
    if (token) {
      // Refresh the student list so newly added students appear.
      setStudents(await apiFetch<StudentRow[]>('/crm/students/all', { token, locale }).catch(() => []));
    }
    setPicked({});
    setAssignFor(id);
  }

  async function view(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    const ex = await apiFetch<{ type: string; title: string; payload: Record<string, unknown> }>(
      `/exercises/${id}`,
      { token, locale }
    );
    if (isCanonical(ex.type)) {
      const tokens = (ex.payload.tokens as string[]) ?? [];
      setViewing({
        kind: 'canonical',
        type: ex.type,
        title: ex.title,
        def: { tokens },
        state: { order: shuffledIndices(tokens.length) }
      });
    } else {
      setViewing({ kind: 'legacy', q: buildQuestion(ex.type, ex.title, ex.payload), state: {} });
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

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const filtered = list.filter(
    (ex) =>
      (typeFilter === 'all' || ex.type === typeFilter) &&
      ex.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="content">
      <PageHeader title={t('title')} />

      <div className="two-col">
        <form className="card ex-form" onSubmit={create}>
          <strong>{editingId ? t('edit') : t('create')}</strong>
          <div className="field">
            <span>{t('type')}</span>
            <div className="tabs tabs-inline" role="tablist" aria-label={t('type')}>
              {ALL_TYPES.map((ty) => (
                <button
                  key={ty}
                  type="button"
                  role="tab"
                  aria-selected={type === ty}
                  className={type === ty ? 'active' : ''}
                  disabled={!!editingId && type !== ty}
                  onClick={() => setType(ty)}
                >
                  {t(ty)}
                </button>
              ))}
            </div>
          </div>
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
          {type === 'sentence_ordering' && (
            <>
              <label>{t('sentence')}<input value={sentence} onChange={(e) => setSentence(e.target.value)} /></label>
              <small className="muted">{t('sentenceHint')}</small>
              {!canonicalValid && <small className="error">{t('sentenceMin')}</small>}
              <label>{t('prompt')}<input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
              <label>
                {t('aspect')}
                <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {ASPECTS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                {t('public')}
              </label>
            </>
          )}
          <div className="row-actions">
            <button type="submit" disabled={busy || (isCanonical(type) && !canonicalValid)}>
              {busy ? t('creating') : t('save')}
            </button>
            {editingId && (
              <button type="button" className="ghost" aria-label={tc('close')} onClick={cancelEdit}><Icon name="close" /></button>
            )}
          </div>
        </form>

        <div className="card">
          <strong>{t('preview')}</strong>
          {isCanonical(type) ? (
            <TaskRenderer
              type="sentence_ordering"
              def={canonicalDef}
              state={sentencePreview}
              onChange={(s) => setSentencePreview(s as SentenceState)}
            />
          ) : (
            <ExerciseRenderer question={question} state={preview} onChange={setPreview} />
          )}
        </div>
      </div>

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row-between">
              <strong>{viewing.kind === 'canonical' ? viewing.title : viewing.q.title}</strong>
              <button type="button" className="ghost" aria-label={tc('close')} onClick={() => setViewing(null)}><Icon name="close" /></button>
            </div>
            {viewing.kind === 'canonical' ? (
              <TaskRenderer
                type="sentence_ordering"
                def={viewing.def}
                state={viewing.state}
                onChange={(s) => setViewing({ ...viewing, state: s as SentenceState })}
              />
            ) : (
              <ExerciseRenderer
                question={viewing.q}
                state={viewing.state}
                onChange={(s) => setViewing({ kind: 'legacy', q: viewing.q, state: s })}
              />
            )}
          </div>
        </div>
      )}

      <div className="card">
        <strong>{t('library')}</strong>
        <div className="page-header-tools">
          <input
            type="search"
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tc('search')}
            aria-label={tc('search')}
          />
          <div className="tabs tabs-inline filter-chips" role="tablist" aria-label={t('type')}>
            <button
              type="button"
              role="tab"
              aria-selected={typeFilter === 'all'}
              className={typeFilter === 'all' ? 'active' : ''}
              onClick={() => setTypeFilter('all')}
            >
              {t('allTypes')}
            </button>
            {ALL_TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                role="tab"
                aria-selected={typeFilter === ty}
                className={typeFilter === ty ? 'active' : ''}
                onClick={() => setTypeFilter(ty)}
              >
                {t(ty)}
              </button>
            ))}
          </div>
        </div>
        {list.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : filtered.length === 0 ? (
          <p className="note">{tc('noResults')}</p>
        ) : (
          <ul className="lesson-list">
            {filtered.map((ex) => (
              <li key={ex.id} className="stacked">
                <div className="row-between">
                  <span>{ex.title} <span className="muted">· {t(ex.type)}</span></span>
                  <span className="row-actions">
                    <button type="button" onClick={() => view(ex.id)}>{t('view')}</button>
                    <button type="button" onClick={() => edit(ex.id)}>{t('edit')}</button>
                    <button type="button" onClick={() => act(`/exercises/${ex.id}/duplicate`, 'POST')}>{t('duplicate')}</button>
                    {!isCanonical(ex.type) && (
                      <button type="button" onClick={() => openAssign(ex.id)}>{t('assign')}</button>
                    )}
                    <button type="button" onClick={() => removeExercise(ex.id)}>{t('delete')}</button>
                  </span>
                </div>
                {assignFor === ex.id && (
                  <div className="inline-form inline-form-col">
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
