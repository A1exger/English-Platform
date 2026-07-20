'use client';

import { ReactNode } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fileUrl } from '@/lib/api';
import type {
  CategorizeDef,
  CategorizeState,
  GapDef,
  GapState,
  McqDef,
  McqState,
  MatchDef,
  MatchState,
  SentenceDef,
  SentenceState,
  TaskRendererProps,
  TaskType,
  ExerciseResult
} from './types';

// Pointer for mouse, delayed touch so a drag never fights the page scroll
// (SPEC §11). Shared by every renderer.
function useTaskSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );
}

const tone = (result: ExerciseResult | null | undefined, id: string): string =>
  result?.perToken ? (result.perToken[id] ? ' ok' : ' bad') : '';

function Draggable({
  id,
  disabled,
  className,
  children
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`task-chip${className ? ` ${className}` : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none'
      }}
      {...listeners}
      {...attributes}
    >
      {children}
    </button>
  );
}

function Droppable({
  id,
  className,
  children
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className ?? ''}${isOver ? ' over' : ''}`}>
      {children}
    </div>
  );
}

// ——— sentence_ordering (sortable, App. Д canonical) ———
function SortableToken({ id, label, mark }: { id: string; label: string; mark: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`task-chip${mark}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none'
      }}
      {...attributes}
      {...listeners}
    >
      {label}
    </button>
  );
}

function SentenceOrder({ def, state, onChange, readOnly, result }: TaskRendererProps<SentenceDef, SentenceState>) {
  const sensors = useTaskSensors();
  const order = state.order ?? def.tokens.map((_, i) => i);
  const ids = order.map(String);
  function onDragEnd(e: DragEndEvent) {
    if (readOnly || !e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    onChange({ order: arrayMove(order, from, to) });
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className={`task-sentence${result ? (result.correct ? ' ok' : ' bad') : ''}`}>
          {order.map((i) => (
            <SortableToken key={i} id={String(i)} label={def.tokens[i]} mark="" />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ——— gap_fill (droppable gaps + bank) ———
function GapFill({ def, state, onChange, readOnly, result }: TaskRendererProps<GapDef, GapState>) {
  const sensors = useTaskSensors();
  const filled = state.filled ?? {};
  // Available bank = full bank minus one instance per placed word (multiset).
  const used = Object.values(filled).filter((w): w is string => !!w);
  const avail: { word: string; key: string }[] = [];
  const pool = [...used];
  def.bank.forEach((word, i) => {
    const at = pool.indexOf(word);
    if (at >= 0) pool.splice(at, 1);
    else avail.push({ word, key: `bank:${i}` });
  });

  function wordOf(id: string): string | null {
    if (id.startsWith('bank:')) return avail.find((a) => a.key === id)?.word ?? null;
    if (id.startsWith('gap:')) return filled[id.slice(4)] ?? null;
    return null;
  }
  function onDragEnd(e: DragEndEvent) {
    if (readOnly || !e.over) return;
    const word = wordOf(String(e.active.id));
    if (!word) return;
    const next = { ...filled };
    if (String(e.active.id).startsWith('gap:')) next[String(e.active.id).slice(4)] = null;
    const over = String(e.over.id);
    if (over.startsWith('gap:')) next[over.slice(4)] = word;
    onChange({ filled: next });
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <p className="task-gap-text">
        {def.segments.map((seg, i) =>
          typeof seg === 'string' ? (
            <span key={i}>{seg}</span>
          ) : (
            <Droppable key={i} id={`gap:${seg.gap}`} className={`task-gap${tone(result, seg.gap)}`}>
              {filled[seg.gap] ? (
                <Draggable id={`gap:${seg.gap}`} disabled={readOnly}>{filled[seg.gap]}</Draggable>
              ) : (
                <span className="task-gap-empty">____</span>
              )}
            </Droppable>
          )
        )}
      </p>
      <Droppable id="bank" className="task-bank">
        {avail.map((a) => (
          <Draggable key={a.key} id={a.key} disabled={readOnly}>{a.word}</Draggable>
        ))}
      </Droppable>
    </DndContext>
  );
}

// ——— word_matching (right chips onto left rows) ———
function WordMatching({ def, state, onChange, readOnly, result }: TaskRendererProps<MatchDef, MatchState>) {
  const sensors = useTaskSensors();
  const links = state.links ?? {};
  const linkedRightIds = new Set(Object.values(links));
  const trayRights = def.right.filter((r) => !linkedRightIds.has(r.id));
  const rightById = (id: string) => def.right.find((r) => r.id === id);
  // A right chip is either a word or an uploaded picture (ФТ-У102 image match).
  const chip = (text: string): ReactNode =>
    def.rightType === 'image' ? <img className="task-match-img" src={fileUrl(text)} alt="" /> : text;

  function rightOf(activeId: string): string | null {
    if (activeId.startsWith('right:')) return activeId.slice(6);
    if (activeId.startsWith('linked:')) return links[activeId.slice(7)] ?? null;
    return null;
  }
  function onDragEnd(e: DragEndEvent) {
    if (readOnly || !e.over) return;
    const rightId = rightOf(String(e.active.id));
    if (!rightId) return;
    const next: Record<string, string> = { ...links };
    // detach this right wherever it currently is
    for (const l of Object.keys(next)) if (next[l] === rightId) delete next[l];
    const over = String(e.over.id);
    if (over.startsWith('left:')) next[over.slice(5)] = rightId;
    onChange({ links: next });
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="task-match">
        {def.left.map((l) => {
          const rid = links[l.id];
          const r = rid ? rightById(rid) : undefined;
          return (
            <div key={l.id} className="task-match-row">
              <span className="task-match-left">{l.text}</span>
              <Droppable id={`left:${l.id}`} className={`task-match-slot${tone(result, l.id)}`}>
                {r ? (
                  <Draggable id={`linked:${l.id}`} disabled={readOnly}>{chip(r.text)}</Draggable>
                ) : (
                  <span className="task-gap-empty">—</span>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
      <Droppable id="tray" className="task-bank">
        {trayRights.map((r) => (
          <Draggable key={r.id} id={`right:${r.id}`} disabled={readOnly}>{chip(r.text)}</Draggable>
        ))}
      </Droppable>
    </DndContext>
  );
}

// ——— categorization (items into category zones) ———
function Categorization({ def, state, onChange, readOnly, result }: TaskRendererProps<CategorizeDef, CategorizeState>) {
  const sensors = useTaskSensors();
  const placement = state.placement ?? {};
  const itemsIn = (catId: string | null) => def.items.filter((it) => (placement[it.id] ?? null) === catId);
  function onDragEnd(e: DragEndEvent) {
    if (readOnly || !e.over) return;
    const id = String(e.active.id);
    if (!id.startsWith('item:')) return;
    const itemId = id.slice(5);
    const over = String(e.over.id);
    const next = { ...placement };
    next[itemId] = over.startsWith('cat:') ? over.slice(4) : null;
    onChange({ placement: next });
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <Droppable id="tray" className="task-bank">
        {itemsIn(null).map((it) => (
          <Draggable key={it.id} id={`item:${it.id}`} disabled={readOnly}>{it.text}</Draggable>
        ))}
      </Droppable>
      <div className="task-cats">
        {def.categories.map((c) => (
          <Droppable key={c.id} id={`cat:${c.id}`} className="task-cat">
            <strong className="task-cat-label">{c.label}</strong>
            <div className="task-cat-items">
              {itemsIn(c.id).map((it) => (
                <Draggable key={it.id} id={`item:${it.id}`} disabled={readOnly} className={tone(result, it.id).trim()}>
                  {it.text}
                </Draggable>
              ))}
            </div>
          </Droppable>
        ))}
      </div>
    </DndContext>
  );
}

// ——— multiple_choice (no dnd) ———
function MultipleChoice({ def, state, onChange, readOnly, result }: TaskRendererProps<McqDef, McqState>) {
  return (
    <div className="task-mcq">
      {def.question && <p className="task-mcq-q">{def.question}</p>}
      {def.options.map((opt, i) => (
        <label key={i} className={`task-mcq-opt${state.choice === i ? ' active' : ''}${result && state.choice === i ? (result.correct ? ' ok' : ' bad') : ''}`}>
          <input
            type="radio"
            name="mcq"
            checked={state.choice === i}
            disabled={readOnly}
            onChange={() => onChange({ choice: i })}
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

// ——— dispatcher: the single entry point for every task type ———
export interface TaskProps {
  type: TaskType;
  def: unknown;
  state: unknown;
  readOnly?: boolean;
  result?: ExerciseResult | null;
  onChange: (next: unknown) => void;
}

export function TaskRenderer({ type, def, state, readOnly, result, onChange }: TaskProps) {
  const common = { readOnly, result, onChange } as const;
  switch (type) {
    case 'sentence_ordering':
      return <SentenceOrder def={def as SentenceDef} state={state as SentenceState} {...common} />;
    case 'gap_fill':
      return <GapFill def={def as GapDef} state={state as GapState} {...common} />;
    case 'word_matching':
      return <WordMatching def={def as MatchDef} state={state as MatchState} {...common} />;
    case 'categorization':
      return <Categorization def={def as CategorizeDef} state={state as CategorizeState} {...common} />;
    case 'multiple_choice':
      return <MultipleChoice def={def as McqDef} state={state as McqState} {...common} />;
    default:
      return null;
  }
}
