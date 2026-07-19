'use client';

import { DragEvent, FormEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';
import { useToast } from './Toast';
import { Icon } from './Icon';
import { PageMediaEditor } from './PageMediaEditor';
import { PageMediaBlock, type PageMediaItem } from './PageMediaBlock';
import { LessonPlayerView } from './LessonPlayerView';

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

type CreateTarget =
  | { mode: 'section' }
  | { mode: 'unit'; sectionId: string }
  | { mode: 'lesson'; unitId: string };

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

// A drag-reorderable wrapper whose handle starts the drag (pages and tasks).
function Sortable({
  id,
  className,
  handleLabel,
  children
}: {
  id: string;
  className: string;
  handleLabel: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button type="button" className="drag-handle" aria-label={handleLabel} {...attributes} {...listeners}>⠿</button>
  );
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      {children(handle)}
    </div>
  );
}

export function CourseBuilderView({ courseId }: { courseId: string }) {
  const t = useTranslations('courses');
  const tEx = useTranslations('exercises');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const { showUndo } = useToast();

  const [level, setLevel] = useState('Elementary');
  const [tree, setTree] = useState<Tree | null>(null);
  const [canAuthor, setCanAuthor] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);

  // Author-only interaction state.
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState<CreateTarget | null>(null);
  const [draft, setDraft] = useState({ title: '', optional: false });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [drag, setDrag] = useState<{ kind: 'section' | 'unit' | 'lesson'; id: string; parentId: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

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

  function openCreate(target: CreateTarget) {
    setDraft({ title: '', optional: false });
    setCreate(target);
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!create || !draft.title.trim()) return;
    if (create.mode === 'section') {
      await call('/content/sections', 'POST', { courseId, level, title: draft.title.trim() });
    } else if (create.mode === 'unit') {
      await call('/content/units', 'POST', { sectionId: create.sectionId, title: draft.title.trim() });
    } else {
      await call('/content/lessons', 'POST', {
        unitId: create.unitId,
        title: draft.title.trim(),
        optional: draft.optional
      });
    }
    setCreate(null);
  }

  // Reorder by absolute target order (backend re-sequences). Drag and keyboard share this.
  function doReorder(id: string, order: number) {
    if (order < 1 || busy) return;
    void call(`/content/lessons/${id}/reorder`, 'POST', { order });
  }

  function onLessonDrop(target: LessonRow, unitId: string) {
    if (drag?.kind === 'lesson' && drag.parentId === unitId && drag.id !== target.id) doReorder(drag.id, target.order);
    setDrag(null);
  }

  // Reorder a set of siblings by moving the dragged id in front of the target,
  // then persisting the full id order (sections/units share this).
  function siblingReorder(kind: 'section' | 'unit', parentId: string, siblings: { id: string }[], targetId: string) {
    if (!drag || drag.id === targetId || busy) return;
    const ids = siblings.map((s) => s.id);
    const from = ids.indexOf(drag.id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, drag.id);
    void call(
      kind === 'section' ? '/content/sections/reorder' : '/content/units/reorder',
      'POST',
      kind === 'section' ? { courseId, ids } : { sectionId: parentId, ids }
    );
  }

  function onSectionDrop(targetId: string) {
    if (tree && drag?.kind === 'section') siblingReorder('section', courseId, tree.sections, targetId);
    setDrag(null);
  }

  function onUnitDrop(sectionId: string, units: UnitRow[], targetId: string) {
    if (drag?.kind === 'unit' && drag.parentId === sectionId) siblingReorder('unit', sectionId, units, targetId);
    setDrag(null);
  }

  // Re-render the live preview after an edit lands.
  const refresh = () => {
    void load();
    setPreviewKey((k) => k + 1);
  };

  function onHandleKey(e: KeyboardEvent, lesson: LessonRow) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      doReorder(lesson.id, lesson.order - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      doReorder(lesson.id, lesson.order + 1);
    }
  }

  function startRename(lesson: LessonRow) {
    setRenaming(lesson.id);
    setRenameValue(lesson.title);
  }

  async function commitRename() {
    if (!renaming) return;
    const id = renaming;
    const title = renameValue.trim();
    setRenaming(null);
    const current = allLessons().find((l) => l.id === id);
    if (!title || (current && current.title === title)) return;
    await call(`/content/lessons/${id}`, 'PATCH', { title });
  }

  const allLessons = () =>
    tree ? tree.sections.flatMap((s) => s.units.flatMap((u) => u.lessons)) : [];

  // course › section › unit › lesson for the selected node (ФТ-К206).
  function breadcrumb(lessonId: string): string {
    if (!tree) return '';
    for (const s of tree.sections) {
      for (const u of s.units) {
        const l = u.lessons.find((x) => x.id === lessonId);
        if (l) return `${tree.course.title} › ${s.title} › ${u.title} › ${l.title}`;
      }
    }
    return tree.course.title;
  }

  // Optimistic + undoable delete (global rule: no deletion without showUndo).
  function removeLesson(lesson: LessonRow) {
    setTree((prev) =>
      prev
        ? {
            ...prev,
            sections: prev.sections.map((s) => ({
              ...s,
              units: s.units.map((u) => ({ ...u, lessons: u.lessons.filter((l) => l.id !== lesson.id) }))
            }))
          }
        : prev
    );
    if (selected === lesson.id) setSelected(null);
    showUndo(t('lessonDeleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const tok = token();
        if (!tok) return;
        await apiFetch(`/content/lessons/${lesson.id}`, { method: 'DELETE', token: tok, locale }).catch(
          () => undefined
        );
        await load();
      }
    });
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error' || !tree) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const levelFilter = (
    <div className="tabs tabs-inline filter-chips level-tabs" role="tablist" aria-label={t('level')}>
      {LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={level === l}
          className={level === l ? 'active' : ''}
          onClick={() => setLevel(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );

  const treePanel = (
    <div className="builder-tree card">
      {tree.sections.length === 0 ? (
        <p className="note">{t('empty')}</p>
      ) : (
        tree.sections.map((s) => (
          <div key={s.id} className={`tree-section${drag?.id === s.id ? ' dragging' : ''}`}>
            <div
              className="tree-section-head"
              draggable={canAuthor}
              onDragStart={() => canAuthor && setDrag({ kind: 'section', id: s.id, parentId: courseId })}
              onDragOver={(e: DragEvent) => canAuthor && drag?.kind === 'section' && e.preventDefault()}
              onDrop={() => canAuthor && onSectionDrop(s.id)}
              onDragEnd={() => setDrag(null)}
            >
              {canAuthor && <span className="drag-handle" aria-hidden>⠿</span>}
              <h3>{s.title}</h3>
              {canAuthor && (
                <button type="button" className="tree-add" aria-label={t('newUnit')} onClick={() => openCreate({ mode: 'unit', sectionId: s.id })}>
                  +
                </button>
              )}
            </div>

            {s.units.map((u) => (
              <div key={u.id} className={`tree-unit${drag?.id === u.id ? ' dragging' : ''}`}>
                <div
                  className="tree-unit-head"
                  draggable={canAuthor}
                  onDragStart={() => canAuthor && setDrag({ kind: 'unit', id: u.id, parentId: s.id })}
                  onDragOver={(e: DragEvent) => canAuthor && drag?.kind === 'unit' && drag.parentId === s.id && e.preventDefault()}
                  onDrop={() => canAuthor && onUnitDrop(s.id, s.units, u.id)}
                  onDragEnd={() => setDrag(null)}
                >
                  {canAuthor && <span className="drag-handle" aria-hidden>⠿</span>}
                  <strong>{u.title}</strong>
                  {canAuthor && (
                    <button type="button" className="tree-add" aria-label={t('newLesson')} onClick={() => openCreate({ mode: 'lesson', unitId: u.id })}>
                      +
                    </button>
                  )}
                </div>

                {u.lessons.length === 0 ? (
                  <p className="note tree-empty">{t('empty')}</p>
                ) : (
                  <ul className="tree-lessons">
                    {u.lessons.map((l) => {
                      const isRenaming = renaming === l.id;
                      return (
                        <li
                          key={l.id}
                          className={`tree-lesson${selected === l.id ? ' active' : ''}${drag?.id === l.id ? ' dragging' : ''}`}
                          draggable={canAuthor && !isRenaming}
                          onDragStart={() => canAuthor && setDrag({ kind: 'lesson', id: l.id, parentId: u.id })}
                          onDragOver={(e: DragEvent) => canAuthor && drag?.kind === 'lesson' && e.preventDefault()}
                          onDrop={() => canAuthor && onLessonDrop(l, u.id)}
                          onDragEnd={() => setDrag(null)}
                        >
                          {canAuthor && (
                            <button
                              type="button"
                              className="drag-handle"
                              aria-label={t('reorder')}
                              title={t('reorder')}
                              onKeyDown={(e) => onHandleKey(e, l)}
                            >
                              ⠿
                            </button>
                          )}
                          <span className="mono-num">{l.order}</span>

                          {isRenaming ? (
                            <input
                              className="tree-rename"
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename();
                                else if (e.key === 'Escape') setRenaming(null);
                              }}
                            />
                          ) : canAuthor ? (
                            <button
                              type="button"
                              className="tree-lesson-title"
                              onClick={() => setSelected(l.id)}
                              onDoubleClick={() => startRename(l)}
                            >
                              {l.title}
                              {l.optional && <span className="badge-opt">{t('optionalLesson')}</span>}
                            </button>
                          ) : (
                            <Link className="tree-lesson-title link" href={`/learn/${l.id}`}>
                              {l.title}
                              {l.optional && <span className="badge-opt">{t('optionalLesson')}</span>}
                            </Link>
                          )}

                          {canAuthor && (
                            <button type="button" className="tree-del ghost" aria-label={t('del')} disabled={busy} onClick={() => removeLesson(l)}>
                              <Icon name="close" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="content">
      <Link className="link" href="/courses">← {t('back')}</Link>
      <PageHeader
        title={tree.course.title}
        primary={canAuthor ? { label: t('newSection'), onClick: () => openCreate({ mode: 'section' }) } : undefined}
        filters={levelFilter}
      />

      {canAuthor ? (
        <div className={`builder${selected ? ' builder-3' : ''}`}>
          {treePanel}
          <div className="builder-editor">
            {selected ? (
              <>
                <nav className="builder-crumbs" aria-label="breadcrumb">{breadcrumb(selected)}</nav>
                <LessonEditor lessonId={selected} onChanged={refresh} t={t} tEx={tEx} locale={locale} />
              </>
            ) : (
              <div className="card empty-pane"><p className="note">{t('selectLesson')}</p></div>
            )}
          </div>
          {selected && (
            <div className="builder-preview">
              <div className="builder-preview-head muted">{t('preview')}</div>
              <div className="builder-preview-body">
                <LessonPlayerView key={previewKey} lessonId={selected} />
              </div>
            </div>
          )}
        </div>
      ) : (
        treePanel
      )}

      {canAuthor && (
        <Drawer
          open={!!create}
          onClose={() => setCreate(null)}
          title={create?.mode === 'unit' ? t('newUnit') : create?.mode === 'lesson' ? t('newLesson') : t('newSection')}
        >
          <form className="form-grid" onSubmit={submitCreate}>
            <label>
              {t('courseTitle')}
              <input required autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            {create?.mode === 'lesson' && (
              <label className="check">
                <input type="checkbox" checked={draft.optional} onChange={(e) => setDraft({ ...draft, optional: e.target.checked })} />
                {t('optionalLesson')}
              </label>
            )}
            <button type="submit" disabled={busy}>{t('create')}</button>
          </form>
        </Drawer>
      )}
    </div>
  );
}

// ——— lesson editor: objectives, wordlist, grammar, pages, tasks ———

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
  text?: string | null;
  tasks: TaskRow[];
  media?: PageMediaItem[];
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
  const { showUndo } = useToast();
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  // Reload pages/tasks/media only, keeping in-progress objectives/wordlist/
  // grammar text; also refreshes the live preview via onChanged.
  const reloadPages = useCallback(async () => {
    const tok = token();
    if (!tok) return;
    setDetail(await apiFetch<LessonDetail>(`/content/lessons/${lessonId}`, { token: tok, locale }));
    onChanged();
  }, [lessonId, locale, onChanged]);

  // Autosave objectives / wordlist / grammar (ФТ-К206); called on blur + Save.
  const saveLesson = useCallback(async () => {
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
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [lessonId, locale, objectives, wordlist, grammar, onChanged]);

  async function patchPage(id: string, body: Record<string, unknown>) {
    const tok = token();
    if (!tok) return;
    await apiFetch(`/content/pages/${id}`, { method: 'PATCH', token: tok, locale, body }).catch(() => undefined);
    await reloadPages();
  }

  async function postReorder(path: string, body: unknown) {
    const tok = token();
    if (!tok) return;
    await apiFetch(path, { method: 'POST', token: tok, locale, body }).catch(() => undefined);
    await reloadPages();
  }

  function onPageDragEnd(e: DragEndEvent) {
    if (!detail || !e.over || e.active.id === e.over.id) return;
    const ids = detail.pages.map((p) => p.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    void postReorder('/content/pages/reorder', { courseLessonId: lessonId, ids: next });
  }

  function onTaskDragEnd(pageId: string, e: DragEndEvent) {
    if (!detail || !e.over || e.active.id === e.over.id) return;
    const page = detail.pages.find((p) => p.id === pageId);
    if (!page) return;
    const ids = page.tasks.map((tk) => tk.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    void postReorder('/content/tasks/reorder', { pageId, ids: next });
  }

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

  // Optimistic + undoable (global rule: no deletion without showUndo).
  function deleteTask(id: string) {
    setDetail((prev) =>
      prev ? { ...prev, pages: prev.pages.map((p) => ({ ...p, tasks: p.tasks.filter((tk) => tk.id !== id) })) } : prev
    );
    showUndo(t('taskDeleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const tok = token();
        if (!tok) return;
        await apiFetch(`/content/tasks/${id}`, { method: 'DELETE', token: tok, locale }).catch(() => undefined);
        await load();
      }
    });
  }

  if (!detail) return <div className="card"><Skeleton lines={4} /></div>;

  return (
    <div className="lesson-editor">
      <div className="ed-toolbar">
        <span className={`save-status${busy ? ' saving' : saved ? ' ok' : ''}`} aria-live="polite">
          {busy ? t('saving') : saved ? t('saved') : ''}
        </span>
        <button type="button" className="save-lesson" disabled={busy} onClick={() => void saveLesson()}>
          {t('save')}
        </button>
      </div>
      <div className="two-col">
        <label className="ed-field">
          {t('objectives')}
          <textarea value={objectives} onChange={(e) => { setObjectives(e.target.value); setSaved(false); }} onBlur={() => void saveLesson()} />
        </label>
        <label className="ed-field">
          {t('wordlist')}
          <textarea value={wordlist} onChange={(e) => { setWordlist(e.target.value); setSaved(false); }} onBlur={() => void saveLesson()} />
        </label>
      </div>
      <div className="form-grid">
        <strong>{t('grammar')}</strong>
        <label>{t('grammarTitle')}<input value={grammar.title} onChange={(e) => { setGrammar({ ...grammar, title: e.target.value }); setSaved(false); }} onBlur={() => void saveLesson()} /></label>
        <label>{t('meaning')}<input value={grammar.meaning} onChange={(e) => { setGrammar({ ...grammar, meaning: e.target.value }); setSaved(false); }} onBlur={() => void saveLesson()} /></label>
        <label>{t('form')}<input value={grammar.form} onChange={(e) => { setGrammar({ ...grammar, form: e.target.value }); setSaved(false); }} onBlur={() => void saveLesson()} /></label>
      </div>

      <div className="ed-pages">
        <strong>{t('pages')}</strong>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPageDragEnd}>
          <SortableContext items={detail.pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {detail.pages.map((p) => (
              <Sortable key={p.id} id={p.id} className="ed-page" handleLabel={t('reorder')}>
                {(handle) => (
                  <>
                    <div className="ed-page-head">
                      {handle}
                      <select value={p.type} onChange={(e) => patchPage(p.id, { type: e.target.value })} aria-label={t('pageType')}>
                        {PAGE_TYPES.map((pt) => (
                          <option key={pt} value={pt}>{pt}</option>
                        ))}
                      </select>
                      <label className="check">
                        <input type="checkbox" checked={p.includedInHomework} onChange={(e) => patchPage(p.id, { includedInHomework: e.target.checked })} />
                        {t('inHomework')}
                      </label>
                    </div>
                    <label className="ed-field">
                      {t('pageText')}
                      <textarea
                        defaultValue={p.text ?? ''}
                        onBlur={(e) => e.target.value !== (p.text ?? '') && patchPage(p.id, { text: e.target.value })}
                      />
                    </label>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onTaskDragEnd(p.id, e)}>
                      <SortableContext items={p.tasks.map((tk) => tk.id)} strategy={verticalListSortingStrategy}>
                        <div className="lesson-list">
                          {p.tasks.map((task) => (
                            <Sortable key={task.id} id={task.id} className="ed-task-row" handleLabel={t('reorder')}>
                              {(th) => (
                                <>
                                  {th}
                                  <span className="ed-task-label">
                                    {tEx(taskLabelKey(task.type))}{' '}
                                    <span className="muted">· {task.gradingMode} · {task.aspect} · {task.estimatedMinutes}′</span>
                                  </span>
                                  <button type="button" className="ghost" disabled={busy} aria-label={t('del')} onClick={() => deleteTask(task.id)}>
                                    <Icon name="close" />
                                  </button>
                                </>
                              )}
                            </Sortable>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    <TaskForm
                      form={taskForms[p.id] ?? defaultTaskForm()}
                      onChange={(f) => setTaskForms({ ...taskForms, [p.id]: f })}
                      onSubmit={() => addTask(p.id)}
                      busy={busy}
                      t={t}
                      tEx={tEx}
                    />
                    <PageMediaEditor pageId={p.id} media={p.media ?? []} onChanged={reloadPages} />
                  </>
                )}
              </Sortable>
            ))}
          </SortableContext>
        </DndContext>
        <div className="inline-form">
          <select value={pageForm.type} onChange={(e) => setPageForm({ ...pageForm, type: e.target.value })}>
            {PAGE_TYPES.map((pt) => (
              <option key={pt} value={pt}>{pt}</option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={pageForm.inHw} onChange={(e) => setPageForm({ ...pageForm, inHw: e.target.checked })} />
            {t('inHomework')}
          </label>
          <button type="button" disabled={busy} onClick={addPage}>{t('addPage')}</button>
        </div>
      </div>
    </div>
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
