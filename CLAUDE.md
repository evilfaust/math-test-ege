# CLAUDE.md — Журнал ЕГЭ

## Stack
React 18 + Vite + TypeScript + PocketBase (port 8090) + Tailwind CSS 3 + Recharts

## Dev
```bash
./start.sh   # starts PocketBase + Vite dev server (port 5151)
```

## Build

```bash
npx vite build   # outputs to pb_public/
```

Multi-page build: `vite.config.ts` defines two entry points:
- `index.html` → основное приложение (`src/main.tsx`)
- `landing.html` → лендинг (`src/landing-main.tsx`)

## Deploy — лендинг

Лендинг деплоится отдельно от основного приложения через GitHub Actions.

**Файлы:**
- `landing.html` — HTML-оболочка entry point для лендинга
- `src/landing-main.tsx` — точка входа React, монтирует `LandingPage`
- `.github/workflows/deploy-landing.yml` — CI/CD pipeline

**Как работает pipeline (триггер: push в `main`):**
1. `npm ci` + `npx vite build` → собирает всё в `pb_public/`
2. `pb_public/landing.html` переименовывается в `index.html` и вместе с `pb_public/assets/` кладётся в `landing-dist/`
3. rsync заливает `landing-dist/` на VPS в `/var/www/landings/ege-journal/`

**Secrets в GitHub репозитории:**
- `VPS_HOST` — адрес сервера
- `VPS_USER` — пользователь SSH
- `VPS_SSH_KEY` — приватный ключ SSH

**Важно:** `emptyOutDir: true` в vite.config — каждый билд очищает `pb_public/` полностью. Оба entry point собираются за один запуск `vite build`, ассеты общие.

## Print / PDF export
- `.card` uses Tailwind `backdrop-blur` + `bg-white/90` — both must be reset in `@media print` (`backdrop-filter: none`, `background: #fff`) or card contents disappear in print
- Recharts `ResponsiveContainer` collapses to 0px in print — set explicit `height: 180px !important` on `.recharts-responsive-container` and `.recharts-wrapper` in print CSS
- `print-hidden` / `print-only` pattern: screen-only elements get `print-hidden`, print-only blocks get `print-only` (display:none by default, display:block in @media print)
- Tile background colors in print: use explicit hex classes (not Tailwind opacity utilities) — `print-color-adjust: exact` ensures they render
- Print CSS lives in `src/index.css` inside `@media print {}`
