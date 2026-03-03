# Журнал ЕГЭ

Веб-приложение для отслеживания результатов тестов с сайта [Решу ЕГЭ](https://math-ege.sdamgia.ru/).

## Быстрый старт (3 шага)

### 1️⃣ Установить зависимости

```bash
npm install
```

### 2️⃣ Скачать PocketBase

Выполнить **одну** из команд ниже (в зависимости от вашей системы):

**macOS Apple Silicon (M1/M2/M3):**
```bash
curl -L https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_darwin_arm64.zip \
  -o pb.zip && unzip pb.zip pocketbase && rm pb.zip && chmod +x pocketbase
```

**macOS Intel:**
```bash
curl -L https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_darwin_amd64.zip \
  -o pb.zip && unzip pb.zip pocketbase && rm pb.zip && chmod +x pocketbase
```

**Windows/Linux:**
Скачайте с https://pocketbase.io/docs/ и положите файл `pocketbase` рядом с проектом.

### 3️⃣ Запустить всё

```bash
chmod +x start.sh
./start.sh
```

Откройте http://localhost:5173 в браузере.

---

## Что дальше?

1. **Загрузить результаты** — перейдите на страницу "Загрузить"
2. **Выбрать Excel файл** — экспорт из "Решу ЕГЭ" (drag & drop)
3. **Смотреть журнал** — переходите на "Журнал" → выбирайте группу

## Возможности

✅ **Загрузка** — drag & drop Excel файлов из "Решу ЕГЭ"
✅ **Журнал** — сетка студент × тест с оценками
✅ **Профиль** — график прогресса, проблемные задания
✅ **Тест** — распределение оценок, ссылки на задания
✅ **Статистика** — долги, сложные задания, сводка по группам

## Детали

- **Технология:** React + TypeScript + Vite
- **База данных:** PocketBase (работает локально)
- **Парсинг:** Excel парсится прямо в браузере (SheetJS)
- **Дизайн:** Tailwind CSS

## При проблемах

Переустановить базу данных:
```bash
rm -rf pocketbase_data/
./start.sh
```

PocketBase панель администратора: http://127.0.0.1:8090/_/

