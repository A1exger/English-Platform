// Pure helpers for the AI generation pipeline (SPEC §10): prompt builders,
// response normalisers, and per-task validation/repair (ФТ-К403). No I/O here,
// so it is unit-tested without any API key. Generated tasks use the CONTENT
// LessonTask format (words / pairs / text / categories+items / question+options)
// so they materialise straight through the content service.
import {
  ASPECTS,
  CONTENT_LEVELS,
  GRADING_MODES,
  TASK_TYPES,
} from '../common/constants/enums';

export interface Brief {
  targetType: 'COURSE' | 'LESSON';
  topic: string;
  level: string;
  units: number;
  lessonsPerUnit: number;
  aspects: string[];
  notes?: string;
  courseId?: string;
}

export interface SkeletonLesson {
  title: string;
  objectives: string[];
}
export interface SkeletonUnit {
  title: string;
  lessons: SkeletonLesson[];
}
export interface Skeleton {
  units: SkeletonUnit[];
}

export interface GenTask {
  type: string;
  gradingMode: string;
  aspect: string;
  estimatedMinutes: number;
  payload: Record<string, unknown>;
  answerKey?: Record<string, unknown>;
}
export interface GenPage {
  type: string;
  text?: string;
  tasks: GenTask[];
}
export interface LessonPlan {
  pages: GenPage[];
  wordlist: { word: string; translation?: string }[];
  grammar?: { title: string; meaning: string; form: string };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const TASK_FORMATS = `Task formats (use EXACTLY these shapes):
- sentence_ordering: {"type":"sentence_ordering","aspect":"Grammar","payload":{"words":["I","have","never","been","to","London"]}}  (words in the CORRECT order, 2-30 tokens)
- word_matching: {"type":"word_matching","aspect":"Vocabulary","payload":{"pairs":[{"left":"cat","right":"gato"}]}}  (2-12 pairs)
- gap_fill: {"type":"gap_fill","aspect":"Grammar","payload":{"text":"I [go] to [school] every day."}}  (answers wrapped in [brackets], 1-12 gaps)
- categorization: {"type":"categorization","aspect":"Vocabulary","payload":{"categories":["Verbs","Nouns"],"items":[{"text":"run","category":"Verbs"}]}}  (2-6 categories)
- multiple_choice: {"type":"multiple_choice","aspect":"Reading","payload":{"question":"...","options":["a","b","c"]},"answerKey":{"correct":"a"}}  (correct MUST equal one option)
Every task also has "gradingMode":"AUTO" and an "aspect" from: ${ASPECTS.join(', ')}.`;

export function skeletonPrompt(brief: Brief): { system: string; user: string } {
  return {
    system:
      'You are an expert English-course designer. Respond with ONLY a JSON object, no prose. ' +
      `Match the CEFR-style level exactly (level "${brief.level}"): vocabulary and grammar must suit it.`,
    user:
      `Design the SKELETON of an English course.\n` +
      `Topic: ${brief.topic}\nLevel: ${brief.level}\n` +
      `Units: ${brief.units}, lessons per unit: ${brief.lessonsPerUnit}\n` +
      `Aspects to cover: ${brief.aspects.join(', ')}\n` +
      (brief.notes ? `Notes: ${brief.notes}\n` : '') +
      `Return JSON: {"units":[{"title":"...","lessons":[{"title":"...","objectives":["...","..."]}]}]}\n` +
      `Exactly ${brief.units} units, each with exactly ${brief.lessonsPerUnit} lessons; 2-4 objectives per lesson.`
  };
}

export function lessonPrompt(
  brief: Brief,
  ctx: { unitTitle: string; lessonTitle: string; objectives: string[] }
): { system: string; user: string } {
  return {
    system:
      'You are an expert English-lesson author. Respond with ONLY a JSON object, no prose. ' +
      `Level "${brief.level}": keep vocabulary/grammar at that level. ${TASK_FORMATS}`,
    user:
      `Write the LESSON content.\n` +
      `Course topic: ${brief.topic}\nUnit: ${ctx.unitTitle}\nLesson: ${ctx.lessonTitle}\n` +
      `Objectives: ${ctx.objectives.join('; ')}\nAspects: ${brief.aspects.join(', ')}\n` +
      (brief.notes ? `Notes: ${brief.notes}\n` : '') +
      `Return JSON: {"pages":[{"type":"grammar|practice|listening|reading","text":"...","tasks":[<task>]}],` +
      `"wordlist":[{"word":"...","translation":"..."}],"grammar":{"title":"...","meaning":"...","form":"..."}}\n` +
      `2-4 pages, 1-4 tasks per page, 4-8 wordlist entries.`
  };
}

/** Parse + clamp the skeleton to the brief's shape. */
export function normalizeSkeleton(raw: unknown, brief: Brief): Skeleton {
  const root = (raw ?? {}) as { units?: unknown };
  const units = arr(root.units)
    .slice(0, clamp(brief.units, 1, 20))
    .map((u) => {
      const uo = (u ?? {}) as { title?: unknown; lessons?: unknown };
      return {
        title: str(uo.title) || 'Unit',
        lessons: arr(uo.lessons)
          .slice(0, clamp(brief.lessonsPerUnit, 1, 20))
          .map((l) => {
            const lo = (l ?? {}) as { title?: unknown; objectives?: unknown };
            return {
              title: str(lo.title) || 'Lesson',
              objectives: arr(lo.objectives).map(str).filter(Boolean).slice(0, 6)
            };
          })
          .filter((l) => l.title)
      };
    })
    .filter((u) => u.lessons.length > 0);
  if (units.length === 0) throw new Error('AI returned an empty skeleton');
  return { units };
}

const PAGE_TYPES = ['grammar', 'practice', 'listening', 'reading', 'discussion', 'essay'];

/**
 * Validate + repair one generated task (ФТ-К403). Returns a normalised task or
 * null (dropped, never materialised). Enforces the content-task contract and the
 * §11 size limits; gap_fill must have a bracketed answer, MCQ's correct ∈ options.
 */
export function normalizeTask(raw: unknown): GenTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = str(r.type);
  if (!(TASK_TYPES as readonly string[]).includes(type)) return null;
  const gradingMode = (GRADING_MODES as readonly string[]).includes(str(r.gradingMode)) ? str(r.gradingMode) : 'AUTO';
  const aspect = (ASPECTS as readonly string[]).includes(str(r.aspect)) ? str(r.aspect) : 'Grammar';
  const payload = (r.payload ?? {}) as Record<string, unknown>;
  const answerKey = r.answerKey as Record<string, unknown> | undefined;
  const base = {
    type,
    gradingMode,
    aspect,
    estimatedMinutes: clamp(Math.round(Number(r.estimatedMinutes) || 5), 1, 60)
  };

