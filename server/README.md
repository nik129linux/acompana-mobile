# Backend — nursing mobile prototype

Zero-dependency Node HTTP server. The frontend works without it: open
`../index.html` by double-click and everything falls back to the on-device
template (badge "Plantilla").

## Run

```bash
node server/server.js        # http://127.0.0.1:8787
OLLAMA_URL=http://127.0.0.1:11434 node server/server.js
```

Ollama is optional. Without it (or on any model failure) every endpoint
answers from deterministic rules and reports `"source": "rules"`.

## Endpoints

- `GET /api/health` → `{ ok, service, ollama: { reachable, model } }`
- `POST /api/handover` → `{ events }` → `{ s, b, a, r, source, model }`
- `POST /api/ask` → `{ question, facts }` → `{ answer, source, model, createdQuestion }`
- `GET /api/questions` → open "pregunta para la enfermera" items
- `POST /api/questions/resolve` → `{ id }` marks one as done
- Any endpoint with `{ ..., dryRun: true }` returns `{ payload }` without
  calling the model. The app shows that exact payload for consent before
  the first real call.

## Provider chain

Rules → Ollama (`POST /api/generate`, `format: "json"`, `stream: false`,
8s timeout) → rules on ANY failure (down, bad JSON, schema violation,
grounding violation, advice detected). Model pick: `GET /api/tags`,
prefer a model without `remote_host`, else the first one (cloud-tagged
models are valid). The UI badge reads "Plantilla" or "IA local · \<model\>".

## Grounding and guardrails

- Handover: each SBAR field ≤ 200 chars; every number/time/medication
  token must appear in the source events ("1:00 p. m." counts as "13:00").
- Family Q&A: answer ≤ 220 chars from family-visible facts only; server
  refuses diagnosis, prognosis, doses, medication advice and anything
  outside the events with a fixed safe message and files a nurse question.
- Privacy: only aggregates (counts, times, clinical tokens) reach the
  model — see `buildHandoverPayload` / `stripNames`. No names, rooms,
  titles or free text.

## Tests

```bash
node tests/server.test.js
```

## Run it on an Android phone

`node server/server.js` now serves the app too, on every interface (`HOST` overrides).

- Same Wi-Fi: open the printed `http://192.168.x.x:8787` in Chrome. The AI works, but
  Chrome only offers "Install app" on HTTPS or localhost.
- To install: USB + `adb reverse tcp:8787 tcp:8787`, then open `http://localhost:8787`
  on the phone and pick "Install app". It opens full screen and the shell works offline.
