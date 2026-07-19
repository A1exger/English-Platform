// Client-side authoring for the canonical task contract (SPEC §4 / App. A).
// Pure helpers shared by the constructor: build the payload/answerKey to POST,
// validate a draft (ФТ-У105), and reconstruct the form when editing. The server
// (normalizeCanonical) re-validates everything — this only gates the UI and
// drives the live preview. The answerKey is authored here but never rendered to
// a student: the preview uses `sanitizeForPreview`, the real serve-time
// sanitisation happens server-side.
import type { TaskType } from './types';
import { parseGaps } from './parseGaps';

export interface CanonicalForm {
  sentence: string; // sentence_ordering
  pairs: string; // word_matching — "left = right" per line
  fillText: string; // gap_fill — "I [go] to [school]."
  distractors: string; // gap_fill — comma-separated extra bank words
  categories: string; // categorization — comma-separated labels
  items: string; // categorization — "item = category" per line
  mcqQuestion: string; // multiple_choice
  mcqOptions: string; // multiple_choice — one option per line
  mcqCorrect: number; // multiple_choice — index of the correct option
}

export const EMPTY_FORM: CanonicalForm = {
  sentence: '',
  pairs: '',
  fillText: '',
  distractors: '',
  categories: '',
  items: '',
  mcqQuestion: '',
  mcqOptions: '',
  mcqCorrect: 0
};

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function parsePairLines(s: string): { left: string; right: string }[] {
  return lines(s)
    .map((l) => l.split('='))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ left: p[0].trim(), right: p[1].trim() }));
}

function parseItemLines(s: string): { text: string; category: string }[] {
  return lines(s)
    .map((l) => l.split('='))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ text: p[0].trim(), category: p[1].trim() }));
}

/** Build the {payload, answerKey?} to POST for a canonical draft. */
export function toCanonicalPayload(
  type: string,
  form: CanonicalForm
): { payload: Record<string, unknown>; answerKey?: Record<string, unknown> } {
  switch (type) {
    case 'sentence_ordering':
      return { payload: { tokens: form.sentence.trim().split(/\s+/).filter(Boolean) } };
    case 'word_matching': {
      const pairs = parsePairLines(form.pairs).map((p, i) => ({ id: `p${i + 1}`, left: p.left, right: p.right }));
      return { payload: { rightType: 'text', pairs } };
    }
    case 'gap_fill': {
      const { segments, answer, bank } = parseGaps(form.fillText);
      return { payload: { segments, bank: [...bank, ...csv(form.distractors)] }, answerKey: answer };
    }
    case 'categorization': {
      const cats = csv(form.categories).map((label, i) => ({ id: `c${i + 1}`, label }));
      const byLabel = new Map(cats.map((c) => [c.label, c.id]));
      const parsed = parseItemLines(form.items);
      const items = parsed.map((it, i) => ({ id: `i${i + 1}`, text: it.text }));
      const answerKey: Record<string, unknown> = {};
      parsed.forEach((it, i) => {
        answerKey[`i${i + 1}`] = byLabel.get(it.category) ?? '';
      });
      return { payload: { categories: cats, items }, answerKey };
    }
    case 'multiple_choice':
      return {
        payload: { question: form.mcqQuestion.trim(), options: lines(form.mcqOptions) },
        answerKey: { correct: form.mcqCorrect }
      };
    default:
      return { payload: {} };
  }
}

