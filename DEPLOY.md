# Деплой LinguaDesk на сервер (Docker Compose)

Рассчитано на VPS **2 CPU / 4 ГБ RAM** (хватает, чтобы собирать образы прямо на
сервере). Стек: Postgres + Redis + API (NestJS) + Web (Next.js), опционально
Caddy с авто‑HTTPS.

---

## 0. Подготовка сервера (один раз)

```bash
# Docker + compose-plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker   # чтобы docker без sudo
docker version && docker compose version          # проверка
```

## 1. Получить код

Репозиторий приватный, поэтому нужен доступ. Проще всего — Personal Access Token
(GitHub → Settings → Developer settings → Tokens, scope `repo`):

```bash
git clone https://<USERNAME>:<TOKEN>@github.com/A1exger/English-Platform.git
cd English-Platform

# PR ещё не влит в main — берём ветку с кодом:
git checkout claude/focused-archimedes-r53ff4
# (после мерджа PR #1 в main можно работать с main)
```

## 2. Заполнить переменные окружения

```bash
cp .env.prod.example .env.prod
nano .env.prod
```
Минимум для старта (тест по IP):
```ini
POSTGRES_PASSWORD=<надёжный_пароль>
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>

# <IP> — публичный IP сервера
NEXT_PUBLIC_API_URL=http://<IP>:3001/api/v1
CORS_ORIGIN=http://<IP>:3000

# Кому слать Western Union / MoneyGram (показывается ученику в инструкции)
TRANSFER_RECEIVER_NAME=Ваше Имя
TRANSFER_RECEIVER_COUNTRY=Germany
```
> `NEXT_PUBLIC_API_URL` «запекается» в веб‑образ при сборке. Если позже перейдёте
> на домен — поменяйте значение и **пересоберите** web (см. шаг 7).

## 3. Запустить стек

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Миграции БД применяются автоматически при старте API.

## 4. Проверить, что всё поднялось

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl http://localhost:3001/api/v1/health     # -> {"status":"ok"}
```
Логи при необходимости: `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api`

## 5. Создать админа и демо‑данные (разово)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api npx prisma db seed
```
Создаются `admin@example.com`, `tutor@example.com`, ученики — пароль
`Password123!`. **Сразу смените пароли** (зайдите под ними и поменяйте, либо
удалите демо‑аккаунты).

## 6. Открыть приложение

- Web: `http://<IP>:3000`  (вход: tutor@example.com / Password123!)
- API: `http://<IP>:3001/api/v1/health`

На этом этапе уже работают: кабинеты, расписание, доска (real‑time), оплата
(баланс/пакеты/инвойсы + Western Union/MoneyGram), CRM, материалы, ДЗ,
аналитика, in‑app уведомления.

---

## 7. Домены + HTTPS (для боевого запуска)

1. Направьте `app.ВАШ_ДОМЕН` и `api.ВАШ_ДОМЕН` (A‑записи) на IP сервера.
2. В `.env.prod`:
   ```ini
   APP_DOMAIN=app.ВАШ_ДОМЕН
   API_DOMAIN=api.ВАШ_ДОМЕН
   ACME_EMAIL=you@example.com
   NEXT_PUBLIC_API_URL=https://api.ВАШ_ДОМЕН/api/v1
   CORS_ORIGIN=https://app.ВАШ_ДОМЕН
   ```
3. Поднять с Caddy (выпустит сертификаты Let's Encrypt сам) и пересобрать web:
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml \
     --env-file .env.prod up -d --build
   ```
4. Закройте порты 3000/3001 в фаерволе (наружу только 80/443):
   ```bash
   sudo ufw allow 80,443/tcp && sudo ufw allow 22/tcp && sudo ufw enable
   ```
5. Stripe → Webhooks: `https://api.ВАШ_ДОМЕН/api/v1/billing/webhook/stripe`.

---

## 8. Подключение интеграций (по мере получения ключей)

Допишите в `.env.prod` и примените `... up -d` (контейнеры пересоздадутся):

| Что | Переменные |
|---|---|
| Видео (LiveKit Cloud) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Карты | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_WEBHOOK_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Email | подключить SMTP‑провайдера в воркере dispatch (Postmark/Resend) |

---

## Обновление версии

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Бэкап базы

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  pg_dump -U linguadesk linguadesk > backup_$(date +%F).sql
```

## Альтернатива для слабого сервера (не нужно при 4 ГБ)

Если не хотите собирать на сервере — используйте готовые образы из GHCR
(публикуются при пуше в `main`): добавьте `-f docker-compose.ghcr.yml`,
сначала `... pull`, затем `... up -d --no-build`. Перед этим задайте в GitHub
переменную Actions `NEXT_PUBLIC_API_URL` (публичный URL API), т.к. она
«запекается» в web‑образ на этапе CI.
