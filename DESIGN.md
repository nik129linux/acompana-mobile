# DESIGN.md — Acompaña

Format: Stitch / awesome-design-md (9 sections). Source of truth for every screen. Reference
language: **Medixin** (Figma community medical app), adapted to a nursing shift with three readers.
Values below are token names from `css/tokens.css`; never write a raw color outside that file.

## 1. Visual Theme & Atmosphere
Clean, confident, clinical-but-warm mobile app. White canvas with a breath of blue, white cards
floating on soft blue-tinted shadows, **one** saturated blue gradient hero per screen, a friendly
flat-2D doctor mascot instead of photos. Feels like a polished App Store medical app, not a form.
Calm by default; red appears only when a patient is clinically critical.

## 2. Color Palette & Roles
| Role | Token | Use |
|---|---|---|
| Brand / primary | `--color-primary-500` (#226BEB) → `--nurse` | Primary actions, active nav, links, nurse accent |
| Hero gradient | `--grad-primary` | The one hero card per screen, primary buttons, center nav "+", splash |
| Warm gradient | `--grad-warm` | Second stat tile only (Medixin orange tile) |
| Canvas | `--canvas` | Screen background |
| Surface | `--white` | Cards, sheets, nav bar |
| Tinted surface | `--stone`, `--sand`, `--primary-container` | Chips, inactive segments, media squares, icon wells |
| Text | `--ink` (titles) · `--body` (copy) · `--muted` (meta) | Never gray text on colored fills: use `--on-primary` / `--on-gradient-soft` |
| On gradient | `--on-primary`, `--on-gradient-soft`, `--glass-on-gradient` | Text and inner chips inside gradient cards |
| Critical | `--grad-alert`, `--error-container`, `--on-error-container`, `--error-fill` | Only Carlos / clinical alerts |
| Roles | `--accent` (auto per reader): nurse blue, patient `--patient-text` (same blue as the nurse, Nico 2026-10-31), family `--family-text` amber | Reader-specific accents, active nav per role |
| Borders | `--stone-border` | Hairlines, outline inputs |
Contract: the professor changes `--color-primary-500` and checks light **and** dark; everything blue
must follow it. Every text pair ≥ 4.5:1 (tests enforce it).

## 3. Typography Rules
Single family **Poppins** (self-hosted 400/500/600). Weights: 600 titles, 500 labels/buttons, 400 copy.
| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Screen title (H1) | `--text-heading` 26 / 1.25 | 600 | -0.02em |
| Hero / card title | `--text-section` 20 / 1.3 | 600 | -0.01em |
| Section header | 18 / 1.3 | 600 | 0 |
| Body | `--text-body` 16 / 1.5 (patient/family) · `--text-small` 14 / 1.55 (nurse lists) | 400 | 0 |
| Meta / caption | `--text-caption` 12 / 1.4 | 500 | 0 |
| Buttons | 14 / 1 uppercase | 600 | 0.04em |
| "Ver todo" links | 12 uppercase | 600 | 0.04em |
Numbers: `font-variant-numeric: tabular-nums` on times and counts. No italics. Sentence case
everywhere except buttons and "VER TODO".

## 4. Component Stylings
- **Greeting bar** (top of each reader home): 48px round mascot avatar on `--primary-container` ·
  "Hola, Elena" (20/600) + one meta line with a location/room icon · 48px round bell/menu button
  filled `--nurse` with white icon. No separate title bar on home screens.
- **Hero card**: `--grad-primary`, radius `--radius-lg` (24), padding 20, white text, `--elevation-2`.
  Row: 48px rounded-square (12) media on `--glass-on-gradient` + title + sub (`--on-gradient-soft`)
  + small round glass icon button. Bottom: a glass pill (`--glass-on-gradient`, radius 14) with icon +
  time. **Stacked look**: two ghost cards under it (same gradient, 92% and 84% width, opacity .45/.25,
  offset 8px and 16px). Critical variant uses `--grad-alert`.
- **Section header**: title left (18/600), "VER TODO" link right (`--nurse-text`, 12/600).
- **Chips** (horizontal scroll): white pill, 40px tall, 12px icon well tinted by category, label
  14/500, `--elevation-1`; selected = `--nurse` fill + white text.
- **List card** (patients, tasks, timeline items): white, radius 16, padding 12, `--elevation-1`.
  64px media square radius 12 on `--primary-container` holding the mascot/illustration or a
  Hugeicon · name 16/600 · meta 12 `--muted` with small icon · trailing status pill or 40px round
  action. Whole card is the tap target (≥ 56px).
- **Stat tiles** (detail screens): two side by side, radius 16, padding 16, white text; tile 1
  `--grad-primary`, tile 2 `--grad-warm`; label 12/500, value 22/600.
- **Buttons**: primary = `--grad-primary`, height 52, radius 16, white 14/600 uppercase, `--elevation-2`
  tinted; secondary = white with 1.5px `--nurse` border and `--nurse-text`; tonal = `--primary-container`.
  Press: scale .97. Full width at the bottom of flows.
- **Segmented control**: two equal pills in a row; active `--nurse` fill white text; inactive white
  with `--elevation-1`. Height 48.
- **Inputs**: height 52, radius 12, 1.5px `--stone-border`, leading Hugeicon in `--muted`, label above
  (14/500). Focus: border `--nurse`.
- **Bottom nav**: white, `--elevation-nav`, top radius 24. Icons 24 (Hugeicons) with label 12;
  active = `--accent`. Nurse nav has the **center raised "+"** (56px circle, `--grad-primary`, white
  plus, lifted 16px above the bar) = `[data-fab-register]` "Registrar".
- **Bottom sheet**: white, top radius 28, drag handle 40×4 `--stone-border`, title 20/600.
- **Success screen**: flat primary disc with a heavy white Hugeicons `CheckIcon`, the twin of the error X, title 22/600, summary card with icon rows, primary + secondary buttons.
- **Error state**: the check's opposite. Centered card with a 128px red disc and a drawn white X, title, one line with the recovery, primary "Reintentar", secondary "Cerrar". Real failed sends land here; the menu can show it on demand.
- **Draft loading bar**: 6px primary bar in the pinned sheet header. It creeps to 90%, closes when the text lands, and holds at least 700ms so it never flashes.
- **Snackbar**: `--ink` background, white text, radius 14, undo link in `--sky`.
- **Icons**: Hugeicons stroke-rounded only, through `icon(name)` (`js/icons.js`), 1.5 stroke,
  `currentColor`. Never emoji or unicode glyphs as icons.

## 5. Layout Principles
Single column, 20px side padding, 4px base grid (`--space-*`). Rhythm: 24–32px between sections,
12px between cards, 8px inside groups. One hero per screen near the top; the most urgent thing is
the first thing. Lists before secondary info. Horizontal chip rows may bleed to the screen edge.
Content never hides behind the nav: last item has nav-height + 24px clearance.

## 6. Depth & Elevation
Three levels only: canvas → card (`--elevation-1`) → hero/primary button/sheet (`--elevation-2`).
Shadows are soft and tinted with the primary (never pure black, never hard offset). Dark theme
replaces tinted shadows with surface steps (`--white` over `--canvas`). Glass only inside gradient
cards (`--glass-on-gradient`), never as decoration elsewhere.

## 7. Do's and Don'ts
Do:
- Keep Spanish copy, neutral Colombian: "tú" to the nurse, "usted" to patient and family.
- Keep clinical values (e.g. "PA 90/55") off the nurse home, the patient and the family screens;
  on patient detail they stay blurred until a deliberate tap.
- Show the AI source ("IA" badge / "Plantilla") wherever generated text appears.
- Use the mascot at calm moments (greeting, empty states, success, patient "Lo que sigue").
Don't:
- No raw hex/rgb outside `css/tokens.css`; no new fonts; no emoji icons.
- No red unless a clinical alert. No more than one gradient hero per screen (+ primary buttons).
- No eyebrow/kicker labels above titles. No equal three-column stat grids.
- No mascot on clinical screens (patient detail, SBAR).
- No `!important`, no `transition: all`, no animating layout properties.

## 8. Responsive Behavior
Ships at 360–430px phone widths; installed PWA is edge-to-edge (respect `env(safe-area-inset-*)`).
At ≥ 500px the desktop stage shows the phone frame for the demo. Touch targets ≥ 48px (56px for
the main actions: gloved nurse). Text wraps, never truncates names. Both themes are designed, not
inverted. `prefers-reduced-motion`: show final states instantly.

## 9. Agent Prompt Guide
When building a screen:
1. Read this file and `css/tokens.css`; reuse `css/components.css` classes before writing new CSS.
2. Put new styles in your own `css/screens/<name>.css`, tokens only.
3. Match the Medixin anatomy named in your brief (reference PNGs in `ref/medixin/`), and match the
   finished **Mi turno** screen for spacing, type and depth.
4. Keep every existing `data-*` attribute, id and test hook; behavior must not change.
5. Use `icon('<name>')` for icons (names in `tools/build-icons.js`); add a name there if missing.
6. Motion: call the helpers in `js/motion.js` (`stagger`, `pop`, `sharedElement`), don't hand-roll.
7. Run every `node tests/*.js` suite before you report; report the last line of each.
Example prompt: "Restyle Pendientes as Medixin 'Appointment Upcoming': segmented control
Pendientes/Hechas, list cards with time pill and 40px round confirm button, tokens only."
