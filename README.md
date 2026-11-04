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

## Deploy the server

1. Deploy with the Render blueprint (`render.yaml`).
2. Set `OLLAMA_API_KEY` in the host dashboard.
3. Set the repo variable `ACOMPANA_API_BASE` to the server URL and rebuild.

## Test commands

```sh
node tests/apk.test.js
node tests/finish.test.js
```
