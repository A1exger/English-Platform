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
| 7. Оплата (Stripe/PayPal + Western Union/MoneyGram, ledger, инвойсы) | ✅ бэкенд + страница оплаты | `apps/api/src/billing`, `apps/web` BillingView |
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

Готовый к развёртыванию вид: **Dockerfile** на каждое приложение,
**`docker-compose.prod.yml`** (Postgres + Redis + API + Web), **Caddy** с
авто‑HTTPS (`docker-compose.caddy.yml`), **миграции Prisma** и **CI/CD** на
GitHub Actions. Особенности:
- **API‑образ** использует **PostgreSQL** и применяет миграции
  (`prisma migrate deploy`) при старте; healthcheck по `/api/v1/health`.
- **Web‑образ** — Next.js **standalone**; `NEXT_PUBLIC_API_URL` инлайнится при
  сборке (публичный URL API).
- **CORS** — через `CORS_ORIGIN`. Саморегистрация админов запрещена (см. ниже).

### Развёртывание на VPS (Docker Compose)

```bash
# 0. Установить Docker
curl -fsSL https://get.docker.com | sh

# 1. Получить код и заполнить секреты
git clone <repo> && cd English-Platform && git checkout main
cp .env.prod.example .env.prod && nano .env.prod
#   JWT_ACCESS_SECRET / JWT_REFRESH_SECRET = openssl rand -hex 32
#   NEXT_PUBLIC_API_URL, CORS_ORIGIN — публичные URL (или http://IP:3001/api/v1
#   и http://IP:3000 для теста по IP)

# 2. Поднять стек (миграции применятся автоматически при старте API)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
#   Web -> http://<IP>:3000 ,  API -> http://<IP>:3001/api/v1/health

# 3. Создать админа и (опц.) демо-данные — разово
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api npx prisma db seed
#   admin@example.com / tutor@example.com / Password123!  (СМЕНИТЕ пароли!)
```

### HTTPS и домен (один домен: сайт + API под /api)

Направьте `englishsparkstudio.com` (и `www`) на IP сервера, заполните
`DOMAIN`/`ACME_EMAIL`/`NEXT_PUBLIC_API_URL`/`CORS_ORIGIN` в `.env.prod`
(см. `.env.prod.example`) и добавьте Caddy:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml \
  --env-file .env.prod up -d --build
# Caddy сам выпустит сертификаты Let's Encrypt и маршрутизирует
# /api/*, /uploads/*, /socket.io/* -> API, остальное -> фронтенд.
# Закройте порты 3000/3001 в фаерволе.
```
Stripe‑webhook: `https://englishsparkstudio.com/api/v1/billing/webhook/stripe`.
Подробный пошаговый рунбук — в `DEPLOY.md` (§7).

### ⚠️ Сервер 1 CPU / 1 ГБ RAM

Сборка Next.js на 1 ГБ почти наверняка упадёт по памяти. Варианты:

1. **Добавить swap** (быстро, для теста):
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
2. **Не собирать на сервере, а тянуть готовые образы из GHCR** (рекомендуется):
   CI (`docker.yml`) собирает образы при пуше в `main`. На сервере используйте
   `image: ghcr.io/<owner>/<repo>-api:latest` и `...-web:latest` вместо `build:`
   (правка двух сервисов в compose) и `docker compose ... pull && up -d`.

Для роста: вынести Postgres/Redis в managed‑сервисы и увеличить RAM (2–4 ГБ).

### CI/CD (`.github/workflows/`)
- `ci.yml` — на каждый push/PR: сборка + тесты API (**7 unit + 59 e2e**),
  typecheck + build Web.
- `docker.yml` — на `main`: сборка и публикация образов API/Web в **GHCR**.

> ⚠️ Образы не собирались в этой песочнице (нет docker‑демона), но Dockerfile'ы
> следуют стандартным паттернам; `npm run build` обоих приложений, генерация
> Postgres‑миграций и `docker compose config` проверены. CI соберёт образы при
> пуше в `main`.

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
