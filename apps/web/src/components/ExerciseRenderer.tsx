'use client';

import { useTranslations } from 'next-intl';

export type Question =
  | { type: 'order'; title: string; prompt?: string | null; tokens: string[] }
  | { type: 'match'; title: string; lefts: string[]; rights: string[] }
  | {
      type: 'fill';
      title: string;
      segments: ({ text: string } | { blank: number })[];
      blanks: number;
      bank: string[];
    }
  | { type: 'categorize'; title: string; categories: string[]; items: string[] };

export type ExerciseState = Record<string, unknown>;

interface Props {
  question: Question;
  state: ExerciseState;
  onChange: (state: ExerciseState) => void;
  readOnly?: boolean;
  // When set (after checking), highlights correct/incorrect answers.
  review?: ExerciseState | null;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
function without(arr: string[], value: string): string[] {
  const i = arr.indexOf(value);
  return i < 0 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)];
}
const mark = (ok: boolean | undefined) => (ok === true ? ' ok' : ok === false ? ' err' : '');

export function ExerciseRenderer({ question, state, onChange, readOnly, review }: Props) {
  if (question.type === 'order') {
    const order = (state.order as string[]) ?? [];
    const sol = (review?.order as string[]) ?? null;
    let bank = [...question.tokens];
    for (const w of order) bank = without(bank, w);
    const place = (w: string) => !readOnly && onChange({ order: [...order, w] });
    const remove = (i: number) => !readOnly && onChange({ order: order.filter((_, idx) => idx !== i) });

    return (
      <div className="ex">
        {question.prompt && <p className="muted">{question.prompt}</p>}
        <div className="ex-answer ex-row" onDragOver={(e) => e.preventDefault()} onDrop={(e) => place(e.dataTransfer.getData('text/plain'))}>
          {order.length === 0 && <span className="muted ex-hint">…</span>}
          {order.map((w, i) => (
            <button key={i} type="button" className={`chip${mark(sol ? norm(w) === norm(sol[i]) : undefined)}`} onClick={() => remove(i)}>
              {w}
            </button>
          ))}
        </div>
        {sol && <p className="muted ex-correct">✓ {sol.join(' ')}</p>}
        <div className="ex-bank ex-row">
          {bank.map((w, i) => (
            <button key={i} type="button" className="chip chip-bank" draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData('text/plain', w)} onClick={() => place(w)}>
              {w}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === 'fill') {
    const answers = (state.answers as string[]) ?? Array(question.blanks).fill('');
    const sol = (review?.answers as string[]) ?? null;
    let bank = [...question.bank];
    for (const a of answers) if (a) bank = without(bank, a);
    const set = (blank: number, value: string) => {
      if (readOnly) return;
      const next = [...answers];
      next[blank] = value;
      onChange({ answers: next });
    };
    const firstEmpty = answers.findIndex((a) => !a);

    return (
      <div className="ex">
        <p className="ex-fill">
          {question.segments.map((seg, i) =>
            'text' in seg ? (
              <span key={i}>{seg.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className={`gap${answers[seg.blank] ? ' filled' : ''}${mark(sol ? norm(answers[seg.blank]) === norm(sol[seg.blank]) : undefined)}`}
                onClick={() => set(seg.blank, '')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => set(seg.blank, e.dataTransfer.getData('text/plain'))}
              >
                {answers[seg.blank] || (sol ? sol[seg.blank] : '____')}
              </button>
            ),
          )}
        </p>
        <div className="ex-bank ex-row">
          {bank.map((w, i) => (
            <button key={i} type="button" className="chip chip-bank" draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData('text/plain', w)} onClick={() => firstEmpty >= 0 && set(firstEmpty, w)}>
              {w}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === 'match') {
    const map = (state.map as Record<string, string>) ?? {};
    const sol = (review?.map as Record<string, string>) ?? null;
    const set = (left: string, right: string) => !readOnly && onChange({ map: { ...map, [left]: right } });
    return (
      <div className="ex ex-match">
        {question.lefts.map((left) => (
          <div key={left} className="ex-match-row">
            <span className="chip">{left}</span>
            <span className="muted">→</span>
            <select className={mark(sol ? norm(map[left]) === norm(sol[left]) : undefined)} value={map[left] ?? ''} disabled={readOnly} onChange={(e) => set(left, e.target.value)}>
              <option value="">—</option>
              {question.rights.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {sol && norm(map[left]) !== norm(sol[left]) && <span className="muted ex-correct">✓ {sol[left]}</span>}
          </div>
        ))}
      </div>
    );
  }

  // categorize
  const placement = (state.placement as Record<string, string>) ?? {};
  const sol = (review?.placement as Record<string, string>) ?? null;
  const unplaced = question.items.filter((it) => !placement[it]);
  const place = (item: string, category: string) => !readOnly && onChange({ placement: { ...placement, [item]: category } });
  const unplace = (item: string) => {
    if (readOnly) return;
    const next = { ...placement };
    delete next[item];
    onChange({ placement: next });
  };
  return (
    <div className="ex">
      <div className="ex-bank ex-row">
        {unplaced.map((it) => (
          <button key={it} type="button" className="chip chip-bank" draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData('text/plain', it)}>
            {it}
          </button>
        ))}
        {unplaced.length === 0 && <span className="muted ex-hint">✓</span>}
      </div>
      <div className="ex-cats">
        {question.categories.map((cat) => (
          <div key={cat} className="ex-cat" onDragOver={(e) => e.preventDefault()} onDrop={(e) => place(e.dataTransfer.getData('text/plain'), cat)}>
            <strong>{cat}</strong>
            <div className="ex-row">
              {question.items.filter((it) => placement[it] === cat).map((it) => (
                <button key={it} type="button" className={`chip${mark(sol ? norm(sol[it]) === norm(cat) : undefined)}`} onClick={() => unplace(it)}>
                  {it}
                </button>
              ))}
            </div>
            {!readOnly && <ClickToPlace items={unplaced} onPick={(it) => place(it, cat)} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClickToPlace({ items, onPick }: { items: string[]; onPick: (i: string) => void }) {
  const t = useTranslations('exercises');
  if (items.length === 0) return null;
  return (
    <select className="ex-place" value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">+ {t('place')}</option>
      {items.map((it) => (
        <option key={it} value={it}>{it}</option>
      ))}
    </select>
  );
}
