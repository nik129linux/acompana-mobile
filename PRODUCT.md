# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

- **Nurse on shift (primary).** Moves between the patient's bed and a computer somewhere else; today logs care from memory, later, "when there's time". Standing, gloved, one hand busy, in a hurry, with the patient watching. Anything that takes more than a few seconds won't be used.
- **Patient.** In the bed, often anxious; wants to know what comes next and what they're waiting for, in plain words.
- **Family.** Visiting or waiting; needs logistics (when they can come in, who to ask), not clinical data.

## Product Purpose

Acompaña is one shift app with three faces. The nurse logs what they just did without leaving the room (one tap or dictation). The patient and family see the same events translated into plain language. Success: care gets logged at the bedside instead of hours later, and patient/family stop asking "what's next?" because the screen already answers it.

## Positioning

The product is the translation, not the form: one care event told three ways (raw clinical record for the nurse, plain phrase for the patient, logistics-only for the family), with explicit rules about what each reader must never see. A generic charting app shows everyone the same record.

## Operating Context

- A hospital shift (demo data: "Hospital Central · Piso 3", 3 patients, one critical: Carlos Rodríguez, PA 90/55).
- The nurse's screen is also visible to the patient from the bed; that limits what it can show.
- Handover between shifts uses SBAR (Situación, Antecedentes, Evaluación, Recomendación).
- University course deliverable (Interfaces, UCC, 2026-2): a demo used on an Android phone, not a deployed product.

## Capabilities and Constraints

- Roles: Enfermero (Turno, Registrar, Pendientes), Paciente (Mi estado, Preguntas), Familia (Qué pasa, Contacto). Switching role always resets to that role's home (privacy).
- Registration: quick events (Medicación, Cambio de posición, Ronda), free text ("Otro evento"), and dictation (speech-to-text, then the AI proposes; the nurse confirms before anything is saved). Events persist on the device.
- AI is narrow: it structures what the nurse marks or dictates and translates it into plain language. It never diagnoses, doses, or advises. Model: gemma4:31b through the Ollama cloud API, called only from the local server; deterministic rules are the fallback. SBAR drafts are rejected if they omit an open alert or call a pending task done.
- Clinical values stay hidden behind a deliberate tap on the nurse side; never shown raw to patient or family.
- Delivered as an installable web app (PWA) served by a local Node server; no accounts. Events, confirmed tasks and chat sync between devices through that server, in memory.
- Course rule: every raw color lives in `css/tokens.css`; the professor changes `--color-primary-500` and checks both light and dark themes.
- Field interviews (nurses, recently hospitalized patients/families in Pasto/Nariño) have NOT been done. Interview-dependent facts stay marked "POR CONFIRMAR EN CAMPO". This does not block the demo.

## Brand Commitments

- Name: Acompaña.
- UI copy in Spanish (default, neutral Colombian, no voseo: "tú" to the nurse, "usted" to patient and family) and English, switched from the ⋮ menu. The Spanish sentence is the key in `js/i18n.js`. Code in English.
- A doctor mascot exists (frames and processed video loops in `media/`).
- Never put a claim in the UI that the app can't back up (e.g. no "IA" label on rule-based output).

## Evidence on Hand

- `ref/ideas.md` (# Mobile): the case as written by the student.
- `ref/content-spec.md`: entity inventory, the three-reader translation table, what each reader never sees.
- `media/`: splash, onboarding and empty-state mascot loops.
- No real testimonials, hospital partners, or usage data exist; do not invent them.

## Product Principles

1. Seconds, not minutes: anything slower than the current "log it later" habit has failed.
2. One event, three truths: each reader gets the version that helps them and nothing that harms them.
3. The patient is watching: the nurse screen is designed for an audience in the bed.
4. AI proposes, the nurse decides: nothing generated is saved or shown without confirmation and a visible source.

## Accessibility & Inclusion

- Gloved, one-handed use: large hit targets, no precision gestures required.
- Patients and families may be older, stressed, or low-literacy: plain language, no jargon, readable contrast in both themes.
- Respect reduced motion.
