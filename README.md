<div align="center">

# Wanderly

**Describe a trip in plain English. Get an itinerary you can actually edit.**

No chat transcript. The model returns JSON on a fixed schema, and the app renders
it as components you can drag, prune, reorder and rewrite.

<br>

![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-087EA4?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Three.js](https://img.shields.io/badge/three.js-r185-000000?style=flat-square&logo=three.js&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-3.5%20Flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
<br>
![tests](https://img.shields.io/badge/tests-85%20passing-3d7a4d?style=flat-square)
![bundle](https://img.shields.io/badge/First%20Load%20JS-188%20kB-8a6d15?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-555?style=flat-square)

</div>

---

## The idea

You type a sentence. A railway carriage carries it away, runs a lap of the globe,
and comes back with a trip.

That conceit isn't decoration — it's the app's structure. Three screens, one
journey:

| | Screen | What it does |
|---|---|---|
| **1** | **The platform** | The composer *is* a carriage — roof, couplings, spoked wheels — idling on a moving track, with the globe's limb as the horizon behind it. |
| **2** | **The journey** | Replaces the loading spinner. The train runs its orbit while the destination appears the moment the model names it, and each day **boards a departure board** as it finishes streaming. |
| **3** | **The itinerary** | A globe focused on your destination with a pin per stop and great-circle arcs between them, then editable day cards. |

---

## Quick start

Requires **Node 20.9+** (22.18+ to run the tests — they use native type stripping).

```bash
npm install
cp .env.example .env.local
```

Add a free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey):

```
GEMINI_API_KEY=your_key_here
```

```bash
npm start
```

Open <http://localhost:3000>.

| Command | |
| --- | --- |
| `npm start` / `npm run dev` | Dev server on :3000 |
| `npm test` | 85 tests, no framework |
| `npm run build` / `npm run serve` | Production build / serve it |
| `npm run typecheck` | `tsc --noEmit` |

> **The key never reaches the browser.** There is no `NEXT_PUBLIC_` variable
> anywhere in this project. It's read only in `lib/gemini.ts`, which is imported
> only by the route handler — and which throws if it's ever bundled for the
> client. The browser talks exclusively to `/api/itinerary`.

---

## How it works

```
Composer ──POST──▶ /api/itinerary ──▶ Gemini (responseSchema, streaming)
                        │
                        ├── NDJSON deltas ─────▶ optimistic preview
                        ├── reset ─────────────▶ discard, attempt restarting
                        │
                        └── on completion: parse → validate → normalise
                                 ├── ok ────────▶ result
                                 └── failed ────▶ one repair round-trip → retry
```

**The server is authoritative.** Deltas exist only so the UI can show progress;
the `result` event carries the parsed, validated, normalised itinerary. The
client never has to trust its own optimistic parse.

<details>
<summary><b>Where things live</b></summary>

<br>

| Path | Role |
| --- | --- |
| `lib/schema.ts` | The contract. One source of truth used three ways: Zod validation, TS types, and the OpenAPI schema sent to Gemini. |
| `lib/partial-json.ts` | Tolerant JSON — fences, trailing commas, truncation repair, streaming snapshots. |
| `lib/normalize.ts` | Salvage layer. Turns a validated blob into renderable state, dropping only what's broken. |
| `lib/errors.ts` | 15 error kinds, each with a cause, a consequence, and a recovery path. |
| `lib/gemini.ts` | The only place the API key is used. Retry, backoff and model fallback. |
| `lib/globe.ts` | Globe geometry — projection, great-circle arcs, centroids. No Three.js import, so it unit-tests in Node. |
| `lib/geo/land.json` | 64 kB of pre-decoded Natural Earth coastline (public domain). |
| `lib/motion.ts` | Scroll choreography (`smoothstep`, `segmentInOut`). |
| `hooks/useTripPlanner.ts` | The state machine: requests, streaming, and every itinerary edit. |
| `hooks/useCinematicScroll.ts` | The hero's rAF loop. Writes CSS variables; never re-renders React. |
| `components/globe/Globe.tsx` | The lazy boundary. **Must never import `three`.** |
| `components/TrainCoach.tsx` | The carriage. |

</details>

---

## Handling bad model output

> This is where most of the work went. Structured-output mode makes valid JSON
> *likely*, not guaranteed — and "likely" is not something you can build a UI on.

### Malformed JSON

`parseLoose` applies repairs in increasing order of invasiveness and stops at the
first that parses: markdown fences, conversational padding, trailing commas,
`NaN`, truncation, typographic quotes. Which repairs were needed is **reported,
not hidden** — the UI shows them in a "what we tried" disclosure.

### Truncated JSON

One scan tracks string/escape state, container depth and key-vs-value position,
then rewinds to the last point the document could be legally closed. Two
judgement calls are encoded there:

- A **terminated string in value position** is kept — its closing quote proves
  it's complete. This is what makes the preview fill in stop-by-stop rather than
  a whole day at a time.
- A **trailing bare number** is dropped. `…"estimatedCost":2` might be a complete
  `2` or the first digit of `250`, and nothing distinguishes them. Losing a field
  for 100 ms beats rendering a confidently wrong price.

### Wrong shape

Strict about the skeleton (a day needs a title and stops; a stop needs a name),
lenient about the trimmings. Costs arrive as `1200`, `"$1,200"`, `"free"`,
`"varies"`; times as `"9:30 PM"`, `"0900"`, `"99:99"`; `tips` as a string, an
array, or `null`. Each is coerced or dropped individually.

**Partial results beat total failure** — one malformed day out of nine costs you
that day, not the trip. Every drop surfaces as a note ("2 stops on day 3 were
unreadable and skipped"). Remaining days are renumbered so you never see
"Day 1, Day 3, Day 3".

### Self-repair

If parsing still fails, the server hands the model its own broken output plus the
parser's complaint and asks for a correction — once, at low temperature. The UI
says so while it happens rather than showing an unexplained pause.

### Provider congestion

The most common real-world failure, and the one that took the most code. Under
load Gemini accepts the connection, streams 30–80 chunks, then **drops it**.
Retrying only *before* the first byte leaves exactly that case unhandled.

So restarts are always allowed — preceded by a `reset` event that clears both the
server buffer and the client's optimistic preview. Appending a second attempt to
a partial first would splice two responses into one buffer and parse into
nonsense. Attempts are budgeted globally across a fallback chain of
less-contended models, so a genuinely dead provider fails in seconds instead of
grinding through every model twice.

> Measured against a congested provider: **1 of 3 requests succeeded before this
> change, 4 of 4 after** — one of which transparently survived a mid-stream drop.

### No stale response can overwrite a newer one

Two deliberately redundant guards:

1. **Sequence numbers** — every request captures a monotonic `seq`; every
   dispatch is gated on still being newest. A superseded response is computed and
   discarded.
2. **AbortController** — starting a request aborts the previous one, and the read
   loop bails mid-stream once it discovers it's been superseded.

(1) keeps correctness airtight if an abort lands late or a microtask is already
queued. (2) stops us paying for tokens nobody will see.

---

## The globe is real data

The schema asks Gemini for decimal `lat`/`lng` on every stop. The camera eases to
those coordinates, a pin drops per located stop, and great-circle arcs connect
them in visit order. Out-of-range values are **dropped, not clamped** — a clamped
pin is confidently in the wrong place — and the panel hides itself entirely if
nothing was geocoded.

Scenery is procedural: coastlines are Natural Earth vectors drawn as line
geometry, the atmosphere is a fresnel shader on a back-faced sphere, the ocean is
a Fibonacci dot field. No texture assets, no licensing questions.

**And it stays out of the initial bundle.** Three.js is ~600 kB, on a page whose
job is to accept one sentence. Everything touching R3F sits at or below
`GlobeCanvas.tsx`, reachable only via `dynamic(…, { ssr: false })`, mounting on
idle. **First Load JS: 188 kB** — 5 kB more than before the globe existed.

<details>
<summary><b>A live run</b></summary>

<br>

```
3 days in Kyoto, temples and food, mid budget
→ 3 days · 14 stops · 14/14 geocoded · 108 deltas · 0 repairs

Kiyomizu-dera    34.9949, 135.7850   ¥400
Fushimi Inari    34.9671, 135.7727   free
Arashiyama       35.0172, 135.6713
```

Those are the real coordinates, and ¥400 is the real admission price.

</details>

---

## Design

**Night Express** — brass, warm cream and green-black. Deliberately not
cyan-on-dark: that palette is the default "AI product" skin and belongs to no
subject in particular. Brass and cream belong to rail travel.

Contrast was derived, not eyeballed: muted text clears **7.4:1** in dark and
**7.6:1** in light. Drag has keyboard and single-pointer equivalents (WCAG 2.2),
the cost chart is backed by a screen-reader table, colour is never the sole
carrier of meaning, and `prefers-reduced-motion` is honoured throughout — the
stage still scrubs, it just stops gliding.

---

## Testing

```bash
npm test
```

85 tests on Node's built-in runner. No framework, no transpiler — Node strips the
types natively.

The adversarial cases are real inputs, including an exhaustive check that **every
prefix** of a realistic response yields valid JSON or nothing:

```js
for (let i = 0; i <= full.length; i++) {
  const completed = completeTruncatedJson(full.slice(0, i));
  if (completed === null) continue;
  assert.doesNotThrow(() => JSON.parse(completed));
}
```

That test caught a real bug: the scanner marked only structural punctuation as
safe, never a completed *value*, so terminated strings were thrown away
mid-stream and the preview filled a day at a time instead of a stop at a time.

---

## Known limitations

- **Coordinates are the model's.** Strong on landmarks, shakier on small venues.
  A gazetteer lookup would fix it, at the cost of an API dependency.
- **Manual edits aren't pinned during refinement.** The current itinerary is sent
  back, so edits survive — but the model isn't told which parts you touched, so a
  broad instruction can undo a manual reorder.
- **No diff highlighting after a refinement.** The prompt asks for untouched
  content to come back byte-identical, which mostly holds, but the UI doesn't
  show you what changed. Next on the list.
- **Days can be deleted but not reordered.** Stops can be.
- **Costs are estimates**, presented as such.
- **Sessions are `localStorage`** — per browser, capped at 12, no accounts.
- **Model ids rot.** Google retires models for *new* API keys while still listing
  them on `/models`, so a stale default fails only for recent signups. The app
  now falls back automatically and says so.
- **Thinking is `low`, not off** — 3.x rejects `thinkingBudget: 0` outright. At
  default depth the model thinks ~64 s then returns everything in one chunk,
  defeating streaming entirely.
- **The globe is `aria-hidden`.** The itinerary is the accessible representation
  of the same data. It also skips rendering without WebGL or on ≤2-core devices.
- **Not load-tested.** The route holds a streaming connection for up to 70 s.

---

## AI usage

> **Note for the submitter:** the brief asks for an honest account of what AI was
> used for. Edit this to reflect what you actually did — and make sure you can
> explain every file here, because the interview will ask you to extend and debug
> it live.

Built with heavy use of an AI coding assistant, for scaffolding, the tolerant
JSON parser and salvage layer, the test suite, and adapting a cinematic-scroll
reference into the React hero.

Decisions worth being able to defend:

- Server-authoritative validation; deltas are preview-only.
- Dropping trailing bare numbers during truncation repair.
- Salvage-over-reject, with visible reporting of what was lost.
- Redundant stale-response guards rather than one.
- `reset`-then-restart instead of refusing to retry after first byte.

Four real bugs found and fixed during development:

1. The truncation scanner never marked completed *values* as safe points.
2. The hero's rAF cleanup cancelled its frame without clearing the `pending`
   flag, so StrictMode's remount left the loop permanently dead.
3. `dynamic()` was doing nothing — an eager `Canvas` import two lines above it
   pulled all of three.js into the entry chunk (425 kB → 188 kB once fixed).
4. Retry-before-first-byte left the most common provider failure unhandled.

---

## Time spent

Roughly **8 hours** — 1 h schema and prompts, 3 h failure handling and its tests,
2 h design system and the 3D/hero work, 1.5 h interactive components, 0.5 h docs.

*Adjust to your actual time before submitting.*

---

<div align="center">

MIT

</div>
