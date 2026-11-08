# BRIEF-RUBRIC (phase A) — make this app pass the professor's rubric

You are editing ONE app in this directory only. Read this whole file, then the existing code before changing anything.
Language rule: code, comments, commit messages in English. UI copy: Spanish (neutral Colombian: "agregar", "presiona", never "añadir/pulsa/vosotros") + English.

## Must deliver (all binary, all required)
1. **Spanish is the default language.** Fresh profile (empty storage) opens in Spanish regardless of OS/navigator language. `<html lang>` follows the active language. Switching language must NOT reload the page or lose app state.
2. **Light theme is the default.** Fresh profile opens light. Theme options: Claro / Oscuro / Sistema (Claro default). Persisted.
3. **A real Settings screen** ("Configuración" / "Settings"), reachable from the main navigation with a gear icon, containing at least: Idioma (Español/English), Tema (Claro/Oscuro/Sistema), Inteligencia artificial (on/off + a way to revoke/re-grant consent if the app has consent), Privacidad (what data is kept, delete-all if the app has it), Ayuda (opens level 3 of the guide), "Ver la guía otra vez" (replays level 1). Existing header toggles may stay as shortcuts but Settings is the canonical home.
4. **A three-level guide**, all translated ES/EN:
   - Level 1 — first-run welcome: 3 short screens/cards (what the app is for, the core action, privacy/AI promise), with progress dots, Siguiente/Atrás, Saltar. Shown once on first launch (persist "seen"), replayable from Settings.
   - Level 2 — contextual coach marks: the first time the user reaches each key feature (at least 3 features), a small dismissible tip anchored to it. Each shown once, persisted.
   - Level 3 — a Help/Ayuda screen inside Settings: a FAQ / reference of every feature and every icon/status the app uses (plus a glossary if the app has domain terms).
   The guide must work in the app's real mode, not only in a demo mode. Keyboard accessible: Esc closes, focus is trapped in modal steps and returned afterwards, role=dialog + aria-modal.
5. **No English visible in Spanish and no Spanish visible in English** on every screen you touch, including dynamic strings, aria-labels, placeholders, tooltips, CSS `content:` strings, error messages. Plurals correct in both languages ("1 pendiente" / "2 pendientes", "1 block" / "2 blocks"). Numbers/times formatted with `Intl` for the active locale where numbers are shown.
6. Design: use ONLY the app's existing design tokens/components (read its tokens CSS first). No new raw colors, no new fonts. Light and dark both must look designed, contrast >= 4.5:1 for text. Respect prefers-reduced-motion. Touch/click targets >= 44px.

## Tests
- Add a test file for this phase (follow the style of the existing tests) that asserts items 1-5 in a real browser: fresh profile opens ES + light; Settings reachable and switches language without reload (assert some in-memory state survives); level 1 shows on first run and not on second; a coach mark shows once; Help screen exists; scan visible text in ES for a list of the app's English words and fail if any appear.
- Existing tests that hardcode English as default must be updated to Spanish default; do NOT delete or weaken other assertions.
- Run the FULL existing suite (every test file, see the command below) and keep it green. Paste the final pass counts in your last message.

## Do not
- Do not touch files outside this directory. Do not change the AI backend/server logic, the product concept, or unrelated features.
- No `git push`. Commit in small steps on the current branch with clear English messages (`git add` only the files you changed; never `git add -A`).
- Never pkill/killall; run Electron only via `xvfb-run -a`.

## Final message
List: files changed, each requirement 1-6 with PASS/FAIL and the evidence (test name or file:line), full test-suite counts, anything you could not do.

## App-specific (Acompaña mobile, PWA + Capacitor)
- Spanish is already default (js/i18n.js:339-344); theme defaults to OS — make Claro default.
- Today language/theme live in the ⋮ "Ver como" menu next to role switching and "Simular un error" (js/app.js:362-377). Create a Configuración screen (gear in the top app bar) per reader (enfermero/paciente/familia). Move "Ver como" + "Simular un error" into a clearly labelled "Modo demostración" section at the bottom of Configuración, not in the user menu.
- AI consent today is irreversible once "Ahora no" (js/app.js:2501-2512): add the toggle in Configuración.
- Guide level 1 must differ per reader (nurse: turno → registrar → pendientes; patient: lo que sigue → su día → cómo preguntar; family: resumen → visita → contacto). Replace the two static onboarding cards at the bottom of patient/family homes with the coach marks / help.
- Plurals: "{count} pendientes", "{count} registros", "{count} estables", server "Faltan {count}". No raw ISO timestamps in the UI (js/views/nurse.js:525). aria-label in index.html:27 untranslated.
- Run every tests/*.js (node tests/X.js; finish.test.js uses Brave if present) and replace package.json "test" (currently exit 1) with a script that runs them all. After changing js/css, run the existing www sync/build tool (tools/build-www.js) so www/ and android assets match.
