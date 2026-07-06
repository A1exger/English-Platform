# 02 — Структура базы данных

СУБД: **PostgreSQL 16**, ORM: **Prisma**. Денежные суммы хранятся в **минимальных
единицах валюты (центах) как `Int`** во избежание ошибок округления. Все таблицы
имеют `id` (cuid/uuid), `createdAt`, при необходимости `updatedAt`. JSON-поля — для
гибких структур (payload уведомлений, снапшот доски, правила повторения).

> Канонический машинно-читаемый источник схемы — `apps/api/prisma/schema.prisma`.
> Там, где в проде используется `enum`/`Json`, в dev/test-сборке на SQLite
> применяются `String`-поля (допустимые значения перечислены ниже).

## 1. ER-диаграмма (основные связи)

```
User ─1:1─ TutorProfile ─1:N─ Lesson ─1:N─ LessonParticipant ─N:1─ StudentProfile
 │           │  │  │             │  │
 │           │  │  │             │  └─1:N─ Attendance
 │           │  │  │             └─1:N─ Homework ─1:N─ HomeworkSubmission
 │           │  │  └─1:N─ Package ─1:N─ StudentPackage ─N:1─ StudentProfile
 │           │  └─1:N─ TutorNote ─N:1─ StudentProfile
 │           └─M:N (TutorStudent)─ StudentProfile
 │
 ├─1:1─ StudentProfile (parentUserId → User, self-ref для родителя)
 ├─1:N─ RefreshToken
 ├─1:N─ Transaction
 └─1:N─ Notification

Material ─N:1─ User (owner)
Board ─1:1─ Lesson ; BoardSnapshot ─N:1─ Board
RecurrenceRule ─1:N─ Lesson
Invoice ─N:1─ User
```

## 2. Таблицы и поля

### Идентичность и роли

**user**
| поле | тип | описание |
|---|---|---|
| id | uuid PK | |
| email | text unique | логин |
| password_hash | text | bcrypt; null при OAuth-only |
| role | enum | `tutor \| student \| parent \| admin` |
| first_name, last_name | text | |
| locale | text (default `en`) | язык интерфейса/уведомлений (`en,ru,de,fr,nl,ar`) |
| timezone | text (default `UTC`) | для расписания и напоминаний |
| avatar_url | text? | |
| is_active | bool (default true) | |
| created_at, updated_at | timestamptz | |

**refresh_token** — id, user_id→user, token_hash, expires_at, revoked(bool), created_at.
Используется для ротации refresh-токенов и принудительного выхода.

**oauth_account** — id, user_id, provider(`google\|microsoft`), provider_user_id,
created_at. @@unique(provider, provider_user_id).

**tutor_profile** — id, user_id (unique)→user, headline?, bio?, hourly_rate_cents (int),
currency (default `EUR`).

**student_profile** — id, user_id (unique)→user, cefr_level? (`A1..C2`), goals?,
native_language?, parent_user_id?→user, balance_cents (int default 0).

**tutor_student** (связь M:N с метаданными) — id, tutor_profile_id, student_profile_id,
status(`active\|paused\|archived`), created_at. @@unique(tutor_profile_id, student_profile_id).

### Уроки и расписание

**recurrence_rule** — id, freq(`daily\|weekly\|monthly`), interval(int), byweekday(json),
until?(timestamptz), count?(int). (Совместимо с iCal RRULE.)

**lesson**
| поле | тип | описание |
|---|---|---|
| id | uuid PK | |
| tutor_profile_id | fk | владелец-репетитор |
| type | enum | `individual \| group \| trial` |
| title | text? | |
| starts_at, ends_at | timestamptz | хранятся в UTC |
| status | enum | `scheduled \| completed \| cancelled \| no_show` |
| price_cents | int | стоимость занятия |
| currency | text | |
| meeting_url | text? | ссылка/идентификатор комнаты LiveKit |
| board_id | fk? → board | связанная доска |
| recurrence_rule_id | fk? | для повторяющихся занятий |
| created_at, updated_at | | |

@@index(tutor_profile_id, starts_at) — выборка расписания.

**lesson_participant** — id, lesson_id→lesson, student_profile_id→student_profile,
booked_at. @@unique(lesson_id, student_profile_id). (Для индивидуальных — 1 запись,
для групп/пробных — до 20.)

**attendance** — id, lesson_id→lesson, user_id→user, status(`present\|absent\|late`),
joined_at?, left_at?. Источник статистики посещаемости и автосписаний.

