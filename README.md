# LinguaDesk — платформа для онлайн-преподавания английского языка

> «Мини-офис репетитора» в одном окне: уроки, ученики, расписание, интерактивная
> доска, видеосвязь, домашние задания, оплата и аналитика — без Zoom, Miro и Google Docs.

Этот репозиторий содержит **проектную документацию** (архитектура, схема БД,
пользовательские сценарии, UX/UI основных экранов, план и бюджет MVP) и **рабочий
MVP-модуль** (бэкенд-вертикаль: аутентификация, кабинеты, расписание/уроки + каркас
интернационализации фронтенда).

## Содержание репозитория

```
English-Platform/
├── README.md                  ← вы здесь
├── docs/                      ← проектная документация
│   ├── 01-architecture.md     ← архитектура системы
│   ├── 02-database.md         ← структура базы данных (ERD + описание)
│   ├── 03-user-scenarios.md   ← пользовательские сценарии (use cases / user flows)
│   ├── 04-ux-ui.md            ← UX/UI-макеты основных экранов (wireframes)
│   ├── 05-i18n.md             ← мультиязычность и RTL
│   ├── 06-mvp-plan.md         ← поэтапный план разработки MVP, сроки и бюджет
│   └── 07-security-compliance.md ← безопасность и GDPR
├── apps/
│   ├── api/                   ← рабочий MVP-бэкенд (NestJS + Prisma + JWT + i18n)
│   └── web/                   ← каркас фронтенда (Next.js + next-intl, 6 языков, RTL)
└── docker-compose.yml         ← локальная инфраструктура (Postgres, Redis)
```

## Ключевые продуктовые решения

| Область | Решение для MVP | Обоснование |
|---|---|---|
| Видеосвязь | **LiveKit Cloud** (managed SFU) | Быстрый выход на MVP, минимум DevOps; группы до 20 чел., запись, шумоподавление «из коробки». Позже — self-host для экономии на масштабе. |
| Платежи | **Stripe + PayPal** | Покрывают Германию, Францию, Нидерланды, UK. Локальные провайдеры (Тунис/СНГ) — после MVP за абстракцией `PaymentProvider`. |
| Интерактивная доска | **tldraw / Konva + Yjs (CRDT)** поверх WebSocket | CRDT даёт надёжную совместную правку и оффлайн-слияние без серверных конфликтов. |
| Мультиязычность | **next-intl** (web) + **nestjs-i18n** (api) | Язык — свойство пользователя; интерфейс каждого участника независим. RTL для арабского. |

## Статус реализации (бэкенд)

| Фича из ТЗ | Статус | Где |
|---|---|---|
| 1–2. Кабинеты (репетитор/ученик) | ✅ бэкенд + фронтенд (логин + живой дашборд) | auth, users, lessons, crm, `apps/web` |
| 3. Интерактивная доска | ✅ бэкенд + canvas-клиент (real-time, snapshot) | `apps/api/src/board`, `apps/web` BoardCanvas |
| 4. Видеозвонки | ✅ токены LiveKit + видео-клиент (камера/экран/чат) | `apps/api/src/video`, `apps/web` VideoRoom/LessonRoom |
| 5. Управление уроками + бронирование | ✅ бэкенд + страница расписания | `apps/api/src/lessons`, `apps/web` ScheduleView |
| 6. Домашние задания | ✅ | `apps/api/src/homework` |
| 7. Оплата (Stripe/PayPal, ledger, инвойсы) | ✅ бэкенд + страница оплаты | `apps/api/src/billing`, `apps/web` BillingView |
| 8. CRM | ✅ | `apps/api/src/crm` |
| 9. Учебные материалы | ✅ | `apps/api/src/materials` |
| 10. Аналитика | ✅ | `apps/api/src/analytics` |
| 11. Мультиязычность + RTL | ✅ | `apps/web`, `apps/api` i18n |
| Уведомления (email/Telegram/in-app, по локали) | ✅ in-app + Telegram-доставка + воркер | `apps/api/src/notifications` |
| Кабинеты (фронтенд-страницы) | ✅ дашборд, расписание, ученики, ДЗ, материалы, оплата, аналитика, доска+видео | `apps/web` |

