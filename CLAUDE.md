# CLAUDE.md — Журнал ЕГЭ

## Stack
React 18 + Vite + TypeScript + PocketBase (port 8090) + Tailwind CSS 3 + Recharts

## Dev
```bash
./start.sh   # starts PocketBase + Vite dev server (port 5151)
```

## Print / PDF export
- `.card` uses Tailwind `backdrop-blur` + `bg-white/90` — both must be reset in `@media print` (`backdrop-filter: none`, `background: #fff`) or card contents disappear in print
- Recharts `ResponsiveContainer` collapses to 0px in print — set explicit `height: 180px !important` on `.recharts-responsive-container` and `.recharts-wrapper` in print CSS
- `print-hidden` / `print-only` pattern: screen-only elements get `print-hidden`, print-only blocks get `print-only` (display:none by default, display:block in @media print)
- Tile background colors in print: use explicit hex classes (not Tailwind opacity utilities) — `print-color-adjust: exact` ensures they render
- Print CSS lives in `src/index.css` inside `@media print {}`