### Домашние задания и прогресс

**homework** — id, lesson_id?→lesson, tutor_profile_id, student_profile_id, title,
description?, due_at?, status(`assigned\|submitted\|reviewed`), created_at.

**homework_submission** — id, homework_id→homework, content?, file_urls(json),
grade?(text/numeric), feedback?, submitted_at.

**progress_record** — id, student_profile_id, metric(`cefr\|vocabulary\|attendance\|custom`),
value(json), recorded_at. История прогресса для графиков в CRM.

### Учебные материалы

**material** — id, owner_user_id→user, type(`pdf\|video\|audio\|image\|exercise\|link`),
title, url?(S3), language?, folder_id?(self-ref через material_folder), created_at.

**material_folder** — id, owner_user_id, name, parent_id?(self-ref). Библиотека-дерево.

**lesson_template** — id, tutor_profile_id, name, board_snapshot(json), materials(json),
created_at. Шаблоны уроков для доски.

### Интерактивная доска

**board** — id, lesson_id (unique)?→lesson, latest_snapshot(json/jsonb), updated_at.
Текущее состояние (Yjs-снапшот). Большие бинарные снапшоты — в S3, в БД ссылка.

**board_snapshot** — id, board_id→board, snapshot(json), author_user_id, created_at.
История изменений (версии доски, откат).

### Биллинг

**package** (тариф) — id, tutor_profile_id→tutor_profile, name, lessons_count(int),
price_cents(int), currency, validity_days?(int), is_active(bool).

**student_package** (купленный пакет) — id, student_profile_id, package_id,
lessons_remaining(int), expires_at?, purchased_at, transaction_id?.

**transaction** — id, user_id→user, type(`topup\|charge\|refund\|payout`),
provider(`stripe\|paypal\|manual`), amount_cents(int), currency, status(`pending\|
succeeded\|failed\|refunded`), external_id?(id в Stripe/PayPal), metadata(json), created_at.
@@index(user_id, created_at).

**invoice** — id, user_id, number(unique), amount_cents, currency, status(`draft\|issued\|
paid\|void`), pdf_url?, locale, issued_at. Счета/чеки на языке пользователя.

**ledger_entry** (двойная запись для баланса) — id, account(`student_balance\|tutor_payout\|
platform_fee`), student_profile_id?, lesson_id?, amount_cents(+/−), reference_type,
reference_id, created_at. Баланс ученика = агрегат по ledger; источник истины для
автосписаний за проведённый урок.

### CRM и заметки

**tutor_note** — id, tutor_profile_id→tutor_profile, student_profile_id, body, created_at.
Приватные заметки репетитора о ученике (карточка ученика в CRM).

### Уведомления

**notification** — id, user_id→user, channel(`email\|telegram\|in_app`), template_key,
locale, payload(json), status(`queued\|sent\|failed\|read`), sent_at?, created_at.
Локаль фиксируется на момент постановки в очередь, чтобы письмо ушло на языке адресата.

**telegram_link** — id, user_id (unique), telegram_chat_id, linked_at. Привязка
Telegram-аккаунта для уведомлений.

### Системные

**audit_log** — id, actor_user_id?, action, entity_type, entity_id, ip, meta(json),
created_at. Для безопасности и GDPR.

**consent** — id, user_id, type(`tos\|privacy\|marketing`), granted(bool), version,
created_at. GDPR-согласия.

## 3. Ключевые инварианты и правила
- **Баланс ученика** не хранится «как число» как источник истины, а считается из
  `ledger_entry` (топап +, списание за урок −). Поле `balance_cents` в профиле —
  денормализованный кэш, обновляется транзакционно.
- **Автосписание**: при переводе `lesson.status → completed` создаётся `ledger_entry`
  (−price) и/или декремент `student_package.lessons_remaining` (атомарно в транзакции).
- **Часовые пояса**: все времена в UTC; преобразование в локальное TZ пользователя —
  на клиенте/при формировании уведомлений.
- **Мягкое удаление** (`deleted_at`) для сущностей с историей (lesson, material,
  user) ради GDPR-экспорта/аудита; жёсткое удаление — по запросу «right to be forgotten».

## 4. Индексы (минимум для MVP)
- `user(email)` unique; `lesson(tutor_profile_id, starts_at)`;
- `lesson_participant(student_profile_id)`; `transaction(user_id, created_at)`;
- `notification(status, channel)` для воркера рассылки;
- `attendance(lesson_id)`; `tutor_student(tutor_profile_id)`.
