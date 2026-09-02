# Trip Planner

An AI trip planner. You describe a trip in a sentence, it comes back with a day-by-day itinerary you can actually edit — drag stops around, move them between days, delete stuff, and ask it to change things ("make day 2 cheaper", "add more food stops") without starting over.

It's not a chatbot. The model returns structured JSON and the app renders it as real components (day cards, stop cards, a map), not a wall of text.

‼️Live: https://trip-planner-orcin-omega.vercel.app
‼️Video(demo) :https://youtu.be/Ij_O5gQQpMY

## Setup

You need Node 20+ and a free Gemini API key.

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and add your key:

```
GEMINI_API_KEY=your_key_here
```

Get one at https://aistudio.google.com/apikey (free tier is fine).

```bash
npm start
```

Then open http://localhost:3000.

Other commands:

```bash
npm run build     # production build
npm run serve     # run the production build
npm test          # runs the test suite
```

## How it's built

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind for styling
- Gemini for generating the itinerary, with a JSON schema so the response is structured instead of free text
- The API call happens server-side in `app/api/itinerary/route.ts` — the key never goes to the browser
- Framer Motion for animations, Three.js for a small 3D globe on the landing page
- Zod for validating whatever the model sends back

## Handling bad AI output

This was the main thing I focused on, since the assignment specifically calls it out.

Problems I ran into and how I dealt with them:

**Model returns broken JSON.** Sometimes it wraps the JSON in a code fence, adds a sentence before/after it, leaves a trailing comma, or gets cut off mid-response. There's a parser (`lib/partial-json.ts`) that tries a few fallback repairs before giving up — strip code fences, remove trailing commas, try to close an unfinished object/array. If none of that works, it asks the model to fix its own broken output once before actually failing.

**Model returns the wrong shape.** Missing fields, a cost that's a string instead of a number, a time like "9pm" instead of "21:00", stuff like that. Instead of rejecting the whole itinerary, `lib/normalize.ts` tries to coerce each field and only drops what it genuinely can't use — so one bad day doesn't kill the other four.

**The request itself fails.** Rate limits, the model being overloaded (503, happens a lot with the newer models), or the connection just dropping mid-stream. The app retries automatically and falls back to a different model if the first one is busy. If a request restarts mid-response, it doesn't just glue the two responses together — it throws away the partial one and starts clean, since mixing them produces garbage JSON.

**Stale requests.** If you type something new before the first response finishes, the old one gets cancelled so it can't overwrite what you're looking at now.

When something did have to be repaired or a request had to retry, there's a small dismissible notice that says so, instead of pretending everything went smoothly. You can see it in the screenshots/demo — it happened a couple of times while I was testing because Gemini's newer models get overloaded pretty often.

## What's not done / known issues

- If you edit the itinerary manually and then ask it to refine something, it's not guaranteed to leave your manual edits alone — the model gets the whole itinerary back but doesn't know which parts you touched by hand.
- No diff view after a refinement — you don't get a highlight of what changed, just the updated itinerary.
- Saved trips are stored in the browser (localStorage), not an account — clear your browser data and they're gone.
- Coordinates for the map come from the model, so they're usually right for well-known places but can be off for smaller/less famous spots.
- Not tested under real load, just normal single-user usage.

## AI usage

I used an AI coding assistant for a good chunk of this — scaffolding the project, writing the JSON repair/validation logic, generating tests, and building out the UI components. I reviewed and tested everything, understand how it works, and can walk through any part of it.

Things I made deliberate calls on rather than just accepting a first draft:

- Keeping the server as the source of truth — the UI shows live progress while streaming, but only trusts the final validated result
- What counts as "safe to keep" vs "drop" when a response gets cut off mid-stream
- Restarting a request cleanly instead of trying to patch a broken one together

## Time spent

Around 8 hours total, spread across the schema/prompt design, the error handling and tests, and the UI.
