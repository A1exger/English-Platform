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
- Демо-экраны: лендинг с формой входа и дашборд репетитора.
- Все строки — в `messages/<locale>.json`, ничего не захардкожено в компонентах.

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
