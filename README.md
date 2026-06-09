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
| 3. Интерактивная доска | 🟡 бэкенд (persist + real-time relay) | `apps/api/src/board` |
| 4. Видеозвонки | 🟡 токены LiveKit | `apps/api/src/video` |
| 5. Управление уроками + бронирование | ✅ | `apps/api/src/lessons` |
| 6. Домашние задания | ✅ | `apps/api/src/homework` |
| 7. Оплата (Stripe/PayPal, ledger, инвойсы) | ✅ | `apps/api/src/billing` |
| 8. CRM | ✅ | `apps/api/src/crm` |
| 9. Учебные материалы | ✅ | `apps/api/src/materials` |
| 10. Аналитика | ✅ | `apps/api/src/analytics` |
| 11. Мультиязычность + RTL | ✅ | `apps/web`, `apps/api` i18n |
| Уведомления (email/Telegram/in-app, по локали) | ✅ in-app + воркер | `apps/api/src/notifications` |

Покрытие тестами бэкенда: **7 unit + 56 e2e**, всё зелёное.

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
