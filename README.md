# Inventory

PWA для учёта личных вещей: фото → распознавание Gemini → место в дереве мест → поиск голосом.
Подробности и правила разработки: [CLAUDE.md](CLAUDE.md).

## Запуск

```bash
npm install
cp .env.example .env.local   # заполнить ключи
npm run dev
```

## Команды

```bash
npm run dev            # локальный запуск
npm run build          # проверка сборки
npm run lint
npx supabase db push --remote   # применить миграции к проекту Supabase
npm run db:types               # обновить типы TypeScript из схемы БД
```

## Перед запуском для других пользователей

- [ ] **Свой SMTP (Resend).** Встроенная почта Supabase отправляет лишь несколько писем в час и не даёт менять шаблоны. После подключения SMTP:
  - включить *Confirm email* (Authentication → Sign In / Providers → Email);
  - в шаблонах писем (Authentication → Emails) заменить ссылки на формат `token_hash`, он работает в любом браузере, в том числе во встроенном браузере почтового приложения:
    - **Confirm signup:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
    - **Reset password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
  - `/auth/confirm` уже поддерживает оба формата: `token_hash` и стандартный `code`.

## Запланировано

- **Админка для большого числа пользователей:** поиск по email, фильтры по статусу и тарифу, сортировка, страницы по 50 (отбор в базе), компактные строки на телефоне и таблица на широком экране. Нужна одна безопасная миграция (новая функция `admin_list_users_v3`). Подробно — в `CHANGELOG.md`, раздел «Planned».
- **Оплата через Stripe:** модель данных готова, шаги — в `CLAUDE.md`, «Подключение Stripe».
