# @linguadesk/web — фронтенд (каркас i18n)

Next.js 14 (App Router) + **next-intl**. Демонстрирует ключевое бизнес-требование:
**интерфейс каждого пользователя на своём языке** (6 языков) и **RTL** для арабского.

## Что реализовано
- Маршрутизация с локалью: `/en`, `/ru`, `/de`, `/fr`, `/nl`, `/ar`.
- Автоопределение языка по `Accept-Language` при первом входе (middleware) и
  сохранение выбора в cookie.
- Быстрое переключение языка без перезагрузки (`LanguageSwitcher`).
- RTL-раскладка для `ar` (`dir="rtl"` + логические CSS-свойства).
- Локализация текста, чисел, валют и процентов через `Intl` (next-intl `useFormatter`).
- Подключение к API: реальный логин (`/auth/login`), живой дашборд (`/auth/me`,
  `/lessons`), страница **расписания** (список + создание урока для репетитора),
  страница **оплаты** (баланс, пакеты, покупка через `/billing/checkout`,
  транзакции/счета; для репетитора — создание пакета).
- **Интерактивная доска** (`/lessons/:id/board`): canvas с рисованием от руки,
  ластиком, палитрой, очисткой и сохранением снапшота; real-time-синхронизация
  через Socket.IO-gateway бэкенда (`/board`), нормализованные координаты.
- Все строки — в `messages/<locale>.json`, ничего не захардкожено в компонентах.

## Запуск со стеком

```bash
cp .env.example .env.local      # NEXT_PUBLIC_API_URL -> http://localhost:3001/api/v1
# в apps/api: PORT=3001 npm run start:dev  (бэкенд)
npm run dev                     # вход: tutor@example.com / Password123!
```

## Запуск
```bash
npm install
npm run dev        # http://localhost:3000  → редирект на /en (или язык браузера)
npm run build      # production build
npm run typecheck  # проверка типов
```

## Добавление нового языка
1. Добавьте код в `locales` в `src/i18n/routing.ts` (и в `rtlLocales`, если RTL).
2. Создайте `messages/<locale>.json`.
Бизнес-логика при этом не меняется.

## Структура
```
src/
  i18n/routing.ts     ← список локалей, RTL, навигация
  i18n/request.ts     ← загрузка ресурсов по локали
  middleware.ts       ← автоопределение + префикс локали
  app/[locale]/       ← локализованные маршруты
  components/LanguageSwitcher.tsx
messages/             ← en, ru, de, fr, nl, ar
```
