// Canonical task contract on the client — mirrors apps/api common/tasks
// (SPEC §4 / App. A). `def` is the SANITIZED payload the student receives; the
// answerKey never reaches the client. One set of types for board/course/homework.

export type TaskType =
  | 'sentence_ordering'
  | 'word_matching'
  | 'gap_fill'
  | 'categorization'
  | 'multiple_choice';

export interface ExerciseResult {
  correct: boolean;
  score: number; // 0..100
  perToken?: Record<string, boolean>;
}

export interface SentenceDef {
  tokens: string[];
}
export interface SentenceState {
  order: number[];
}

export type GapSegment = string | { gap: string };
export interface GapDef {
  segments: GapSegment[];
  bank: string[];
}
export interface GapState {
  filled: Record<string, string | null>;
}

export interface MatchCol {
  id: string;
  text: string;
}
export interface MatchDef {
  rightType?: 'text' | 'image';
  left: MatchCol[];
  right: MatchCol[];
}
export interface MatchState {
  links: Record<string, string>; // leftId -> rightId
}

export interface CatCategory {
  id: string;
  label: string;
}
export interface CatItem {
  id: string;
  text: string;
}
export interface CategorizeDef {
  categories: CatCategory[];
  items: CatItem[];
}
export interface CategorizeState {
  placement: Record<string, string | null>; // itemId -> categoryId
}

export interface McqDef {
  question: string;
  options: string[];
}
export interface McqState {
  choice: number | null;
}

// The managed-renderer contract shared by every type (App. Д).
export interface TaskRendererProps<Def, State> {
  def: Def;
  state: State;
  readOnly?: boolean;
  result?: ExerciseResult | null;
  onChange: (next: State) => void;
}
