'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';

const LEVELS = [
  'Beginner',
  'Elementary',
  'PreIntermediate',
  'Intermediate',
  'UpperIntermediate',
  'Advanced'
];
const PAGE_TYPES = ['grammar', 'practice', 'listening', 'reading', 'discussion', 'essay'];
const TASK_TYPES = [
  'sentence_ordering',
  'word_matching',
  'gap_fill',
  'categorization',
  'multiple_choice',
  'audio',
  'essay',
  'discussion'
];
const GRADING = ['AUTO', 'MANUAL', 'COMPLETION'];
const ASPECTS = ['Grammar', 'Reading', 'Listening', 'Vocabulary', 'Speaking', 'Writing'];

interface LessonRow {
  id: string;
  title: string;
  optional: boolean;
  order: number;
}
interface UnitRow {
  id: string;
  title: string;
  lessons: LessonRow[];
}
interface SectionRow {
  id: string;
  title: string;
  units: UnitRow[];
}
interface Tree {
  course: { id: string; title: string; status: string };
  sections: SectionRow[];
}

const parsePairs = (s: string) =>
  s.split('\n').map((l) => l.split('=')).filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ left: p[0].trim(), right: p[1].trim() }));
const parseItems = (s: string) =>
  s.split('\n').map((l) => l.split('=')).filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ text: p[0].trim(), category: p[1].trim() }));
const parseFillAnswers = (text: string) => {
  const out: string[] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
};

