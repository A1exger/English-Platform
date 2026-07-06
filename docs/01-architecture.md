# 01 — Архитектура системы

## 1. Принципы

- **Модульный монолит на старте, готовность к выделению сервисов.** Бэкенд — один
  NestJS-процесс с чёткими модулями (auth, lessons, billing, realtime, materials,
  notifications). Тяжёлые/изолированные нагрузки (видео, доска, AI) изначально живут
  за отдельными адаптерами и могут быть вынесены в самостоятельные сервисы без
  переписывания бизнес-логики.
- **Real-time как первоклассная подсистема.** Совместная доска, чат, статусы
  присутствия и сигналинг видео работают через WebSocket-шлюз и Redis Pub/Sub, что
  позволяет горизонтально масштабировать gateway-инстансы.
- **Интерфейс каждого пользователя независим по языку.** Локаль — атрибут
  пользователя, а не сессии урока. Совместный урок (видео + доска) language-agnostic.
- **Provider-абстракции.** Платежи, видео-SFU, отправка email/Telegram и AI скрыты
  за интерфейсами — это снижает vendor lock-in и упрощает выход на новые рынки.

## 2. Контекстная диаграмма (C4 — Level 1)

```
                          ┌───────────────────────────────────────────┐
                          │                LinguaDesk                   │
   Репетитор ───────────► │  Web (Next.js PWA) ─┬─ REST/GraphQL ──┐     │
   Ученик    ───────────► │  Mobile (RN, позже) │                 ▼     │
   Родитель  ───────────► │                     │            NestJS API │
                          │                     └─ WebSocket ─► RT Gateway│
                          └───────┬───────────┬───────────┬─────────────┘
                                  │           │           │
              ┌───────────────────┘           │           └───────────────────┐
              ▼                                ▼                               ▼
        LiveKit Cloud                   Stripe / PayPal                 Telegram Bot API
        (видео SFU,                     (эквайринг,                     (уведомления)
         запись)                         вебхуки)                       + SMTP/Email (Postmark)
              ▲                                ▲
              └─────────── AI-сервисы (LLM: генерация упражнений, проверка письма, анализ речи)
```

## 3. Логическая архитектура (C4 — Level 2, контейнеры)

```
┌──────────────────────── CLIENT ────────────────────────┐
│  Next.js (App Router, RSC) + PWA                         │
│   • UI-kit (Tailwind + shadcn/ui)                        │
│   • next-intl (en/ru/de/fr/nl/ar, RTL)                   │
│   • TanStack Query (server state) + Zustand (UI state)   │
│   • Whiteboard client (tldraw/Konva + Yjs CRDT)          │
│   • LiveKit JS SDK (видео/экран/запись)                  │
└───────────────┬───────────────────────┬─────────────────┘
                │ HTTPS (REST /api/v1)   │ WSS (socket.io / y-websocket)
                ▼                        ▼
┌──────────────────────── BACKEND (NestJS) ───────────────┐
│  HTTP layer            │  Realtime layer                 │
│  • AuthModule (JWT,    │  • BoardGateway (Yjs sync)      │
│    OAuth Google/MS)    │  • PresenceGateway              │
│  • Users/CRM           │  • ChatGateway                  │
│  • LessonsModule       │  • Signaling/Token issuance     │
│  • BillingModule       │    для LiveKit                  │
│  • MaterialsModule     │                                 │
│  • HomeworkModule      │  Cross-cutting:                 │
│  • AnalyticsModule     │  • nestjs-i18n                  │
│  • NotificationsModule │  • Guards/RBAC, RateLimit       │
│  • AiModule (adapter)  │  • Audit log, OpenTelemetry     │
└───────┬─────────┬──────────────┬─────────────┬──────────┘
        │         │              │             │
        ▼         ▼              ▼             ▼
   PostgreSQL   Redis        Object Storage   Job Queue
   (Prisma)   (cache,        (S3/R2:          (BullMQ on Redis:
              pub/sub,        материалы,       напоминания,
              presence,       записи уроков,   вебхуки,
              rate-limit)     снапшоты доски)  AI-задачи, email)
```

## 4. Технологический стек

