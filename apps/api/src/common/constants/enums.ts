// String-literal union types + constant arrays for all "enum-like" fields.
// SQLite does not support Prisma enums, so these mirror the documented allowed
// values in prisma/schema.prisma and are reused for validation across the app.

export const USER_ROLES = ['tutor', 'student', 'parent', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const LESSON_TYPES = ['individual', 'group', 'trial'] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export const LESSON_STATUSES = [
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const HOMEWORK_STATUSES = ['assigned', 'submitted', 'graded'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

export const MATERIAL_TYPES = [
  'pdf',
  'video',
  'audio',
  'image',
  'exercise',
  'link',
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const TRANSACTION_TYPES = ['topup', 'charge', 'refund', 'payout'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_PROVIDERS = [
  'stripe',
  'paypal',
  'manual',
  'westernunion',
  'moneygram',
] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

// Card/online providers settled automatically via webhook.
export const CHECKOUT_PROVIDERS = ['stripe', 'paypal'] as const;
export type CheckoutProvider = (typeof CHECKOUT_PROVIDERS)[number];

// Money-transfer methods settled manually: the student sends funds and submits
// a reference (MTCN), then an admin confirms receipt.
export const OFFLINE_PROVIDERS = ['westernunion', 'moneygram'] as const;
export type OfflineProvider = (typeof OFFLINE_PROVIDERS)[number];

export const TRANSACTION_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const LEDGER_REASONS = [
  'topup',
  'charge',
  'refund',
  'adjustment',
] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];

export const INVOICE_STATUSES = ['draft', 'issued', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['email', 'telegram', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// --- Course content (Skyeng-like lesson system) ---

export const CONTENT_LEVELS = [
  'Beginner',
  'Elementary',
  'PreIntermediate',
  'Intermediate',
  'UpperIntermediate',
  'Advanced',
] as const;
export type ContentLevel = (typeof CONTENT_LEVELS)[number];

export const CONTENT_STATUSES = ['draft', 'published'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const PAGE_TYPES = [
  'grammar',
  'practice',
  'listening',
  'reading',
  'discussion',
  'essay',
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const TASK_TYPES = [
  'sentence_ordering',
  'word_matching',
  'gap_fill',
  'categorization',
  'multiple_choice',
  'audio',
  'essay',
  'discussion',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const GRADING_MODES = ['AUTO', 'MANUAL', 'COMPLETION'] as const;
export type GradingMode = (typeof GRADING_MODES)[number];

export const ASPECTS = [
  'Grammar',
  'Reading',
  'Listening',
  'Vocabulary',
  'Speaking',
  'Writing',
] as const;
export type Aspect = (typeof ASPECTS)[number];

export const ASSIGNMENT_KINDS = ['lesson', 'homework'] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

// --- AI generation (SPEC §7/§10) ---

export const GEN_TARGET_TYPES = ['COURSE', 'LESSON'] as const;
export type GenTargetType = (typeof GEN_TARGET_TYPES)[number];

export const GEN_STATUSES = ['generating', 'ready_for_review', 'approved', 'failed'] as const;
export type GenStatus = (typeof GEN_STATUSES)[number];
