# Wanderly

Describe a trip in plain English; get a structured, editable day-by-day itinerary.

The model returns JSON on a fixed schema. The app parses it, validates it, repairs
it when it's broken, and renders it as interactive components — days you can
collapse, stops you can drag, reorder, move between days, and delete with undo,
plus a refinement loop that edits the plan in place. There is no chat transcript
anywhere in the UI.

---

## Setup

Requires **Node 20.9+** (Node 22.18+ to run the tests, which rely on native type
stripping).

```bash
npm install
```

Create `.env.local` from the template and add a Gemini API key — free at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey):

```bash
cp .env.example .env.local
```

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash   # optional
```

Then:

```bash
npm start
```

Open <http://localhost:3000>.

> `npm start` runs the dev server, so a clean `npm install && npm start` works
> with no build step. For a production build use `npm run build && npm run serve`.

| Command | What it does |
| --- | --- |
| `npm start` / `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run serve` | Serve the production build |
| `npm test` | Failure-handling + motion test suite (58 tests) |
| `npm run typecheck` | `tsc --noEmit` |

### The API key never reaches the browser

There is no `NEXT_PUBLIC_` variable in this project. The key is read only in
`lib/gemini.ts`, which is imported only by the route handler at
`app/api/itinerary/route.ts` and throws if it is ever bundled for the client.
The browser talks exclusively to `/api/itinerary`.

---

## How it works

```
Composer ──POST──▶ /api/itinerary ──▶ Gemini (responseSchema, streaming)
                          │
                          ├── NDJSON stream of raw deltas ──▶ optimistic preview
                          │
                          └── on completion: parse → validate → normalise
                                   │                       │
                                   ├── success ────────────┴──▶ `result` event
                                   └── failure → one repair round-trip → retry
