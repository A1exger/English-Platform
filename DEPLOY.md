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

## 7. Домен + HTTPS (один домен: englishsparkstudio.com)

Фронтенд и API живут на **одном домене**: сайт — `https://englishsparkstudio.com`,
API — `https://englishsparkstudio.com/api/...`. Caddy маршрутизирует
`/api/*`, `/uploads/*`, `/socket.io/*` в API‑контейнер, остальное — во фронтенд.

1. DNS у регистратора — A‑записи на IP сервера:
   ```
   englishsparkstudio.com       A  <IP сервера>
   www.englishsparkstudio.com   A  <IP сервера>   (опционально; редиректится на apex)
   ```
   Проверка: `dig +short englishsparkstudio.com`.
2. В `.env.prod`:
   ```ini
   DOMAIN=englishsparkstudio.com
   ACME_EMAIL=ваш-email@пример.com
   NEXT_PUBLIC_API_URL=https://englishsparkstudio.com/api/v1
   CORS_ORIGIN=https://englishsparkstudio.com
   ```
3. Открыть порты 80/443 (нужны для сертификата и HTTPS):
   ```bash
   sudo ufw allow 80,443/tcp && sudo ufw allow 22/tcp && sudo ufw enable
   ```
4. Поднять с Caddy (сам выпустит и будет продлевать сертификат Let's Encrypt).
   `--build` обязателен: `NEXT_PUBLIC_API_URL` запекается в веб‑образ:
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml \
     --env-file .env.prod up -d --build
   ```
5. Закрыть прямые порты приложений (трафик только через Caddy):
   ```bash
   sudo ufw deny 3000/tcp && sudo ufw deny 3001/tcp
   ```
6. Проверка:
   - `https://englishsparkstudio.com` — сайт с замком 🔒
   - `https://englishsparkstudio.com/api/v1/health` → `{"status":"ok"}`
7. Stripe → Webhooks: `https://englishsparkstudio.com/api/v1/billing/webhook/stripe`.

Если сертификат не выпускается — почти всегда DNS ещё не указывает на сервер
или порт 80 закрыт/занят. Логи: `docker compose ... logs caddy`.

---

## 8. Подключение интеграций (по мере получения ключей)

Допишите в `.env.prod` и примените `... up -d` (контейнеры пересоздадутся):

| Что | Переменные |
|---|---|
| Видео (LiveKit Cloud) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Карты | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_WEBHOOK_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (см. 8.1) |
| Генерация уроков (AI) | `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — или `ANTHROPIC_API_KEY` |

### 8.1. Почта: письмо не пришло — что проверить

Уведомления не отправляются в момент события: они складываются в очередь, а
фоновый диспетчер разбирает её **раз в 30 секунд**. Минуту подождать — нормально.

Начиная с этой версии результат доставки записывается честно: `sent` — провайдер
принял письмо, `skipped` — отправлять было некуда (SMTP не настроен, нет адреса,
Telegram не привязан), `failed` — попытка была и сорвалась. Причина лежит в
колонке `error`. Раньше всё помечалось `sent`, и «письмо не дошло» нельзя было
отличить от «письмо ушло».

Быстрее всего спросить сам почтовый сервер — команда логинится в него прямо
из контейнера и печатает его собственный ответ:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node -e "
const nm=require('nodemailer');
nm.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}).verify()
 .then(() => console.log('SMTP OK'))
 .catch(e => console.log('SMTP FAILED:', e.message));
"
```

Что означает ответ:

| Ответ | Что это значит |
|---|---|
| `SMTP OK` | Логин проходит — дело не в почтовом сервере, смотрите очередь ниже |
| `535-5.7.8 Username and Password not accepted` | Нужен *пароль приложения* Google (при включённой двухфакторке), и записывать его надо **без пробелов**, которыми Google его показывает |
| `Connection timeout` / `ETIMEDOUT` | Закрыт исходящий порт. Многие хостинги (Hetzner, DigitalOcean, Oracle) блокируют исходящий SMTP по умолчанию или включают блокировку позже — это самая частая причина, когда почта работала и перестала без единой правки в коде. Решается обращением в поддержку хостинга либо переходом на HTTP‑API рассылки (Resend, Postmark) |
| `self-signed certificate` или другая TLS‑ошибка | Перепутана пара порт/шифрование — см. конец раздела |

```bash
# 1. Что произошло с последними уведомлениями:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select channel, \"templateKey\", status, error, \"createdAt\" from \"Notification\" order by \"createdAt\" desc limit 10;"'

# 2. Что сказал почтовый сервер:
docker compose -f docker-compose.prod.yml --env-file .env.prod logs api | grep -i "Email send failed"

# 3. Работает ли диспетчер вообще (пусто = выключен):
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api printenv NOTIFY_DISPATCH
```

Имя пользователя и базы подставляются **внутри контейнера** из его же
переменных (`sh -c '…"$POSTGRES_USER"…'`) — так команда работает и при
значениях по умолчанию (`linguadesk`), и если вы задали свои в `.env.prod`.

`NOTIFY_DISPATCH=off` полностью выключает рассылку — в проде эта переменная
должна быть **пустой**.

`SMTP_PORT=587` идёт с `SMTP_SECURE=` (пусто, STARTTLS), `465` — с
`SMTP_SECURE=true`. Перепутанная пара выглядит как зависание при отправке.

### 8.2. AI: какую модель ставить и что делать, когда она «пропала»

Генерация ходит в любой провайдер с OpenAI‑совместимым API. Ключ и **имя
модели** живут только в `.env.prod` — в коде их нет:

```
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_MODEL=openai/gpt-oss-120b
```

**Важно:** контейнер читает `.env.prod` (тот файл, который передан в
`--env-file`), а не `apps/api/.env`. Правка `apps/api/.env` на прод не влияет.

Провайдеры снимают модели по своему графику — Groq убрал
`llama-3.3-70b-versatile` в июне 2026. Ключ и кабинет при этом в полном порядке,
а генерация падает с «model does not exist or you do not have access to it».

Что проверить по шагам:

```bash
# 1. Что реально видит контейнер (а не что написано в файле):
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api printenv AI_MODEL

# 2. Какие модели доступны вашему ключу:
curl -s -H "Authorization: Bearer $AI_API_KEY" "$AI_BASE_URL/models" | grep -o '"id":"[^"]*"'

# 3. Поправить .env.prod и ПЕРЕСОЗДАТЬ контейнер (перезапуска мало —
#    переменные окружения подставляются в момент создания):
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate api
```

Если шаг 1 печатает старое имя — значит правка ушла не в тот файл или контейнер
не пересоздан.

Красная надпись «Generation failed …» в конструкторе курсов — это **последняя
попытка**, а не текущее состояние: она хранится в записи задания и висит, пока не
появится новая. Кнопка «Скрыть» рядом с ней убирает её, курс и уроки при этом не
трогаются.

### 8.3. Разовая чистка: упражнения с названием вида `exercises.*`

Название типа упражнения берётся из файлов локалей тем же ключом, что и сам тип
(`t(type)`), и этот же вызов подставляется как заголовок, если репетитор оставил
поле пустым. Ключа `exercises.true_false` не было ни в одном из шести языков, и
упражнение «верно/неверно», созданное без заголовка, сохранялось в базу строкой
`exercises.true_false` — её видел и ученик. Ключ добавлен, тест держит остальные
типы, но **старые записи задним числом не переименовываются**.

Посмотреть, есть ли такие (пустой ответ — всё чисто):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
select id, type, title, "createdAt"
  from "Exercise"
 where title like 'exercises.%'
 order by "createdAt";
SQL
```

Переименовать найденные (`(copy)` у дубликатов сохраняется):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
update "Exercise"
   set title = replace(title, 'exercises.true_false', 'Верно или неверно')
 where title like 'exercises.true_false%';
SQL
```

Ответ `UPDATE 0` означает, что чинить нечего. Если проверка показала другой
префикс, а не `exercises.true_false`, — это **второй** потерянный ключ, и менять
его этим запросом не надо: лучше найти отсутствующий ключ в `messages/*.json`.

Выданные домашки править не нужно: `ExerciseInstance` заголовок не хранит, а
читает из `Exercise`, так что одна правка исправляет и уже выданные задания.
Перед `update` имеет смысл снять бэкап (см. ниже).

Имя пользователя и базы подставляются внутри контейнера из его же переменных,
`-T` нужен, чтобы SQL прошёл через stdin.

### 8.4. Разметка текста в уже созданных уроках

Страница урока теперь рендерится как статья: пустая строка — абзац, `#` в начале
строки — заголовок, `**жирный**` и `*курсив*`. Уроки, написанные раньше, от этого
сами не меняются — текст в них лежит как был. Эта команда предлагает разметку для
них.

**Сначала посмотреть, что она хочет сделать** (ничего не пишет):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  node dist/scripts/remark-pages.js
```

Она печатает по каждой странице «было / стало» и сводку: сколько страниц уже с
абзацами, сколько с одиночными переносами, сколько одним куском. Если
предложенное устраивает:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  node dist/scripts/remark-pages.js --apply
```

Команду можно запускать повторно: второй прогон ничего не меняет.

**Что она делает и чего намеренно не делает.** Два правила — это чтение того, что
уже есть в данных, а не догадка:

- одиночный перенос строки, который поставил автор, становится разделителем
  абзацев (сейчас он рисуется как перенос внутри абзаца);
- слова из словаря самого урока (`Wordlist`) выделяются жирным при первом
  появлении в тексте — это ровно те слова, которым урок учит.

Одно правило — эвристика: короткая строка без точки на конце, под которой лежит
абзац хотя бы в 80 символов, считается заголовком раздела. Вопрос в конце
допускается: заголовок статьи часто им и является («How do new words appear?»).
Плата за это — отдельно стоящий вопрос в конце абзаца может быть принят за
заголовок, поэтому команда и показывает изменения до записи.

А **текст, пришедший одним неразрывным куском, не трогается совсем**. Разбить
прозу по границам предложений — значит угадывать, где заканчивается мысль, и
ошибка здесь хуже, чем сплошной текст. Такие страницы команда перечисляет отдельно:
их нужно открыть в конструкторе курсов и расставить пустые строки руками.

Перед `--apply` имеет смысл снять бэкап (см. ниже) — команда перезаписывает
`LessonPage.text`.

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
