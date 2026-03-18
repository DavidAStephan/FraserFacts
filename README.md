# Fraser Facts

Fraser Facts is a local-only dashboard for deciding whether to swim at Dawn Fraser Baths in Balmain, Sydney. It pulls live conditions where feasible, scores the current window out of 10, finds the best remaining swim window today, and shows the reasoning transparently.

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
- Balmain Water Polo calendar as the primary water polo source
- Local JSON fallback for water polo in [`data/water-polo-schedule.json`](./data/water-polo-schedule.json) when the live site blocks automated fetches
- Local Dawn Fraser portrait image sourced from Wikimedia Commons and bundled at [`public/dawn-fraser.jpg`](./public/dawn-fraser.jpg)

## Assumptions where exact live data is unavailable

- Sunlight on the baths is a heuristic based on sun position plus a practical west/north-west afternoon-sun assumption.
- Water temperature is a nearby marine-grid estimate, not an in-baths sensor.
- Tide height is approximate when the app is using the WillyWeather daily-event fallback instead of WorldTides.
- Water polo now tries the Balmain Water Polo calendar first. If the site returns a CloudFront/WAF challenge to automated fetches, the app falls back to the local JSON schedule and lowers confidence.
- Missing sources lower confidence and surface `Unknown`; the app does not fabricate missing metrics.

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
- Edit [`data/water-polo-schedule.json`](./data/water-polo-schedule.json) to match the schedule you care about.

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

The settings drawer stores your local weight tweaks in browser `localStorage`.

## Local-only notes

- No auth
- No deployment setup
- Secrets belong in `.env.local`
- Server-side fetches are cached briefly in memory

## Advisory

This app is advisory only, not a health or safety guarantee. Always use your judgment and official site notices before swimming.