Покрытие тестами бэкенда: **7 unit + 58 e2e**, всё зелёное. Оба приложения
(`apps/api`, `apps/web`) собираются.

### Что требует только конфигурации (без кода)
- **Реальное видео LiveKit**: задать `LIVEKIT_URL` / `LIVEKIT_API_KEY` /
  `LIVEKIT_API_SECRET` от проекта LiveKit Cloud — клиент и выдача токенов готовы.
- **Запись уроков и шумоподавление**: включаются на стороне LiveKit (egress +
  Krisp), фронтенд-кнопки уже в составе LiveKit-компонента.
- **Telegram-бот**: задать `TELEGRAM_BOT_TOKEN`; пользователи привязывают чат
  через `POST /notifications/telegram/link`.
- **Email**: подключить SMTP-провайдера (Postmark/Resend) в воркере dispatch.

## Деплой (production)

Готовый к развёртыванию вид: **Dockerfile** для каждого приложения,
**`docker-compose.prod.yml`** (Postgres + Redis + API + Web) и **CI/CD** на
GitHub Actions.

```bash
# 1. Заполнить переменные окружения (секреты, домены, ключи интеграций)
cp .env.prod.example .env.prod
#   - сгенерировать JWT-секреты: openssl rand -hex 32
#   - NEXT_PUBLIC_API_URL и CORS_ORIGIN — публичные URL фронтенда/бэкенда

# 2. Собрать и поднять весь стек
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Web  -> http://localhost:3000
# API  -> http://localhost:3001/api/v1/health
```

Особенности production-сборки:
- **API-образ** переключает Prisma-датасорс на **PostgreSQL** (репозиторий по
  умолчанию использует SQLite для dev/тестов), при старте синхронизирует схему
  (`prisma db push`; для истории миграций замените на `prisma migrate deploy`).
- **Web-образ** — Next.js **standalone** (минимальный самодостаточный сервер).
  `NEXT_PUBLIC_API_URL` инлайнится на этапе сборки (это публичный URL API).
- **CORS** на API настраивается через `CORS_ORIGIN` (список доменов).

CI/CD (`.github/workflows/`):
- `ci.yml` — на каждый push/PR: сборка + тесты API (7 unit + 58 e2e на SQLite),
  typecheck + build Web.
- `docker.yml` — на `main`: сборка и публикация образов API/Web в GHCR.

> ⚠️ Образы не собирались в этой песочнице (нет docker-демона), но Dockerfile'ы
> следуют стандартным паттернам; локальные `npm run build` для обоих приложений
> и `docker compose config` проходят. Перед первым деплоем прогоните
> `docker compose -f docker-compose.prod.yml --env-file .env.prod build`.

## Быстрый старт (MVP-модуль)

```bash
# 1. Инфраструктура (опционально для прод-режима на Postgres)
docker compose up -d            # Postgres + Redis

# 2. Бэкенд (порт 3001, чтобы не конфликтовать с фронтендом на 3000)
cd apps/api
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push             # создать схему в SQLite dev.db
npm run seed                    # демо-данные (репетитор + ученики разных локалей)
PORT=3001 npm run start:dev     # http://localhost:3001/api/v1/health

# 3. Тесты
npm test                        # unit (7)
DATABASE_URL="file:./test.db" npm run test:e2e   # e2e (56)

# 4. Фронтенд
cd ../web
cp .env.example .env.local      # NEXT_PUBLIC_API_URL -> http://localhost:3001/api/v1
npm install
npm run dev                     # http://localhost:3000  (вход: tutor@example.com / Password123!)
```

Подробности — в `apps/api/README.md` и `docs/`.
