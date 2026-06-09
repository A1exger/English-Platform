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

export const PAYMENT_PROVIDERS = ['stripe', 'paypal', 'manual'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const NOTIFICATION_CHANNELS = ['email', 'telegram', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