### Frontend
- **Next.js 14+ (App Router, React Server Components)**, **TypeScript**.
- **Tailwind CSS + shadcn/ui** — дизайн-система, тёмная/светлая тема, RTL.
- **next-intl** — i18n и форматирование дат/чисел/валют по локали.
- **TanStack Query** — серверное состояние; **Zustand** — локальный UI-state.
- **PWA** (next-pwa / Workbox): офлайн-доступ к материалам, push-уведомления.
- Доска: **tldraw** (быстрый MVP) или **Konva.js** (если нужен полный контроль) +
  **Yjs** для CRDT-синхронизации.
- Видео: **LiveKit Components React**.

### Backend
- **NestJS (Node.js, TypeScript)** — модульный монолит.
- **PostgreSQL 16 + Prisma** — основная БД и ORM.
- **Redis** — кэш, pub/sub для масштабирования WS, presence, rate-limit, очереди.
- **BullMQ** — фоновые задачи (напоминания, списания, вебхуки, AI, email).
- **Socket.IO** (чат/presence) и **y-websocket** (доска) — реальное время.
- **nestjs-i18n** — локализация серверных сообщений, email, уведомлений.

### Инфраструктура и DevOps
- **Docker** + **docker-compose** (локально), **Kubernetes** или managed-PaaS
  (Render/Railway/Fly.io на старте) — прод.
- **Object Storage**: AWS S3 или Cloudflare R2 (материалы, записи, снапшоты доски).
- **CI/CD**: GitHub Actions (lint, typecheck, test, build, миграции, деплой).
- **Наблюдаемость**: OpenTelemetry → Grafana/Tempo, Sentry (ошибки), structured logs.

### Внешние сервисы
- **LiveKit Cloud** — видеоконференции (SFU), запись, шумоподавление.
- **Stripe + PayPal** — платежи; вебхуки → BillingModule.
- **Postmark/Resend** — транзакционный email; **Telegram Bot API** — уведомления.
- **LLM-провайдер (Claude / Anthropic API)** — AI-функции (см. §8).

## 5. Real-time архитектура

| Подсистема | Транспорт | Состояние | Масштабирование |
|---|---|---|---|
| Интерактивная доска | y-websocket (Yjs CRDT) | Yjs doc в памяти gateway + периодический снапшот в Postgres/S3 | Шардирование по `boardId`; sticky-сессии или Redis-адаптер |
| Чат урока | Socket.IO | Сообщения в Postgres, лента в Redis | Redis pub/sub adapter |
| Presence/статусы | Socket.IO | Redis (TTL-ключи) | Redis pub/sub |
| Видео | LiveKit (WebRTC/SFU) | Управляется LiveKit Cloud | Managed |

**Поток входа в урок:** клиент → `POST /lessons/:id/join` → API проверяет права и
выдаёт (а) LiveKit access token (room = lessonId), (б) board token, (в) WS-токен
чата. Один экран — три синхронизированных канала, но право доступа выдаёт только API.

## 6. Безопасность (обзор; детали — `07-security-compliance.md`)
- **JWT** access (короткий TTL) + refresh (ротация, хранится хэш в БД).
- **OAuth 2.0** Google / Microsoft.
- **RBAC**: роли `tutor | student | parent | admin`; guard'ы на уровне эндпоинтов.
- Шифрование в покое (БД, S3) и в транзите (TLS). Секреты — в vault/secret manager.
- **GDPR**: согласия, экспорт и удаление данных, журнал доступа, data residency (EU).

## 7. Стратегия масштабирования
1. **MVP**: монолит API + один RT-gateway + managed Postgres/Redis + LiveKit Cloud.
2. **Рост**: вынести RT-gateway в отдельный пул (sticky + Redis adapter); read-replica
   Postgres для аналитики; CDN для материалов и записей.
3. **Масштаб**: выделить из монолита Billing и Realtime в сервисы; перейти на
   self-hosted LiveKit (SFU-кластер) при достаточном объёме минут; партиционирование
   таблиц `lesson`, `transaction`, `notification`.

## 8. AI-подсистема (адаптер `AiModule`)
Асинхронные задачи через BullMQ, провайдер за интерфейсом `AiProvider`:
- генерация упражнений по уровню CEFR ученика;
- автоматическая проверка письменных работ (грамматика, фидбэк);
- анализ произношения (speech-to-text + оценка);
- генерация плана урока. Результаты кэшируются, дорогие операции — фоновые.
