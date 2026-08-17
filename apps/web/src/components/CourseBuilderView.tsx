'use client';

import { DragEvent, FormEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
import { CourseAiPanel } from './CourseAiPanel';

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
  'true_false',
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
  // Student-only progress the roadmap reads (courseTree enriches these for
  // students; undefined for authors).
  done?: boolean;
  score?: number | null;
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
  /** Levels this course actually has sections in, in CEFR order. */
  levels?: string[];
  sections: SectionRow[];
}

type CreateTarget =
  | { mode: 'section' }
  | { mode: 'unit'; sectionId: string }
  | { mode: 'lesson'; unitId: string };

const parsePairs = (s: string) =>
  s.split('\n').map((l) => l.split('=')).filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ left: p[0].trim(), right: p[1].trim() }));
// "The text says X. = true" per line. Anything but a true/false marker is
// dropped rather than guessed, so a typo cannot silently become an answer.
const parseStatements = (s: string) =>
  s
    .split('\n')
    .map((line) => {
      const at = line.lastIndexOf('=');
      if (at < 0) return null;
      const text = line.slice(0, at).trim();
      const flag = line.slice(at + 1).trim().toLowerCase();
      if (!text || (flag !== 'true' && flag !== 'false')) return null;
      return { text, value: flag === 'true' };
    })
    .filter((x): x is { text: string; value: boolean } => x !== null);

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
  const tc = useTranslations('common');
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
  // Which node is being renamed. Sections, units and lessons all rename the
  // same way, so the kind rides along to pick the endpoint on commit.
  const [renaming, setRenaming] = useState<{ kind: 'section' | 'unit' | 'lesson'; id: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [drag, setDrag] = useState<{ kind: 'section' | 'unit' | 'lesson'; id: string; parentId: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Bumped only when an AI job finishes, to tell the open lesson editor to
  // re-pull. Ordinary edits must NOT bump it: the editor would then reload
  // under the author mid-typing.
  const [aiRevision, setAiRevision] = useState(0);

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

  // Land on a level the course actually has. Without this the builder always
  // opened on Elementary, so a course built only at, say, Advanced looked empty
  // — most visible on individual courses, which are usually a single level.
  // Guarded by a ref so it only steers the first load, never a manual pick.
  const levelPicked = useRef(false);
  useEffect(() => {
    if (levelPicked.current || !tree?.levels?.length) return;
    levelPicked.current = true;
    if (!tree.levels.includes(level)) setLevel(tree.levels[0]);
  }, [tree, level]);

  // Close the preview popup on Escape.
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setPreviewOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen]);

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

  function startRename(kind: 'section' | 'unit' | 'lesson', node: { id: string; title: string }) {
    setRenaming({ kind, id: node.id });
    setRenameValue(node.title);
  }

  const ENDPOINT = { section: 'sections', unit: 'units', lesson: 'lessons' } as const;

  async function commitRename() {
    if (!renaming) return;
    const { kind, id } = renaming;
    const title = renameValue.trim();
    setRenaming(null);
    if (!title || currentTitle(kind, id) === title) return;
    await call(`/content/${ENDPOINT[kind]}/${id}`, 'PATCH', { title });
  }

  /** The stored title, so an unchanged (or empty) edit costs no request. */
  function currentTitle(kind: 'section' | 'unit' | 'lesson', id: string): string | undefined {
    if (!tree) return undefined;
    if (kind === 'section') return tree.sections.find((s) => s.id === id)?.title;
    if (kind === 'unit') return tree.sections.flatMap((s) => s.units).find((u) => u.id === id)?.title;
    return allLessons().find((l) => l.id === id)?.title;
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

  // Same optimistic + undoable shape as removeLesson. Both cascade server-side
  // (section → units → lessons), so the tree is pruned locally to match, and the
  // open lesson is deselected when it was inside what went away.
  function removeUnit(unit: UnitRow) {
    setTree((prev) =>
      prev
        ? { ...prev, sections: prev.sections.map((s) => ({ ...s, units: s.units.filter((u) => u.id !== unit.id) })) }
        : prev
    );
    if (unit.lessons.some((l) => l.id === selected)) setSelected(null);
    showUndo(t('unitDeleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const tok = token();
        if (!tok) return;
        await apiFetch(`/content/units/${unit.id}`, { method: 'DELETE', token: tok, locale }).catch(
          () => undefined
        );
        await load();
      }
    });
  }

  function removeSection(section: SectionRow) {
    setTree((prev) => (prev ? { ...prev, sections: prev.sections.filter((s) => s.id !== section.id) } : prev));
    if (section.units.some((u) => u.lessons.some((l) => l.id === selected))) setSelected(null);
    showUndo(t('sectionDeleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const tok = token();
        if (!tok) return;
        await apiFetch(`/content/sections/${section.id}`, { method: 'DELETE', token: tok, locale }).catch(
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
      {LEVELS.map((l) => {
        const empty = !!tree?.levels && !tree.levels.includes(l);
        return (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={level === l}
            // Dimmed, not hidden: an author still needs to open an empty level
            // to add the first section to it.
            className={level === l ? 'active' : ''}
            onClick={() => setLevel(l)}
          >
            {l}
            {empty && <span className="level-empty-note">{t('levelEmpty')}</span>}
          </button>
        );
      })}
    </div>
  );

  const treePanel = (
    <div className="builder-tree card">
      {tree.sections.length === 0 ? (
        // Name the level, so switching to one with nothing in it reads as
        // "this level is empty" rather than "the switch did not work".
        <p className="note">{t('levelEmptyBody')}</p>
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
              {renaming?.kind === 'section' && renaming.id === s.id ? (
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
              ) : (
                <h3 onDoubleClick={() => canAuthor && startRename('section', s)}>{s.title}</h3>
              )}
              {canAuthor && (
                <button
                  type="button"
                  className="tree-edit"
                  aria-label={t('rename')}
                  title={t('rename')}
                  onClick={() => startRename('section', s)}
                >
                  <Icon name="edit" />
                </button>
              )}
              {canAuthor && (
                <button type="button" className="tree-add" aria-label={t('newUnit')} onClick={() => openCreate({ mode: 'unit', sectionId: s.id })}>
                  +
                </button>
              )}
              {canAuthor && (
                <button
                  type="button"
                  className="tree-del ghost"
                  aria-label={t('del')}
                  title={t('del')}
                  disabled={busy}
                  onClick={() => removeSection(s)}
                >
                  <Icon name="close" />
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
                  {renaming?.kind === 'unit' && renaming.id === u.id ? (
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
                  ) : (
                    <strong onDoubleClick={() => canAuthor && startRename('unit', u)}>{u.title}</strong>
                  )}
                  {canAuthor && (
                    <button
                      type="button"
                      className="tree-edit"
                      aria-label={t('rename')}
                      title={t('rename')}
                      onClick={() => startRename('unit', u)}
                    >
                      <Icon name="edit" />
                    </button>
                  )}
                  {canAuthor && (
                    <button type="button" className="tree-add" aria-label={t('newLesson')} onClick={() => openCreate({ mode: 'lesson', unitId: u.id })}>
                      +
                    </button>
                  )}
                  {canAuthor && (
                    <button
                      type="button"
                      className="tree-del ghost"
                      aria-label={t('del')}
                      title={t('del')}
                      disabled={busy}
                      onClick={() => removeUnit(u)}
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>

                {u.lessons.length === 0 ? (
                  <p className="note tree-empty">{t('empty')}</p>
                ) : (
                  <ul className="tree-lessons">
                    {u.lessons.map((l) => {
                      const isRenaming = renaming?.kind === 'lesson' && renaming.id === l.id;
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
                              onDoubleClick={() => startRename('lesson', l)}
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

                          {canAuthor && !isRenaming && (
                            <button
                              type="button"
                              className="tree-edit"
                              aria-label={t('rename')}
                              title={t('rename')}
                              onClick={() => startRename('lesson', l)}
                            >
                              <Icon name="edit" />
                            </button>
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

  // Student-facing course roadmap (Skyeng-style): a progress bar, then lessons
  // grouped by unit with a done ✓ + score, and the current (first not-done
  // required) lesson highlighted with a «continue» call to action.
  const roadmapPanel = (() => {
    const flat = tree.sections.flatMap((s) => s.units.flatMap((u) => u.lessons));
    const required = flat.filter((l) => !l.optional);
    const doneRequired = required.filter((l) => l.done).length;
    const pct = required.length ? Math.round((doneRequired / required.length) * 100) : 0;
    const currentId = flat.find((l) => !l.optional && !l.done)?.id;
    return (
      <div className="roadmap">
        <div className="card roadmap-progress">
          <div className="result-bar">
            <div className="result-bar-fill" style={{ inlineSize: `${pct}%` }} />
          </div>
          <span className="mono-num">{pct}%</span>
        </div>
        {tree.sections.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          tree.sections.map((s) => (
            <div key={s.id} className="roadmap-section">
              {tree.sections.length > 1 && <h3 className="roadmap-section-title">{s.title}</h3>}
              {s.units.map((u) => (
                <div key={u.id} className="card roadmap-unit">
                  <strong className="roadmap-unit-title">{u.title}</strong>
                  {u.lessons.length === 0 ? (
                    <p className="note">{t('empty')}</p>
                  ) : (
                    <ul className="roadmap-lessons">
                      {u.lessons.map((l) => {
                        const isCurrent = l.id === currentId;
                        return (
                          <li
                            key={l.id}
                            className={`roadmap-lesson${l.done ? ' done' : ''}${isCurrent ? ' current' : ''}`}
                          >
                            <Link className="roadmap-lesson-link" href={`/learn/${l.id}`}>
                              <span className="roadmap-lesson-mark" aria-hidden>
                                {l.done ? <Icon name="check" /> : l.order}
                              </span>
                              <span className="roadmap-lesson-title">
                                {l.title}
                                {l.optional && <span className="badge-opt">{t('optionalLesson')}</span>}
                              </span>
                              {l.done && l.score != null && (
                                <span className="chip score-chip mono-num">{l.score}</span>
                              )}
                              {isCurrent && <span className="roadmap-lesson-cta">{t('continue')}</span>}
                            </Link>
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
  })();

  return (
    <div className="content">
      <Link className="link" href="/courses">← {t('back')}</Link>
      <PageHeader
        title={tree.course.title}
        primary={canAuthor ? { label: t('newSection'), onClick: () => openCreate({ mode: 'section' }) } : undefined}
        filters={levelFilter}
      />

      {canAuthor && (
        <CourseAiPanel
          courseId={courseId}
          courseStatus={tree.course.status}
          level={level}
          onChanged={() => {
            refresh();
            setAiRevision((n) => n + 1);
          }}
        />
      )}

      {canAuthor ? (
        <div className="builder">
          {treePanel}
          <div className="builder-editor">
            {selected ? (
              <>
                <div className="builder-editor-head">
                  <nav className="builder-crumbs" aria-label="breadcrumb">{breadcrumb(selected)}</nav>
                  <button type="button" className="ghost preview-btn" onClick={() => setPreviewOpen(true)}>
                    <Icon name="eye" /> {t('preview')}
                  </button>
                </div>
                <LessonEditor
                  lessonId={selected}
                  reloadToken={aiRevision}
                  onChanged={refresh}
                  t={t}
                  tEx={tEx}
                  locale={locale}
                />
              </>
            ) : (
              <div className="card empty-pane"><p className="note">{t('selectLesson')}</p></div>
            )}
          </div>
        </div>
      ) : (
        roadmapPanel
      )}

      {/* Lesson preview as an on-demand popup (student's-eye view) rather than a
          permanent panel, so the editor keeps the full width. */}
      {canAuthor && selected && previewOpen && (
        <div className="preview-modal" role="dialog" aria-modal="true" aria-label={t('preview')} onMouseDown={() => setPreviewOpen(false)}>
          <div className="preview-modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="preview-modal-head">
              <strong>{t('preview')}</strong>
              <button type="button" className="ghost" aria-label={tc('close')} onClick={() => setPreviewOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            <div className="preview-modal-scroll">
              <LessonPlayerView key={previewKey} lessonId={selected} />
            </div>
          </div>
        </div>
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
  title?: string | null;
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
  wordlist?: {
    entries: { word: string; translation?: string | null; translations?: Record<string, string> }[];
  } | null;
  grammarReference?: { title: string; meaning: string; form: string } | null;
}

// Locales the wordlist can carry a manual translation for (matches the API).
const TRANSLATE_LOCALES = ['en', 'ru', 'de', 'fr', 'nl', 'ar'];

function LessonEditor({
  lessonId,
  reloadToken,
  onChanged,
  t,
  tEx,
  locale
}: {
  lessonId: string;
  /** Bumped by the parent when an AI job rewrote this lesson server-side. */
  reloadToken: number;
  onChanged: () => void;
  t: ReturnType<typeof useTranslations<'courses'>>;
  tEx: ReturnType<typeof useTranslations<'exercises'>>;
  locale: string;
}) {
  const { showUndo } = useToast();
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // Live handles to each page's text box, so the media block can insert an
  // inline ![[media:ID]] marker at the caret (ФТ-К304 authoring).
  const pageTextRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [objectives, setObjectives] = useState('');
  const [wordlist, setWordlist] = useState('');
  const [grammar, setGrammar] = useState({ title: '', meaning: '', form: '' });
  const [pageForm, setPageForm] = useState({ type: 'practice', inHw: true });
  const [taskForms, setTaskForms] = useState<Record<string, TaskFormState>>({});
  const [translating, setTranslating] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  // Manual per-locale translations table (V3), keyed by word.
  const [trans, setTrans] = useState<Record<string, Record<string, string>>>({});

  const token = () => tokenStore.get();

  const load = useCallback(async () => {
    const tok = token();
    if (!tok) return;
    const d = await apiFetch<LessonDetail>(`/content/lessons/${lessonId}?edit=1`, { token: tok, locale });
    setDetail(d);
    setObjectives((d.objectives ?? []).join('\n'));
    setWordlist((d.wordlist?.entries ?? []).map((e) => (e.translation ? `${e.word} = ${e.translation}` : e.word)).join('\n'));
    setGrammar({
      title: d.grammarReference?.title ?? '',
      meaning: d.grammarReference?.meaning ?? '',
      form: d.grammarReference?.form ?? ''
    });
    // `reloadToken` is not read here: it is the parent's signal that an AI
    // revision replaced this lesson's content, which must rebuild this callback
    // so the effect below re-runs. Without it the editor kept the pre-revision
    // wordlist on screen — and autosave then wrote that stale text back over
    // whatever the revision had just generated.
  }, [lessonId, locale, reloadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Rebuild the per-locale table whenever the loaded wordlist changes.
  useEffect(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const e of detail?.wordlist?.entries ?? []) map[e.word] = { ...(e.translations ?? {}) };
    setTrans(map);
  }, [detail?.wordlist]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  // Reload pages/tasks/media only, keeping in-progress objectives/wordlist/
  // grammar text; also refreshes the live preview via onChanged.
  const reloadPages = useCallback(async () => {
    const tok = token();
    if (!tok) return;
    setDetail(await apiFetch<LessonDetail>(`/content/lessons/${lessonId}?edit=1`, { token: tok, locale }));
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

  // AI-translate the wordlist into every locale (V2). Persist the current words
  // first so the entries exist, then fill their per-locale translations.
  async function translateWordlist() {
    const tok = token();
    if (!tok) return;
    setTranslating('busy');
    try {
      await saveLesson();
      await apiFetch(`/content/lessons/${lessonId}/translate-wordlist`, { method: 'POST', token: tok, locale });
      setTranslating('done');
      setTimeout(() => setTranslating('idle'), 2500);
    } catch {
      setTranslating('error');
      setTimeout(() => setTranslating('idle'), 3500);
    }
  }

  // Save the manually edited per-locale translations (V3).
  async function saveTranslations() {
    const tok = token();
    if (!tok) return;
    const entries = Object.entries(trans).map(([word, translations]) => ({ word, translations }));
    await apiPut(`/content/lessons/${lessonId}/wordlist-translations`, { entries }, tok, locale).catch(
      () => undefined
    );
    onChanged();
  }

  async function patchPage(id: string, body: Record<string, unknown>) {
    const tok = token();
    if (!tok) return;
    await apiFetch(`/content/pages/${id}`, { method: 'PATCH', token: tok, locale, body }).catch(() => undefined);
    await reloadPages();
  }

  // Insert an inline ![[media:ID]] marker into a page's text at the caret and
  // persist it. The textarea is uncontrolled (defaultValue), so we write through
  // its live value and save (ФТ-К304).
  function insertMarker(pageId: string, mediaId: string) {
    const el = pageTextRefs.current[pageId];
    if (!el) return;
    const marker = `![[media:${mediaId}]]`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + marker + el.value.slice(end);
    el.value = next;
    el.focus();
    const caret = start + marker.length;
    el.setSelectionRange(caret, caret);
    void patchPage(pageId, { text: next });
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
        <div className="ed-field">
          <div className="ed-field-head">
            <span>{t('wordlist')}</span>
            <button
              type="button"
              className="ghost ed-translate"
              disabled={translating === 'busy' || !wordlist.trim()}
              onClick={translateWordlist}
            >
              {translating === 'busy'
                ? t('translating')
                : translating === 'done'
                  ? t('translated')
                  : translating === 'error'
                    ? t('translateError')
                    : t('translate')}
            </button>
          </div>
          <textarea value={wordlist} onChange={(e) => { setWordlist(e.target.value); setSaved(false); }} onBlur={() => void saveLesson()} />
        </div>
      </div>

      {(detail.wordlist?.entries?.length ?? 0) > 0 && (
        <details className="ed-translations">
          <summary>{t('editTranslations')}</summary>
          <div className="ed-trans-scroll">
            <div className="ed-trans-row ed-trans-head">
              <span className="ed-trans-word">{t('word')}</span>
              {TRANSLATE_LOCALES.map((l) => (
                <span key={l}>{l.toUpperCase()}</span>
              ))}
            </div>
            {(detail.wordlist?.entries ?? []).map((e) => (
              <div key={e.word} className="ed-trans-row">
                <span className="ed-trans-word">{e.word}</span>
                {TRANSLATE_LOCALES.map((l) => (
                  <input
                    key={l}
                    value={trans[e.word]?.[l] ?? ''}
                    onChange={(ev) =>
                      setTrans((prev) => ({ ...prev, [e.word]: { ...prev[e.word], [l]: ev.target.value } }))
                    }
                  />
                ))}
              </div>
            ))}
          </div>
          <button type="button" className="ghost ed-trans-save" onClick={saveTranslations}>
            {t('saveTranslations')}
          </button>
        </details>
      )}

      <div className="ed-grammar">
        <strong>{t('grammar')}</strong>
        <label className="ed-field">{t('grammarTitle')}<input value={grammar.title} onChange={(e) => { setGrammar({ ...grammar, title: e.target.value }); setSaved(false); }} onBlur={() => void saveLesson()} /></label>
        <label className="ed-field">{t('meaning')}<textarea value={grammar.meaning} onChange={(e) => { setGrammar({ ...grammar, meaning: e.target.value }); setSaved(false); }} onBlur={() => void saveLesson()} /></label>
        <label className="ed-field">{t('form')}<textarea value={grammar.form} onChange={(e) => { setGrammar({ ...grammar, form: e.target.value }); setSaved(false); }} onBlur={() => void saveLesson()} /></label>
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
                      <input
                        className="ed-page-title"
                        placeholder={t('stageName')}
                        defaultValue={p.title ?? ''}
                        onBlur={(e) => e.target.value !== (p.title ?? '') && patchPage(p.id, { title: e.target.value })}
                      />
                      <label className="check">
                        <input type="checkbox" checked={p.includedInHomework} onChange={(e) => patchPage(p.id, { includedInHomework: e.target.checked })} />
                        {t('inHomework')}
                      </label>
                    </div>
                    <label className="ed-field">
                      {t('pageText')}
                      <textarea
                        ref={(el) => {
                          pageTextRefs.current[p.id] = el;
                        }}
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
                    <PageMediaEditor
                      pageId={p.id}
                      media={p.media ?? []}
                      onChanged={reloadPages}
                      onInsertMarker={(mediaId) => insertMarker(p.id, mediaId)}
                    />
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
  statements: string;
  pairs: string;
  fill: string;
  categories: string;
  items: string;
  question: string;
  options: string;
  correct: string;
  prompt: string;
}

// The fields start EMPTY. They used to be pre-filled with these examples as real
// values, so an author who did not notice saved a task about going to school.
// The examples now live in `placeholder`, where they cannot be submitted.
const TASK_EXAMPLES = {
  words: 'I go to school',
  statements: 'Peter lives in London. = true\nPeter is a doctor. = false',
  pairs: 'dog = chien',
  fill: 'I [go] to [school].',
  categories: 'noun, verb',
  items: 'run = verb\nbook = noun',
  question: 'He ___ up at 6.',
  options: 'wake, wakes',
  correct: 'wakes',
  prompt: 'Describe your last holiday.'
} as const;

const defaultTaskForm = (): TaskFormState => ({
  type: 'sentence_ordering',
  gradingMode: 'AUTO',
  aspect: 'Grammar',
  minutes: '5',
  words: '',
  statements: '',
  pairs: '',
  fill: '',
  categories: '',
  items: '',
  question: '',
  options: '',
  correct: '',
  prompt: ''
});

/**
 * Whether the chosen type has everything it needs. With the examples gone the
 * form can be submitted empty, which the API would reject with a 400 — so the
 * button is held until the type's own fields are filled.
 */
function taskFormReady(f: TaskFormState): boolean {
  switch (f.type) {
    case 'sentence_ordering':
      return f.words.trim().split(/\s+/).filter(Boolean).length >= 2;
    case 'true_false':
      return parseStatements(f.statements).length >= 2;
    case 'word_matching':
      return parsePairs(f.pairs).length >= 1;
    case 'gap_fill':
      return parseFillAnswers(f.fill).length >= 1;
    case 'categorization':
      return f.categories.split(',').filter((c) => c.trim()).length >= 2 && parseItems(f.items).length >= 1;
    case 'multiple_choice': {
      const options = f.options.split(',').map((o) => o.trim()).filter(Boolean);
      return !!f.question.trim() && options.length >= 2 && options.includes(f.correct.trim());
    }
    default:
      return !!f.prompt.trim();
  }
}

function buildTaskPayload(f: TaskFormState): { payload: Record<string, unknown>; answerKey?: Record<string, unknown> } {
  if (f.type === 'sentence_ordering') {
    const words = f.words.trim().split(/\s+/).filter(Boolean);
    return { payload: { words }, answerKey: { order: words } };
  }
  if (f.type === 'true_false') {
    const rows = parseStatements(f.statements);
    return { payload: { statements: rows.map((r) => r.text) }, answerKey: { values: rows.map((r) => r.value) } };
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
        <label className="ed-field">{tEx('words')}<input value={form.words} placeholder={TASK_EXAMPLES.words} onChange={(e) => set({ words: e.target.value })} /></label>
      )}
      {form.type === 'true_false' && (
        <label className="ed-field">
          {tEx('statements')}
          <textarea
            value={form.statements}
            placeholder={TASK_EXAMPLES.statements}
            onChange={(e) => set({ statements: e.target.value })}
          />
        </label>
      )}
      {form.type === 'word_matching' && (
        <label className="ed-field">{tEx('pairs')}<textarea value={form.pairs} placeholder={TASK_EXAMPLES.pairs} onChange={(e) => set({ pairs: e.target.value })} /></label>
      )}
      {form.type === 'gap_fill' && (
        <label className="ed-field">{tEx('fillText')}<textarea value={form.fill} placeholder={TASK_EXAMPLES.fill} onChange={(e) => set({ fill: e.target.value })} /></label>
      )}
      {form.type === 'categorization' && (
        <>
          <label className="ed-field">{tEx('categories')}<input value={form.categories} placeholder={TASK_EXAMPLES.categories} onChange={(e) => set({ categories: e.target.value })} /></label>
          <label className="ed-field">{tEx('items')}<textarea value={form.items} placeholder={TASK_EXAMPLES.items} onChange={(e) => set({ items: e.target.value })} /></label>
        </>
      )}
      {form.type === 'multiple_choice' && (
        <>
          <label className="ed-field">{t('question')}<input value={form.question} placeholder={TASK_EXAMPLES.question} onChange={(e) => set({ question: e.target.value })} /></label>
          <label className="ed-field">{t('options')}<input value={form.options} placeholder={TASK_EXAMPLES.options} onChange={(e) => set({ options: e.target.value })} /></label>
          <label className="ed-field">{t('correct')}<input value={form.correct} placeholder={TASK_EXAMPLES.correct} onChange={(e) => set({ correct: e.target.value })} /></label>
        </>
      )}
      {(form.type === 'audio' || form.type === 'essay' || form.type === 'discussion') && (
        <label className="ed-field">{tEx('prompt')}<input value={form.prompt} placeholder={TASK_EXAMPLES.prompt} onChange={(e) => set({ prompt: e.target.value })} /></label>
      )}
      <button type="button" disabled={busy || !taskFormReady(form)} onClick={onSubmit}>{t('addTask')}</button>
    </div>
  );
}