```

**The server is authoritative.** Deltas exist only so the UI can show progress.
The `result` event carries the parsed, validated, normalised itinerary, so the
client never has to trust its own optimistic partial parse.

### Layout

| Path | Role |
| --- | --- |
| `lib/schema.ts` | The contract. Zod schema, TS types, and the OpenAPI schema sent to Gemini — one source of truth used three ways. |
| `lib/partial-json.ts` | Tolerant JSON: fence stripping, trailing commas, truncation repair, streaming snapshots. |
| `lib/normalize.ts` | Salvage layer. Turns a validated blob into renderable state, dropping only what's broken. |
| `lib/errors.ts` | The error taxonomy — 13 kinds, each with a cause, a consequence, and a recovery path. |
| `lib/motion.ts` | Scroll-choreography math (`smoothstep`, `segmentInOut`). |
| `hooks/useTripPlanner.ts` | The state machine: requests, streaming, and every itinerary edit. |
| `hooks/useCinematicScroll.ts` | The hero's rAF loop. Writes CSS variables; never re-renders React. |
| `app/api/itinerary/route.ts` | The only place the API key is used. |

---

## Handling bad model output

This is where most of the work went. Structured-output mode makes valid JSON
*likely*, not guaranteed, and "likely" is not something a UI can be built on.

**Malformed JSON** — `parseLoose` applies repairs in increasing order of
invasiveness and stops at the first that parses: markdown fences, conversational
padding around the JSON body, trailing commas, `NaN`/`undefined`, truncation,
typographic quotes. Which repairs were needed is reported, not hidden — the UI
shows them in a "what we tried" disclosure.

**Truncated JSON** — a single scan tracks string/escape state, container depth,
and key-vs-value position, then rewinds to the last point at which the document
could be legally closed. Two judgement calls are encoded there:

- A *terminated string in value position* is safe to keep — its closing quote
  proves it's complete. This is what makes the streaming preview fill in smoothly
  rather than a whole day at a time.
- A *trailing bare number* is not. `…"estimatedCost":2` might be a complete `2`
  or the first digit of `250`, and nothing in the text distinguishes them.
  Dropping it costs an undefined field for a few milliseconds; keeping it risks
  rendering a confidently wrong price.

**Wrong shape** — validation is strict about the skeleton (a day needs a title
and stops; a stop needs a name) and lenient about the trimmings. Costs arrive as
`1200`, `"$1,200"`, `"free"`, or `"varies"`; times as `"9:30 PM"`, `"0900"`, or
`"99:99"`; `tips` as a string, an array, or `null`. Each is coerced or dropped
individually.

**Partial results beat total failure** — one malformed day out of nine costs you
that day, not the trip. Every drop is surfaced in a dismissible notice ("2 stops
on day 3 were unreadable and skipped") rather than silently swallowed. Remaining
days are renumbered so the UI never shows "Day 1, Day 3, Day 3".

**Self-repair** — if parsing still fails, the server hands the model its own
broken output plus the parser's complaint and asks for a corrected document, at
low temperature, once. The UI says what it's doing while this happens
("The model's response was malformed — repairing it…") instead of showing an
unexplained pause.

**Empty, slow, failed** — 13 error kinds, each mapped to a real HTTP status and a
specific recovery. The retry button only appears when retrying could actually
help, so a missing API key never invites you into a loop that can't succeed.
Timeouts are bounded at both ends (70s server, 90s client).

### No stale response can overwrite a newer one

Two independent guards, deliberately redundant:

1. **Sequence numbers.** Every request captures a monotonic `seq`; every dispatch
   is gated on still being the newest. A superseded response is computed and
   discarded.
2. **AbortController.** Starting a request aborts the previous one, and the read
   loop bails out mid-stream if it discovers it's been superseded.

(1) makes correctness airtight even if an abort lands late or a microtask is
already queued. (2) stops us paying for tokens nobody will see. The stream reader
also treats "ended without a terminal event" as a dropped connection rather than
silently succeeding.

### Verifying it

```bash
npm test
```

58 tests, no framework — Node's built-in runner with native type stripping. The
adversarial cases are real inputs, including an exhaustive check that **every
prefix** of a realistic response produces either valid JSON or nothing:

```js
for (let i = 0; i <= full.length; i++) {
  const completed = completeTruncatedJson(full.slice(0, i));
  if (completed === null) continue;
  assert.doesNotThrow(() => JSON.parse(completed));
}
```

These tests caught a real bug during development: the scanner marked only
structural punctuation as safe, never a completed *value*, so terminated strings
were being thrown away mid-stream and the preview filled in a day at a time
instead of a stop at a time.

---

## Design

Dark-first "Midnight Aurora": layered parallax scenery, cream paper cards, a
display serif against Inter, and a scroll-scrubbed hero whose canyon walls part
as you descend.

The hero borrows its motion language — sticky stage, pointer drift,
`smoothstep`/`segmentInOut` timeline, cream cards, round nav buttons — from a
cinematic scroll page supplied as reference. Three deliberate departures:

- **The scenery is self-authored SVG**, not the reference's photographs. Those
  were hotlinked from a third party, as was its commercial display typeface.
- **The runway is ~175vh, not 3700px.** The composer is usable at scroll position
  zero. The cinema plays around the tool, never in front of it.
- **The timeline is normalised to 0..1** across whatever runway exists, rather
  than keyed to absolute pixel offsets that silently re-time themselves on any
  viewport that isn't the author's.

Accessibility is not bolted on: 4.5:1 contrast in both themes including muted
text, drag operations paired with keyboard/button equivalents (WCAG 2.2), the
cost chart backed by a screen-reader table, colour never the sole carrier of
meaning, and `prefers-reduced-motion` honoured throughout — the stage still
scrubs, it just stops gliding and following the cursor.

---

## Known limitations

- **No itinerary edits feed back into refinement.** Refinement sends the current
  itinerary, so manual edits *are* preserved — but the model isn't told which
  parts you touched, so it may undo a manual reorder if the instruction is broad.
  Marking user-edited stops as pinned is the obvious next step.
- **Reordering is within-day drag plus cross-day via a menu.** True drag-and-drop
  between days needs a shared drag context; the "Move to…" select covers the
  capability accessibly, but it's less direct.
- **Days themselves can be deleted but not reordered.** Stops can be.
- **No diff highlighting after a refinement.** The prompt asks the model to leave
  untouched content byte-identical, which mostly holds, but the UI doesn't
  currently show you what changed. This was the next thing on my list.
- **Cost estimates are the model's guesses.** They're plausible, not researched,
  and the app presents them as estimates.
- **Sessions are `localStorage` only** — per browser, capped at 12, lost when site
  data is cleared. No accounts, no sync.
- **Thinking is disabled** (`thinkingBudget: 0`) to keep time-to-first-token low.
  It trades a little planning depth for a stream that actually streams; the
  system instruction carries the quality. `gemini-2.5-pro` is a one-line change.
- **`npm audit` reports 2 advisories** in the `postcss` version bundled inside
  Next 15's build tooling. Both are build-time CSS sourcemap issues with no
  runtime exposure; clearing them requires a Next 16 major bump.
- **Not load-tested.** Single user, local dev. The route holds a streaming
  connection for up to 70s, which needs thought before real deployment.

---

## AI usage

> **Note for the submitter:** the brief asks for an honest account of what AI was
> used for, and says being honest about it counts in your favour. Edit the
> section below so it reflects what you actually did versus what was generated —
> and make sure you can explain every file in here, because the interview will
> ask you to extend and debug it live.

This project was built with heavy AI assistance (Claude), used for:

- Scaffolding the Next.js app, the component tree, and the Tailwind design tokens.
- Writing the tolerant JSON parser and the salvage/normalisation layer.
- Generating the test suite, including the adversarial and property-style cases.
- Adapting the supplied cinematic-scroll reference into the React hero.

Decisions that were made explicitly rather than accepted from a first draft, and
which are worth being able to defend:

- Server-authoritative validation with client-side deltas used only for preview.
- Dropping trailing bare numbers during truncation repair, for the reason above.
- Salvage-over-reject in normalisation, with visible reporting of what was lost.
- Redundant stale-response guards (sequence number *and* abort) rather than one.
- Clamping the day rail instead of infinite-looping it, unlike the reference.

Two real bugs surfaced during development and are worth understanding:

1. The truncation scanner never marked completed *values* as safe points, only
   punctuation — caught by the test suite.
2. The hero's rAF loop cleanup cancelled the pending frame without clearing its
   `pending` flag, so React StrictMode's mount → unmount → remount cycle left the
   loop permanently dead on the second mount.

---

## Time spent

Roughly **8 hours**. Approximate split: 1h on schema and prompt design, 3h on the
failure-handling layer and its tests, 2h on the design system and cinematic hero,
1.5h on the interactive itinerary components, 0.5h on this README.

*Adjust this to your actual time before submitting.*

---

## Stretch goals covered

- [x] Streaming, with progressive rendering from partial JSON
- [x] Refinement loop that edits rather than regenerates
- [x] Save and reload sessions
- [x] Polish: animation, dark mode, keyboard navigation, print stylesheet
- [x] Different block kinds (six stop types) rendered distinctly, plus a cost chart
- [ ] Diff highlighting after refinement
