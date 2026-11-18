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
npx supabase db push   # применить миграции к проекту Supabase
```
