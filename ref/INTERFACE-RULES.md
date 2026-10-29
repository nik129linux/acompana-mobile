# INTERFACE-RULES — Acompaña (Android-feel nursing app)

## Rules

1. Make the next tap obvious before anything is read.
Source: transcripts/10-10-ways-to-make-your-app-feel-more-premium-uber.md – "Make it immediately obnoxious what you're supposed to do next."
Applies to: Nurse Turno / Pendientes one-tap confirm, Patient Mi estado, Family Qué pasa.

2. Show only the data needed for the next decision on first glance.
Source: rules/app-ui.md – "Show only the data needed for the next decision"
Applies to: Nurse patient list, Pendientes list, Patient timeline.

3. Use exactly one signal color for everything tappable.
Source: transcripts/like-and-follow-if-you-enjoyed-this-content.md – "One color that only ever means tap this"
Applies to: bottom-nav active, quick-confirm 1 toque, links, reveal-button.

4. Skip the middle sizes: one element huge, the rest small.
Source: rules/app-ui.md – "One element huge, the rest small"
Applies to: Mi turno hero title, Qué pasa summary, detail-hero name.

5. Build depth with overlapping planes, never with shadows.
Source: rules/anti-slop.md – "The overlap is what reads as depth; no shadows needed."
Applies to: Nurse home header, Patient next-card, Family summary.

6. Tighten display tracking on headlines.
Source: transcripts/marina-uiux-budarina-nova-025-feel-the-next-3-simple.md – "Tighter letters make your design look more structured."
Applies to: view-title, detail-name, splash-wordmark.

7. Keep at most four text sizes on screen.
Source: rules/app-ui.md – "Count the text sizes: at most 4."
Applies to: all roles, phone 390px viewport.

8. Keep every raw color as a token in css/tokens.css.
Source: rules/MOTION-BIBLE.md – "Tokens: every raw color only in css/tokens.css"
Applies to: accents, surfaces, badges, all cards.

9. Animate transform and opacity only, never layout.
Source: rules/anti-slop.md – "`transform` and `opacity` only"
Applies to: view push, bottom sheet, task collapse, confetti.

10. Answer every tap in 150-250ms with the master enter ease.
Source: rules/MOTION-BIBLE.md – "One master entrance ease `cubic-bezier(0.16,1,0.3,1)`"
Applies to: patient-card, task-card, sheet, dialogs, nav.

11. Confirm with press scale plus haptic, then animate the state change.
Source: rules/app-ui.md – "press scale + spring, haptic on confirm"
Applies to: Pendientes task-action, patient-card quick-confirm, pending-count.

12. Move forward from the right, back from the left.
Source: app/BRIEF.md – "forward/next tab enters from right, back/prev tab from left."
Applies to: nurse detail push/pop, tab switches, bottom-nav.

13. Stagger entrances one idea per beat, nothing instant.
Source: rules/MOTION-BIBLE.md – "stagger 60-100ms, one idea per beat"
Applies to: patient-list, task-list, timeline, FAQ.

14. Make buttons at least 48px high and controls at least 44px.
Source: rules/design-modes-and-audit.md – "buttons at least 48px high, inputs and other controls at least 44px"
Applies to: Registrar tray chips, dictar button, role tabs, nav.

15. Keep inputs at 16px or larger to stop iOS zoom.
Source: rules/design-modes-and-audit.md – "Inputs at 16px or larger."
Applies to: Family ask-input, Registrar dictate field.

16. Use one h1 per view with h2 section headings.
Source: rules/design-modes-and-audit.md – "one `h1`; each section heading is `h2`"
Applies to: Mi turno, Pendientes, Mi estado, Preguntas, Qué pasa, Contacto.

17. Honor reduced motion by showing the final state with no motion.
Source: rules/verification.md – "`prefers-reduced-motion` shows the final state with no motion"
Applies to: splash, sheet, detail push, confetti, videos.

18. Hide clinical values behind a deliberate tap, never in the list.
Source: app/content-spec.md – "van SIEMPRE detrás de"
Applies to: Nurse detail clinical-panel, Historial del turno, Carlos PA 90/55.

19. Give every interactive a visible hover, active and focus-visible state.
Source: rules/MOTION-BIBLE.md – "Every interactive has hover, active, :focus-visible"
Applies to: cards, chips, nav-items, faq-question, splash-skip.

## Audit

- Rule 1 — PASS — app/js/app.js:236 pending task-action Listo plus 1 toque visible without reading.
- Rule 2 — PASS — app/js/app.js:225 home shows 3 stats plus names only, clinical hidden.
- Rule 3 — PASS — app/css/tokens.css:33 accent is single tap color; app/css/app.css:1894 nav active uses accent.
- Rule 4 — FAIL — app/css/tokens.css:62 middle sizes 17/19/23 all used; no huge-vs-tiny contrast.
- Rule 5 — FAIL — app/css/app.css:536 patient-card flat inset border, no overlapping planes.
- Rule 6 — PASS — app/css/app.css:275 letter-spacing -0.02em on view-title.
- Rule 7 — FAIL — app/css/tokens.css:62 seven sizes 12/15/17/19/23/32/44 exceed limit.
- Rule 8 — PASS — app/css/tokens.css:7 tokens defined; app/css/app.css:8 uses var(--canvas).
- Rule 9 — PASS — app/css/app.css:184 view moves via transform translate3d plus opacity only.
- Rule 10 — PASS — app/css/tokens.css:37 enter cubic-bezier(0.16,1,0.3,1) 360ms; app/css/tokens.css:42 press 120ms.
- Rule 11 — PASS — app/js/app.js:598 navigator.vibrate?.(10); app/css/app.css:354 active scale(0.97).
- Rule 12 — PASS — app/js/app.js:347 from-right forward; app/css/app.css:209 to-left exit direction.
- Rule 13 — FAIL — app/css/tokens.css:43 --stagger 40ms below required 60-100ms band.
- Rule 14 — FAIL — app/css/app.css:137 role-tab min-height 40px below 48px minimum.
- Rule 15 — FAIL — app/css/tokens.css:63 --text-small 15px used for inputs; below 16px threshold.
- Rule 16 — PASS — app/js/app.js:225 h1 Mi turno with app/js/app.js:227 h2 Pacientes asignados.
- Rule 17 — PASS — app/css/app.css:2193 prefers-reduced-motion block disables motion; app/js/app.js:369 video paused.
- Rule 18 — PASS — app/js/app.js:273 clinical behind data-reveal; app/css/app.css:787 filter blur(5px).
- Rule 19 — PASS — app/css/app.css:37 focus-visible outline 3px accent on all interactives.

Top 5 FAILs that matter most: Rule 5 no overlapping planes depth; Rule 7 seven text sizes break hierarchy; Rule 4 middle sizes everywhere; Rule 14 role tabs 40px miss glove target; Rule 15 inputs below 16px risk iOS zoom.