  switch (type) {
    case 'sentence_ordering': {
      const words = arr(payload.words).map(str).filter(Boolean).slice(0, 30);
      if (words.length < 2) return null;
      return { ...base, payload: { words } };
    }
    case 'word_matching': {
      const pairs = arr(payload.pairs)
        .map((p) => ({ left: str((p as Record<string, unknown>)?.left), right: str((p as Record<string, unknown>)?.right) }))
        .filter((p) => p.left && p.right)
        .slice(0, 12);
      if (pairs.length < 2) return null;
      return { ...base, payload: { pairs } };
    }
    case 'gap_fill': {
      const text = str(payload.text);
      if (!/\[[^\]]+\]/.test(text)) return null; // at least one [answer]
      return { ...base, payload: { text } };
    }
    case 'categorization': {
      const categories = arr(payload.categories).map(str).filter(Boolean).slice(0, 6);
      const items = arr(payload.items)
        .map((it) => ({ text: str((it as Record<string, unknown>)?.text), category: str((it as Record<string, unknown>)?.category) }))
        .filter((it) => it.text && categories.includes(it.category))
        .slice(0, 24);
      if (categories.length < 2 || items.length < 1) return null;
      return { ...base, payload: { categories, items } };
    }
    case 'multiple_choice': {
      const question = str(payload.question);
      const options = arr(payload.options).map(str).filter(Boolean).slice(0, 8);
      const correct = str(answerKey?.correct);
      if (!question || options.length < 2 || !options.includes(correct)) return null;
      return { ...base, payload: { question, options }, answerKey: { correct } };
    }
    // audio / essay / discussion: content-only prompts, no auto grading
    case 'audio':
    case 'essay':
    case 'discussion': {
      const prompt = str(payload.prompt) || str(payload.text) || str(payload.question);
      if (!prompt) return null;
      return { ...base, gradingMode: 'COMPLETION', payload: { prompt } };
    }
    default:
      return null;
  }
}

/** Parse a lesson plan, dropping malformed tasks (ФТ-К403). */
export function normalizeLessonPlan(raw: unknown): LessonPlan {
  const root = (raw ?? {}) as { pages?: unknown; wordlist?: unknown; grammar?: unknown };
  const pages = arr(root.pages)
    .slice(0, 8)
    .map((p) => {
      const po = (p ?? {}) as { type?: unknown; text?: unknown; tasks?: unknown };
      const type = PAGE_TYPES.includes(str(po.type)) ? str(po.type) : 'practice';
      const tasks = arr(po.tasks)
        .map(normalizeTask)
        .filter((t): t is GenTask => t !== null)
        .slice(0, 8);
      return { type, text: str(po.text) || undefined, tasks };
    });
  const wordlist = arr(root.wordlist)
    .map((w) => {
      const wo = (w ?? {}) as { word?: unknown; translation?: unknown };
      return { word: str(wo.word), translation: str(wo.translation) || undefined };
    })
    .filter((w) => w.word)
    .slice(0, 24);
  const g = (root.grammar ?? {}) as { title?: unknown; meaning?: unknown; form?: unknown };
  const grammar =
    str(g.title) && str(g.meaning) && str(g.form)
      ? { title: str(g.title), meaning: str(g.meaning), form: str(g.form) }
      : undefined;
  return { pages, wordlist, grammar };
}

/** Validate a raw brief (ФТ-К401); throws on invalid, returns a clean Brief. */
export function parseBrief(raw: Record<string, unknown>): Brief {
  const targetType = raw.targetType === 'LESSON' ? 'LESSON' : 'COURSE';
  const topic = str(raw.topic);
  const level = str(raw.level);
  if (!topic) throw new Error('brief.topic is required');
  if (!(CONTENT_LEVELS as readonly string[]).includes(level)) throw new Error('brief.level is invalid');
  const aspects = arr(raw.aspects).map(str).filter((a) => (ASPECTS as readonly string[]).includes(a));
  return {
    targetType,
    topic,
    level,
    units: clamp(Math.round(Number(raw.units) || 3), 1, 12),
    lessonsPerUnit: clamp(Math.round(Number(raw.lessonsPerUnit) || 3), 1, 10),
    aspects: aspects.length ? aspects : ['Grammar'],
    notes: str(raw.notes) || undefined,
    courseId: str(raw.courseId) || undefined
  };
}
