import { BadRequestException } from '@nestjs/common';
import {
  GapSegment,
  MatchPair,
  shuffle,
  TASK_TYPES,
  TaskType,
} from '../common/tasks/task-contract';

// Author-side validation for the canonical task contract (SPEC §4 / App. A),
// enforcing the constructor rules (ФТ-У105) and the content limits (§11). This
// is the server's source of truth: a malformed task never reaches the database,
// and the answer is split out into a server-only `answerKey` (ДИ-3).
//
// It lives beside the standalone-exercise CRUD but is pure/stateless so the AI
// generator (later stages) can reuse the very same validator.

const PAYLOAD_MAX_BYTES = 64 * 1024; // §11

/** True for the five interactive canonical types (those with grade/sanitize). */
export function isCanonicalType(type: string): type is TaskType {
  return (TASK_TYPES as readonly string[]).includes(type);
}

const nonEmpty = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

export interface NormalizedExercise {
  payload: Record<string, unknown>;
  // null when the payload itself encodes the answer (sentence_ordering,
  // word_matching): the layout is hidden at serve-time by shuffled state /
  // sanitize, so there is nothing extra to keep secret.
  answerKey: Record<string, unknown> | null;
}

/**
 * Validate a canonical exercise draft and return the pieces to persist: the
 * student-facing `payload` and the server-only `answerKey`. Throws
 * BadRequestException on any contract/limit violation (ФТ-У105).
 */
export function normalizeCanonical(
  type: TaskType,
  payload: Record<string, unknown>,
  answerKey?: Record<string, unknown> | null,
): NormalizedExercise {
  const fail = (msg: string): never => {
    throw new BadRequestException(`Invalid exercise: ${msg}`);
  };
  const p = payload ?? {};
  const key = (answerKey ?? {}) as Record<string, unknown>;
  let out: NormalizedExercise;

  switch (type) {
    case 'sentence_ordering': {
      const tokens = p.tokens;
      if (!Array.isArray(tokens) || tokens.length < 2) fail('sentence needs at least 2 tokens');
      const list = tokens as unknown[];
      if (list.length > 30) fail('sentence has at most 30 tokens');
      if (list.some((tk) => !nonEmpty(tk))) fail('empty token');
      out = { payload: { tokens: list.map((s) => (s as string).trim()) }, answerKey: null };
      break;
    }
    case 'word_matching': {
      const pairs = p.pairs;
      if (!Array.isArray(pairs) || pairs.length < 2) fail('need at least 2 pairs');
      const list = pairs as MatchPair[];
      if (list.length > 12) fail('at most 12 pairs');
      if (list.some((pair) => !nonEmpty(pair?.id) || !nonEmpty(pair?.left) || !nonEmpty(pair?.right)))
        fail('pair with empty id/left/right');
      if (new Set(list.map((pair) => pair.id)).size !== list.length) fail('duplicate pair id');
      out = {
        payload: {
          rightType: p.rightType === 'image' ? 'image' : 'text',
          pairs: list.map((pair) => ({ id: pair.id, left: pair.left.trim(), right: pair.right.trim() })),
        },
        answerKey: null,
      };
      break;
    }
    case 'gap_fill': {
      const segments = p.segments;
      const bank = p.bank;
      if (!Array.isArray(segments)) fail('missing segments');
      const gaps = (segments as GapSegment[]).filter(
        (s): s is { gap: string } => typeof s === 'object' && s !== null && nonEmpty((s as { gap?: unknown }).gap),
      );
      if (gaps.length < 1) fail('need at least 1 gap');
      if (gaps.length > 12) fail('at most 12 gaps');
      if (!Array.isArray(bank) || (bank as unknown[]).some((b) => !nonEmpty(b))) fail('bank has empty entries');
      const bankList = (bank as string[]).map((b) => b.trim());
      if (bankList.length > 24) fail('bank has at most 24 entries');
      const resolvedKey: Record<string, string> = {};
      for (const g of gaps) {
        const ans = key[g.gap];
        if (!nonEmpty(ans)) fail(`gap ${g.gap} has no answer`);
        const trimmed = (ans as string).trim();
        if (!bankList.includes(trimmed)) fail(`answer "${trimmed}" is not in the bank`);
        resolvedKey[g.gap] = trimmed;
      }
      out = { payload: { segments, bank: bankList }, answerKey: resolvedKey };
      break;
    }
    case 'categorization': {
      const categories = p.categories;
      const items = p.items;
      if (!Array.isArray(categories) || categories.length < 2) fail('need at least 2 categories');
      const catList = categories as { id: string; label: string }[];
      if (catList.length > 6) fail('at most 6 categories');
      if (catList.some((c) => !nonEmpty(c?.id) || !nonEmpty(c?.label))) fail('category with empty id/label');
      if (!Array.isArray(items) || items.length < 1) fail('need at least 1 item');
      const itemList = items as { id: string; text: string }[];
      if (itemList.length > 24) fail('at most 24 items');
      if (itemList.some((it) => !nonEmpty(it?.id) || !nonEmpty(it?.text))) fail('item with empty id/text');
      const catIds = new Set(catList.map((c) => c.id));
      const resolvedKey: Record<string, string> = {};
      for (const it of itemList) {
        const c = key[it.id];
        if (typeof c !== 'string' || !catIds.has(c)) fail(`item ${it.id} has no valid category`);
        resolvedKey[it.id] = c as string;
      }
      out = {
        payload: {
          categories: catList.map((c) => ({ id: c.id, label: c.label.trim() })),
          items: itemList.map((it) => ({ id: it.id, text: it.text.trim() })),
        },
        answerKey: resolvedKey,
      };
      break;
    }
    case 'multiple_choice': {
      const options = p.options;
      if (!Array.isArray(options) || options.length < 2) fail('need at least 2 options');
      const optList = options as unknown[];
      if (optList.some((o) => !nonEmpty(o))) fail('empty option');
      const correct = (key as { correct?: unknown }).correct;
      if (typeof correct !== 'number' || correct < 0 || correct >= optList.length)
        fail('the correct option is out of range');
      out = {
        payload: {
          question: nonEmpty(p.question) ? (p.question as string).trim() : '',
          options: optList.map((o) => (o as string).trim()),
        },
        answerKey: { correct },
      };
      break;
    }
    default:
      return fail('unknown exercise type');
  }

  if (JSON.stringify(out.payload).length > PAYLOAD_MAX_BYTES) fail('payload is too large');
  return out;
}

/**
 * The initial student layout for a fresh instance/card, shuffled on the SERVER
 * so both sides (and every student) see an independent order that never hints
 * the answer (ФТ-У302 / §Прил. В). Only sentence_ordering needs a seeded state;
 * the other types are shuffled inside `sanitize` (columns/bank) and start empty.
 * Returns a JSON string, or undefined when no seed is needed.
 */
export function seedInstanceState(type: string, payloadJson: string): string | undefined {
  if (type === 'sentence_ordering') {
    const tokens = (JSON.parse(payloadJson).tokens as unknown[]) ?? [];
    return JSON.stringify({ order: shuffle(tokens.map((_, i) => i)) });
  }
  return undefined;
}