export function CourseBuilderView({ courseId }: { courseId: string }) {
  const t = useTranslations('courses');
  const tEx = useTranslations('exercises');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [level, setLevel] = useState('Elementary');
  const [tree, setTree] = useState<Tree | null>(null);
  const [canAuthor, setCanAuthor] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [unitForms, setUnitForms] = useState<Record<string, string>>({});
  const [lessonForms, setLessonForms] = useState<Record<string, { title: string; position: string; optional: boolean }>>({});
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  const token = () => tokenStore.get();

  const load = useCallback(async () => {
    const tok = token();
    if (!tok) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(tok, locale);
      setCanAuthor(me.role === 'tutor' || me.role === 'admin');
      setTree(await apiFetch<Tree>(`/content/courses/${courseId}/tree?level=${level}`, { token: tok, locale }));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [courseId, level, locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (path: string, method: 'POST' | 'PATCH' | 'DELETE' | 'PUT', body?: unknown) => {
    const tok = token();
    if (!tok) return;
    setBusy(true);
    try {
      await apiFetch(path, { method, token: tok, locale, body });
      await load();
    } finally {
      setBusy(false);
    }
  };

  async function addSection(e: FormEvent) {
    e.preventDefault();
    await call('/content/sections', 'POST', { courseId, level, title: sectionTitle });
    setSectionTitle('');
  }

  async function addUnit(sectionId: string) {
    const title = unitForms[sectionId];
    if (!title) return;
    await call('/content/units', 'POST', { sectionId, title });
    setUnitForms({ ...unitForms, [sectionId]: '' });
  }

  async function addLesson(unitId: string) {
    const f = lessonForms[unitId];
    if (!f?.title) return;
    await call('/content/lessons', 'POST', {
      unitId,
      title: f.title,
      optional: f.optional,
      order: f.position ? Number(f.position) : undefined
    });
    setLessonForms({ ...lessonForms, [unitId]: { title: '', position: '', optional: false } });
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error' || !tree) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <Link className="link" href="/courses">← {t('back')}</Link>
      <div className="row-between">
        <h2>{tree.course.title}</h2>
        <label className="row-actions">
          {t('level')}
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      {canAuthor && (
        <form className="card form-grid" onSubmit={addSection}>
          <strong>{t('newSection')}</strong>
          <label>
            {t('courseTitle')}
            <input required value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>{t('create')}</button>
        </form>
      )}

      {tree.sections.length === 0 && <div className="card"><p className="note">{t('empty')}</p></div>}

      {tree.sections.map((s) => (
        <div key={s.id} className="card" style={{ marginTop: 16 }}>
          <h3 style={{ margin: 0 }}>{s.title}</h3>

          {s.units.map((u) => (
            <div key={u.id} className="unit-block">
              <strong>{u.title}</strong>
              <ul className="lesson-list">
                {u.lessons.map((l) => (
                  <li key={l.id} className="stacked">
                    <div className="row-between">
                      <span>
                        <span className="mono-num">{l.order}</span>{' '}
                        <Link className="link" href={`/learn/${l.id}`}>{l.title}</Link>{' '}
                        {l.optional && <span className="badge-opt">optional</span>}
                      </span>
                      {canAuthor && (
                        <span className="row-actions">
                          <button type="button" className="ghost" disabled={busy || l.order <= 1}
                            onClick={() => call(`/content/lessons/${l.id}/reorder`, 'POST', { order: l.order - 1 })}>
                            ↑
                          </button>
                          <button type="button" className="ghost" disabled={busy}
                            onClick={() => call(`/content/lessons/${l.id}/reorder`, 'POST', { order: l.order + 1 })}>
                            ↓
                          </button>
                          <button type="button" className="ghost" onClick={() => setOpenLesson(openLesson === l.id ? null : l.id)}>
                            {t('edit')}
                          </button>
                          <button type="button" className="ghost" disabled={busy}
                            onClick={() => call(`/content/lessons/${l.id}`, 'DELETE')}>
                            {t('del')}
                          </button>
                        </span>
                      )}
                    </div>
                    {openLesson === l.id && (
                      <LessonEditor lessonId={l.id} onChanged={load} t={t} tEx={tEx} locale={locale} />
                    )}
                  </li>
                ))}
              </ul>

              {canAuthor && (
                <div className="inline-form">
                  <input
                    placeholder={t('newLesson')}
                    value={lessonForms[u.id]?.title ?? ''}
                    onChange={(e) => setLessonForms({ ...lessonForms, [u.id]: { title: e.target.value, position: lessonForms[u.id]?.position ?? '', optional: lessonForms[u.id]?.optional ?? false } })}
                  />
                  <input
                    style={{ maxWidth: 130 }}
                    type="number"
                    min={1}
                    placeholder={t('position')}
                    value={lessonForms[u.id]?.position ?? ''}
                    onChange={(e) => setLessonForms({ ...lessonForms, [u.id]: { title: lessonForms[u.id]?.title ?? '', position: e.target.value, optional: lessonForms[u.id]?.optional ?? false } })}
                  />
                  <label className="check" style={{ padding: '6px 10px' }}>
                    <input
                      type="checkbox"
                      checked={lessonForms[u.id]?.optional ?? false}
                      onChange={(e) => setLessonForms({ ...lessonForms, [u.id]: { title: lessonForms[u.id]?.title ?? '', position: lessonForms[u.id]?.position ?? '', optional: e.target.checked } })}
                    />
                    {t('optionalLesson')}
                  </label>
                  <button type="button" disabled={busy} onClick={() => addLesson(u.id)}>{t('create')}</button>
                </div>
              )}
            </div>
          ))}

          {canAuthor && (
            <div className="inline-form">
              <input
                placeholder={t('newUnit')}
                value={unitForms[s.id] ?? ''}
                onChange={(e) => setUnitForms({ ...unitForms, [s.id]: e.target.value })}
              />
              <button type="button" disabled={busy} onClick={() => addUnit(s.id)}>{t('create')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ——— inline lesson editor: objectives, wordlist, grammar, pages, tasks ———

interface TaskRow {
  id: string;
  type: string;
  gradingMode: string;
  aspect: string;
  estimatedMinutes: number;
}
interface PageRow {
  id: string;
  type: string;
  includedInHomework: boolean;
  tasks: TaskRow[];
}
interface LessonDetail {
  id: string;
  title: string;
  objectives: string[];
  pages: PageRow[];
  wordlist?: { entries: { word: string; translation?: string | null }[] } | null;
  grammarReference?: { title: string; meaning: string; form: string } | null;
}

function LessonEditor({
  lessonId,
  onChanged,
  t,
  tEx,
  locale
}: {
  lessonId: string;
  onChanged: () => void;
  t: ReturnType<typeof useTranslations<'courses'>>;
  tEx: ReturnType<typeof useTranslations<'exercises'>>;
  locale: string;
}) {
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [objectives, setObjectives] = useState('');
  const [wordlist, setWordlist] = useState('');
  const [grammar, setGrammar] = useState({ title: '', meaning: '', form: '' });
  const [pageForm, setPageForm] = useState({ type: 'practice', inHw: true });
  const [taskForms, setTaskForms] = useState<Record<string, TaskFormState>>({});

  const token = () => tokenStore.get();

  const load = useCallback(async () => {
    const tok = token();
    if (!tok) return;
    const d = await apiFetch<LessonDetail>(`/content/lessons/${lessonId}`, { token: tok, locale });
    setDetail(d);
    setObjectives((d.objectives ?? []).join('\n'));
    setWordlist((d.wordlist?.entries ?? []).map((e) => (e.translation ? `${e.word} = ${e.translation}` : e.word)).join('\n'));
    setGrammar({
      title: d.grammarReference?.title ?? '',
      meaning: d.grammarReference?.meaning ?? '',
      form: d.grammarReference?.form ?? ''
    });
  }, [lessonId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPage() {
    const tok = token();
    if (!tok) return;
    setBusy(true);
    try {
      await apiFetch('/content/pages', {
        method: 'POST',
        token: tok,
        locale,
        body: { courseLessonId: lessonId, type: pageForm.type, includedInHomework: pageForm.inHw }
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addTask(pageId: string) {
    const tok = token();
    const f = taskForms[pageId];
    if (!tok || !f) return;
    const { payload, answerKey } = buildTaskPayload(f);
    setBusy(true);
    try {
      await apiFetch('/content/tasks', {
        method: 'POST',
        token: tok,
        locale,
        body: {
          pageId,
          type: f.type,
          gradingMode: f.gradingMode,
          aspect: f.aspect,
          estimatedMinutes: Number(f.minutes) || 5,
          payload,
          answerKey
        }
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(id: string) {
    const tok = token();
    if (!tok) return;
    setBusy(true);
    try {
      await apiFetch(`/content/tasks/${id}`, { method: 'DELETE', token: tok, locale });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <p className="note">…</p>;

  return (
    <div className="lesson-editor">
      <div className="two-col">
        <label className="ed-field">
          {t('objectives')}
          <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} />
        </label>
        <label className="ed-field">
          {t('wordlist')}
          <textarea value={wordlist} onChange={(e) => setWordlist(e.target.value)} />
        </label>
      </div>
      <div className="form-grid">
        <strong>{t('grammar')}</strong>
        <label>{t('grammarTitle')}<input value={grammar.title} onChange={(e) => setGrammar({ ...grammar, title: e.target.value })} /></label>
        <label>{t('meaning')}<input value={grammar.meaning} onChange={(e) => setGrammar({ ...grammar, meaning: e.target.value })} /></label>
        <label>{t('form')}<input value={grammar.form} onChange={(e) => setGrammar({ ...grammar, form: e.target.value })} /></label>
      </div>
      <SavePrepButton
        busy={busy}
        saved={saved}
        label={saved ? t('saved') : t('save')}
        onSave={async () => {
          const tok = token();
          if (!tok) return;
          setBusy(true);
          setSaved(false);
          try {
            await apiFetch(`/content/lessons/${lessonId}`, {
              method: 'PATCH',
              token: tok,
              locale,
              body: { objectives: objectives.split('\n').map((s) => s.trim()).filter(Boolean) }
            });
            const entries = wordlist
              .split('\n')
              .map((line) => {
                const [word, translation] = line.split('=').map((s) => s.trim());
                return word ? { word, translation: translation || undefined } : null;
              })
              .filter((x): x is { word: string; translation: string | undefined } => x !== null);
            await apiPut(`/content/lessons/${lessonId}/wordlist`, { entries }, tok, locale);
            if (grammar.title && grammar.meaning && grammar.form) {
              await apiPut(`/content/lessons/${lessonId}/grammar`, grammar, tok, locale);
            }
            setSaved(true);
            await load();
          } finally {
            setBusy(false);
          }
        }}
      />

      <div className="ed-pages">
        <strong>{t('pages')}</strong>
        {detail.pages.map((p) => (
          <div key={p.id} className="ed-page">
            <div className="row-between">
              <span className="muted">
                {p.type} {p.includedInHomework ? `· ${t('inHomework')}` : ''}
              </span>
            </div>
            <ul className="lesson-list">
              {p.tasks.map((task) => (
                <li key={task.id}>
                  <span>
                    {tEx(taskLabelKey(task.type))}{' '}
                    <span className="muted">· {task.gradingMode} · {task.aspect} · {task.estimatedMinutes}′</span>
                  </span>
                  <button type="button" className="ghost" disabled={busy} onClick={() => deleteTask(task.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <TaskForm
              form={taskForms[p.id] ?? defaultTaskForm()}
              onChange={(f) => setTaskForms({ ...taskForms, [p.id]: f })}
              onSubmit={() => addTask(p.id)}
              busy={busy}
              t={t}
              tEx={tEx}
            />
          </div>
        ))}
        <div className="inline-form">
          <select value={pageForm.type} onChange={(e) => setPageForm({ ...pageForm, type: e.target.value })}>
            {PAGE_TYPES.map((pt) => (
              <option key={pt} value={pt}>{pt}</option>
            ))}
          </select>
          <label className="check" style={{ padding: '6px 10px' }}>
            <input type="checkbox" checked={pageForm.inHw} onChange={(e) => setPageForm({ ...pageForm, inHw: e.target.checked })} />
            {t('inHomework')}
          </label>
          <button type="button" disabled={busy} onClick={addPage}>{t('addPage')}</button>
        </div>
      </div>
    </div>
  );
}

function SavePrepButton({ busy, saved, label, onSave }: { busy: boolean; saved: boolean; label: string; onSave: () => void }) {
  void saved;
  return (
    <button type="button" disabled={busy} onClick={onSave} style={{ alignSelf: 'flex-start' }}>
      {label}
    </button>
  );
}

async function apiPut(path: string, body: unknown, token: string, locale: string) {
  return apiFetch(path, { method: 'PUT', token, locale, body });
}

function taskLabelKey(type: string): 'order' | 'match' | 'fill' | 'categorize' | 'type' {
  if (type === 'sentence_ordering') return 'order';
  if (type === 'word_matching') return 'match';
  if (type === 'gap_fill') return 'fill';
  if (type === 'categorization') return 'categorize';
  return 'type';
}

interface TaskFormState {
  type: string;
  gradingMode: string;
  aspect: string;
  minutes: string;
  words: string;
  pairs: string;
  fill: string;
  categories: string;
  items: string;
  question: string;
  options: string;
  correct: string;
  prompt: string;
}

const defaultTaskForm = (): TaskFormState => ({
  type: 'sentence_ordering',
  gradingMode: 'AUTO',
  aspect: 'Grammar',
  minutes: '5',
  words: 'I go to school',
  pairs: 'dog = chien',
  fill: 'I [go] to [school].',
  categories: 'noun, verb',
  items: 'run = verb\nbook = noun',
  question: 'He ___ up at 6.',
  options: 'wake, wakes',
  correct: 'wakes',
  prompt: ''
});

function buildTaskPayload(f: TaskFormState): { payload: Record<string, unknown>; answerKey?: Record<string, unknown> } {
  if (f.type === 'sentence_ordering') {
    const words = f.words.trim().split(/\s+/).filter(Boolean);
    return { payload: { words }, answerKey: { order: words } };
  }
  if (f.type === 'word_matching') {
    const pairs = parsePairs(f.pairs);
    const map: Record<string, string> = {};
    for (const p of pairs) map[p.left] = p.right;
    return { payload: { pairs }, answerKey: { map } };
  }
  if (f.type === 'gap_fill') {
    return { payload: { text: f.fill }, answerKey: { answers: parseFillAnswers(f.fill) } };
  }
  if (f.type === 'categorization') {
    const items = parseItems(f.items);
    const placement: Record<string, string> = {};
    for (const it of items) placement[it.text] = it.category;
    return {
      payload: { categories: f.categories.split(',').map((c) => c.trim()).filter(Boolean), items },
      answerKey: { placement }
    };
  }
  if (f.type === 'multiple_choice') {
    return {
      payload: { question: f.question, options: f.options.split(',').map((o) => o.trim()).filter(Boolean) },
      answerKey: { correct: f.correct.trim() }
    };
  }
  // audio / essay / discussion: prompt-only payloads
  return { payload: { prompt: f.prompt || f.question } };
}

function TaskForm({
  form,
  onChange,
  onSubmit,
  busy,
  t,
  tEx
}: {
  form: TaskFormState;
  onChange: (f: TaskFormState) => void;
  onSubmit: () => void;
  busy: boolean;
  t: ReturnType<typeof useTranslations<'courses'>>;
  tEx: ReturnType<typeof useTranslations<'exercises'>>;
}) {
  const set = (patch: Partial<TaskFormState>) => onChange({ ...form, ...patch });
  return (
    <div className="ed-task-form">
      <div className="form-grid">
        <label>
          {t('addTask')}
          <select value={form.type} onChange={(e) => set({ type: e.target.value })}>
            {TASK_TYPES.map((tt) => (
              <option key={tt} value={tt}>{tt}</option>
            ))}
          </select>
        </label>
        <label>
          {t('gradingMode')}
          <select value={form.gradingMode} onChange={(e) => set({ gradingMode: e.target.value })}>
            {GRADING.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          {t('aspect')}
          <select value={form.aspect} onChange={(e) => set({ aspect: e.target.value })}>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          {t('minutes')}
          <input type="number" min={1} value={form.minutes} onChange={(e) => set({ minutes: e.target.value })} />
        </label>
      </div>

      {form.type === 'sentence_ordering' && (
        <label className="ed-field">{tEx('words')}<input value={form.words} onChange={(e) => set({ words: e.target.value })} /></label>
      )}
      {form.type === 'word_matching' && (
        <label className="ed-field">{tEx('pairs')}<textarea value={form.pairs} onChange={(e) => set({ pairs: e.target.value })} /></label>
      )}
      {form.type === 'gap_fill' && (
        <label className="ed-field">{tEx('fillText')}<textarea value={form.fill} onChange={(e) => set({ fill: e.target.value })} /></label>
      )}
      {form.type === 'categorization' && (
        <>
          <label className="ed-field">{tEx('categories')}<input value={form.categories} onChange={(e) => set({ categories: e.target.value })} /></label>
          <label className="ed-field">{tEx('items')}<textarea value={form.items} onChange={(e) => set({ items: e.target.value })} /></label>
        </>
      )}
      {form.type === 'multiple_choice' && (
        <>
          <label className="ed-field">{t('question')}<input value={form.question} onChange={(e) => set({ question: e.target.value })} /></label>
          <label className="ed-field">{t('options')}<input value={form.options} onChange={(e) => set({ options: e.target.value })} /></label>
          <label className="ed-field">{t('correct')}<input value={form.correct} onChange={(e) => set({ correct: e.target.value })} /></label>
        </>
      )}
      {(form.type === 'audio' || form.type === 'essay' || form.type === 'discussion') && (
        <label className="ed-field">{tEx('prompt')}<input value={form.prompt} onChange={(e) => set({ prompt: e.target.value })} /></label>
      )}
      <button type="button" disabled={busy} onClick={onSubmit}>{t('addTask')}</button>
    </div>
  );
}
