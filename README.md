# Acompaña

Acompaña is a shift companion for nurses, patients and families.
It shows the shift plan, visit hours and answers questions from the shift data.

## Run locally

```sh
node server/server.js
```

## Install the APK

1. Download `app-debug.apk` from the latest GitHub release or the Actions artifact.
2. Allow installs from this source when Android asks.
3. Open it.

## Deploy the server (Railway)

1. In Railway: New Project, Deploy from GitHub repo, pick this repo. Railway runs `npm start`
   (`node server/server.js`) and provides `PORT`.
2. Variables: add `OLLAMA_API_KEY` (create it at ollama.com). Never commit it.
3. Settings: set the healthcheck path to `/api/health`, then Networking, Generate Domain.
4. In GitHub, set the repository variable `ACOMPANA_API_BASE` to that `https://...up.railway.app`
   address and push a new `v*` tag: the release APK then talks to the server.

The same address also serves the web version of the app.

## Test commands

```sh
node tests/apk.test.js
node tests/finish.test.js
```
