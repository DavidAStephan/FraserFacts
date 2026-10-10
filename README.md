# Fraser Facts

Fraser Facts is a dashboard for deciding whether to swim at Dawn Fraser Baths in Balmain, Sydney. It pulls live conditions where feasible, scores the current window out of 10, finds the best remaining swim window today, and shows the reasoning transparently.

## Chosen stack

Next.js + React + TypeScript is the best fit here because it gives you:

- a polished local UI
- simple server-side API routes for aggregating third-party data
- one project to run locally with `npm install` and `npm run dev`

## What the app uses

- NSW Beachwatch GeoJSON API for pollution forecast and latest result context
- Open-Meteo forecast API for hourly weather, UV, wind, and rainfall history
- Open-Meteo marine API for sea surface temperature near the baths
- WillyWeather Balmain East tides page as the default tide fallback, with interpolation between listed high and low tides
- Optional WorldTides API if you set `WORLDTIDES_API_KEY` in `.env.local`
- Inner West Council opening-hours page for the seasonal hours
- Balmain Water Polo calendar feed as the primary water polo source
- Bundled fallback schedule for water polo in [`data/water-polo-schedule.json`](./data/water-polo-schedule.json) when the live calendar can't be reached
- Local Dawn Fraser portrait image sourced from Wikimedia Commons and bundled at [`public/dawn-fraser.jpg`](./public/dawn-fraser.jpg)

## Assumptions where exact live data is unavailable

- Sunlight on the baths is a heuristic based on sun position plus a practical west/north-west afternoon-sun assumption.
- Water temperature is a nearby marine-grid estimate, not an in-baths sensor.
- Tide height is approximate when the app is using the WillyWeather daily-event fallback instead of WorldTides.
- Water polo reads the Balmain Water Polo calendar feed. The feed has no venue field, so every club event is treated as using Dawn Fraser Baths. If the feed is unreachable, the app uses the bundled schedule and lowers confidence.
- A Beachwatch "Pollution likely" (red) forecast is treated as a closure, matching the Inner West Council notice.
- All times are calculated in Sydney time regardless of the server's timezone, so the app behaves the same locally and on a UTC cloud host.
- Missing sources lower confidence and surface `Unknown`; the app does not fabricate missing metrics.
- "Open now" uses the actual current time. In the hourly outlook, an hour counts as open if the baths are open for any part of it (for example 7-8am when they open at 7.15am).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env vars:

```bash
copy .env.example .env.local
```

3. Optional improvements:

- Add `WORLDTIDES_API_KEY` to `.env.local` for a better tide source.
- Edit [`data/water-polo-schedule.json`](./data/water-polo-schedule.json) each term so the fallback matches the club calendar.

4. Run locally:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Production-style local check

```bash
npm run build
```

## Scoring model

The scoring logic lives in [`lib/scoring.ts`](./lib/scoring.ts). It uses a weighted sum out of 10 with editable weights for:

- pollution / water quality risk
- rainfall drag
- weather warmth and brightness
- wind
- tide
- sunlight on the baths
- water polo closure impact
- water temperature

There are two built-in modes:

- `strict`: heavier water-quality weighting
- `balanced`: still prioritizes pollution, but gives comfort factors more room

The **Tune the score** panel lets each visitor set how much every factor matters (0 turns a factor off). Each factor's weight is its share of the total, shown as a percentage, and the panel previews the score as you drag. Settings are saved per browser in `localStorage`.

## Deployment

The app is a standard Next.js project with no database, so it runs on Vercel's free Hobby plan:

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. Choose **Add New → Project**, import this repository, and click **Deploy** (no settings need changing).
3. Optionally add `WORLDTIDES_API_KEY` under **Settings → Environment Variables**.

Every push to `main` redeploys automatically.

## Notes

- No auth
- Secrets belong in `.env.local` locally, or in the host's environment variables
- Server-side fetches are cached for about 10 minutes

## Advisory

This app is advisory only, not a health or safety guarantee. Always use your judgment and official site notices before swimming.
