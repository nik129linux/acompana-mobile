# Brief: Retoma habits/ask routes + visible quota (server only)

Goal: the Retoma desktop app gets two more AI routes and learns how many AI calls it has left.
Repo: this one (Acompaña). Touch ONLY `server/retoma.js`, `server/server.js`, `tests/retoma.test.js`.
Do not commit. Do not touch anything else (no package.json, no other routes' behaviour).

## Do it test-first
1. Append red tests to `tests/retoma.test.js` (same style/helpers already in that file), run `node tests/retoma.test.js`, see them fail.
2. Implement until green. Then run every `tests/*.test.js` and `tests/*.js` that already passed before; none may break.

## Routes (server/retoma.js handlers, wired in server/server.js like /api/retoma/propose)
POST /api/retoma/habits  { metrics, lang } -> 200 { ok:true, note, experiment, source:'Retoma server · <model>', fallback:false } | { ok:true, fallback:true }
POST /api/retoma/ask     { metrics, question, lang } -> 200 { ok:true, answer, source, fallback:false } | { ok:true, fallback:true }
Bad body (no metrics object, perApp missing/empty) -> 400 { ok:false, error }. Question missing/empty -> 400. Question clipped to 200 chars (never rejected for length).
Both go through `generateWithinBudget` and are added to `AI_RATE_PATHS`. Nothing stored or logged.

cleanMetrics(raw): keep only these keys, numbers finite, strings clipped to 60: totalMinutes, count, perApp (max 20 apps, minutes >=0), longest {app, minutes}, median, countLong, switchesPerHour, distractionMinutes, distractionPct, distractionShare, topDistraction, mostUsedApp, firstAt, lastAt (H:MM or null), lateNight (bool), breakCount, medianGap, longestGap, trend {days,current,previous,delta,direction}. Drop every other key (titles/notes must never reach the prompt).

Prompts (copy wording; English unless lang==='es', then add "Reply in Spanish (español)."):
- habits: 'You are a supportive habit coach. Read these usage aggregates (app minutes, focus blocks, switches, breaks) and reply with JSON only, exactly {"note":"max 400 chars, kind, no guilt, no medical claims","experiment":{"text":"After <trigger>, I will <action> for <N min>","trigger":"<trigger>","action":"<action>","minutes":N,"metric":"switchesPerHour|longest|lateNight|distractionShare","target":N,"direction":"atLeast|atMost"}}. Cite only numbers and apps from these metrics: ' + JSON
- ask: 'Answer this question about PC usage using ONLY these aggregates. Reply with JSON only, exactly {"answer":"max 240 chars"}. If the metrics cannot answer it, reply {"answer":"I cannot tell from the tracked time yet. Ask about your longest block, most-used app, or switches."}. Question: ' + q + ' Metrics: ' + JSON

Validation (fail -> fallback:true, never forward bad output):
- habits: note string 1-400; experiment.text matches /^After .+, I will .+ for \d+ min\.?$/ and <=200 (Spanish: also accept /^Después de .+, (voy a|haré) .+ (por|durante) \d+ min\.?$/); trigger/action non-empty strings; minutes integer 5-120; metric in the 4 names; target finite number; direction atLeast|atMost; JUDGE_RE and THIRD_PERSON_RE must not match note or experiment.text.
- ask: answer string 1-240, no JUDGE_RE, no THIRD_PERSON_RE.
(The desktop also runs its own grounding check; the server does shape + language only.)

## Quota (the visible part)
The per-IP daily limiter (`makeDailyLimiter`, limit `aiDailyPerIp()`) must expose how many calls the IP has left.
- Every response on an AI_RATE_PATHS path (200, 400 and 429) carries headers `X-Quota-Left: <n>` and `X-Quota-Limit: <limit>`, and `Access-Control-Expose-Headers: X-Quota-Left, X-Quota-Limit`.
- The JSON body of the 4 /api/retoma/* routes also includes `quotaLeft` and `quotaLimit` (keep all existing fields; update the existing deepStrictEqual tests to the new shape).
- 429 because the daily per-IP cap is spent: body { ok:false, error:'rate limited', quotaLeft:0, quotaLimit }. 429 from the per-minute limiter: quotaLeft is the real remaining daily count.
- The shared global budget (`takeAiBudget`) behaviour stays as is (fallback:true when spent).

## Acceptance (binary)
- Tests cover: habits valid -> ok with server label; habits with "lazy"/"the user" -> fallback; ask valid; ask question of 500 chars -> 200 and the prompt contains at most 200 chars of it; bad bodies 400; metrics key `title` never appears in the prompt; X-Quota-Left decreases by 1 per call from the same IP (AI_DAILY_PER_IP=3: 2,1,0 then 429 with quotaLeft:0); both new paths in AI_RATE_PATHS.
- `node tests/retoma.test.js` passes; all other existing test files still pass.
Report: files changed, test counts before/after. Max 8 lines.