/** ФТ-У105 draft validation; returns an i18n key ('exercises' namespace) or null. */
export function canonicalError(type: string, form: CanonicalForm): string | null {
  switch (type) {
    case 'sentence_ordering':
      return form.sentence.trim().split(/\s+/).filter(Boolean).length >= 2 ? null : 'sentenceMin';
    case 'word_matching':
      return parsePairLines(form.pairs).length >= 2 ? null : 'matchMin';
    case 'gap_fill':
      return Object.keys(parseGaps(form.fillText).answer).length >= 1 ? null : 'gapMin';
    case 'categorization': {
      const cats = csv(form.categories);
      const parsed = parseItemLines(form.items);
      if (cats.length < 2 || parsed.length < 1) return 'catMin';
      const set = new Set(cats);
      return parsed.some((it) => !set.has(it.category)) ? 'catMin' : null;
    }
    case 'multiple_choice': {
      const options = lines(form.mcqOptions);
      if (options.length < 2) return 'mcqMin';
      return form.mcqCorrect < 0 || form.mcqCorrect >= options.length ? 'mcqMin' : null;
    }
    default:
      return null;
  }
}

/** The student-facing def for the preview (mirrors the server `sanitize`). */
export function sanitizeForPreview(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (type === 'word_matching') {
    const pairs = (payload.pairs as { id: string; left: string; right: string }[]) ?? [];
    return {
      rightType: (payload.rightType as string) ?? 'text',
      left: pairs.map((p) => ({ id: p.id, text: p.left })),
      right: shuffle(pairs.map((p) => ({ id: p.id, text: p.right })))
    };
  }
  return payload;
}

/** The initial student state for the preview (server seeds the real one). */
export function initialStateFor(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'sentence_ordering': {
      const n = ((payload.tokens as unknown[]) ?? []).length;
      return { order: shuffle(Array.from({ length: n }, (_, i) => i)) };
    }
    case 'word_matching':
      return { links: {} };
    case 'gap_fill':
      return { filled: {} };
    case 'categorization':
      return { placement: {} };
    case 'multiple_choice':
      return { choice: null };
    default:
      return {};
  }
}

/** Reconstruct the constructor form from a saved canonical exercise (for edit). */
export function editFormFromCanonical(
  type: string,
  payload: Record<string, unknown>,
  answerKey: Record<string, unknown> | null
): CanonicalForm {
  switch (type) {
    case 'sentence_ordering':
      return { ...EMPTY_FORM, sentence: ((payload.tokens as string[]) ?? []).join(' ') };
    case 'word_matching': {
      const pairs = (payload.pairs as { left: string; right: string }[]) ?? [];
      return { ...EMPTY_FORM, pairs: pairs.map((p) => `${p.left} = ${p.right}`).join('\n') };
    }
    case 'gap_fill': {
      const segments = (payload.segments as (string | { gap: string })[]) ?? [];
      const key = (answerKey ?? {}) as Record<string, string>;
      const fillText = segments.map((s) => (typeof s === 'string' ? s : `[${key[s.gap] ?? ''}]`)).join('');
      const answers = Object.values(key);
      const distractors = ((payload.bank as string[]) ?? []).filter((b) => !answers.includes(b));
      return { ...EMPTY_FORM, fillText, distractors: distractors.join(', ') };
    }
    case 'categorization': {
      const cats = (payload.categories as { id: string; label: string }[]) ?? [];
      const idToLabel = new Map(cats.map((c) => [c.id, c.label]));
      const its = (payload.items as { id: string; text: string }[]) ?? [];
      const key = (answerKey ?? {}) as Record<string, string>;
      return {
        ...EMPTY_FORM,
        categories: cats.map((c) => c.label).join(', '),
        items: its.map((it) => `${it.text} = ${idToLabel.get(key[it.id]) ?? ''}`).join('\n')
      };
    }
    case 'multiple_choice': {
      const options = (payload.options as string[]) ?? [];
      const key = (answerKey ?? {}) as { correct?: number };
      return { ...EMPTY_FORM, mcqQuestion: (payload.question as string) ?? '', mcqOptions: options.join('\n'), mcqCorrect: key.correct ?? 0 };
    }
    default:
      return { ...EMPTY_FORM };
  }
}

export const CANONICAL_TYPES: TaskType[] = [
  'sentence_ordering',
  'word_matching',
  'gap_fill',
  'categorization',
  'multiple_choice'
];
