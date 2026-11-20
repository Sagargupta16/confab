---
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/**/*.css"
  - "frontend/src/components/**"
---

# Frontend UI

confab uses the same UI system as ledger-sync (the app shell) and portfolio-react (the look and the motion numbers). It arrived in 0.5.0, on the app shell first and then, on his word the same day, on every surface: the room panel, the messages, the composer and the sign-in card. Paths below are relative to the repo root.

## One palette

- **House tokens** (`frontend/src/index.css`, `@theme` and `:root`): `--color-background`, `--color-canvas-outer`, `--color-surface-1` to `-4`, `--color-surface-dropdown`, `--color-text-primary` to `-quaternary`, `--color-app-blue` (hover `--color-app-blue-vibrant`, text on it `--color-on-blue`), `--color-app-green`, `--color-app-red`, the hairline ladder `--hairline-1` to `-5` (borders) and the overlay ladder `--overlay-1` to `-6` (hover and raised fills). Every surface uses these.
- The 0.4 tokens (`canvas`, `panel`, `raised`, `line`, `ink`, `muted`, `accent`, `danger`) were deleted in 0.5.0. A class such as `bg-panel` or `text-muted` now produces no CSS at all and fails silently, so never write one.
- Never a raw hex or rgb in a component. A seat's own colour (avatar, name) comes from `models.json` and is the one exception.

## Look

- Near-black canvas with a blue cast, flat surfaces, a 1px hairline for every edge. No card shadows, glow, gradient text, glass or `backdrop-filter`. Depth (`--shadow-float`) only on floating layers: dialogs and menus.
- One accent, blue, used for the one primary action, focus rings, the active tab or segment and numbers. Green only for the live dot. Red only for destructive actions and errors.
- One 8px radius family: controls and rows `rounded-md`, panels and dialogs `rounded-lg`, pills and avatars `rounded-full`.
- Inter Variable for UI and JetBrains Mono Variable for every label, count, cost, token figure and time (`@fontsource-variable`, self-hosted, imported in `main.tsx`). Figures use `.figure` (tabular, slashed zero); small uppercase labels use `.meta`.

## Shared pieces (reuse before writing a new one)

- `.control`: the inset control (translucent fill, hairline, top highlight, the focus ring). Mode, Name, Hops and Clear in the top bar use it.
- `components/Button.tsx`: primary, secondary, ghost and danger, sizes sm and md. `.lift` gives the 1px hover lift and the 0.97 press.
- `components/ConfirmDialog.tsx`: a native `<dialog>` with a pending state and an inline error. Never call the browser's `confirm()` or `alert()`.
- `components/CountUp.tsx`: a number that counts to its new value in 240 ms without re-rendering.
- `components/Panel.tsx`: the drawer and the room sheet (spring 300 / 30).
- The `shell` class on a surface's root gives everything focusable inside it the double focus ring; a portal (the picture viewer, a menu) needs it on its own root.
- `components/ModelMenu.tsx`: the model picker (names only). `components/LevelControl.tsx`: Cheap, Medium, Intense.
- An empty state is an icon in a 48px bordered tile, a short title, a tertiary line and at most one action (`CostTable.tsx`, `AuthGate.tsx`).
- `.meta` sets its own colour outside Tailwind's layers, so a colour utility beside it needs `!` (`meta text-text-primary!`).
- `.chat-row`, `.live-dot`, `.loading-segment`, `.app-canvas`, `.app-workspace`, `.workspace-motion-field` and `.workspace-motion-beams` are the shell's own classes.

## Motion

- Motion stays visible. Never read `prefers-reduced-motion` and never tone an animation down.
- Animate transform and opacity only; a layout move uses motion's `layout` or `layoutId`.
- Numbers: the sliding pill behind the open chat is a spring 500 / 40; a segmented control's pill 500 / 28; a press scales to 0.97; a hover lift is 1px; a menu enters from y -4 in 0.15 s; a dialog from opacity 0, scale 0.95, y 10 in 0.25 s; a drawer or sheet is a spring 300 / 30; a list reveals with a 0.05 s stagger capped at 0.3 s.
- The grid and the two scan beams (14 s and 21 s) run on the desktop frame only (`hidden lg:block`).

## Phone first

- Most use is on a phone. Tap targets are 44px below `lg` and may shrink to 32-40px at `lg` and up. Inputs, selects and textareas are 16px below `lg`, or iOS zooms the page.
- Hover styling only for fine pointers: the `hover-fine:` variant, or `@media (hover: hover) and (pointer: fine)` in CSS. A touch screen gets the press instead and always shows a row's actions.
- `dvh`, not `vh`. Fixed edges pad `env(safe-area-inset-*)`. Nothing scrolls sideways at 375px.
- Check a change at 375px and at 1280px in a real browser before calling it done.

## Rules that cost a correction elsewhere

- Never remove something that exists (a control, a footer, a credit) while restyling.
- No price in the model picker: the picker shows model names and the level tags; prices live in the Cost tab.
- A level is not stored. It is derived from the seats' models, and choosing one writes ordinary seat choices.
- Keep `frontend/src/mentions.ts` identical to `MENTION` in `backend/src/confab/chat.py`.
- A new visual style goes on one surface first and is shown before it is rolled out.
