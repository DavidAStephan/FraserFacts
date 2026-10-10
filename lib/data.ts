import SunCalc from "suncalc";
import * as cheerio from "cheerio";
import localWaterPoloSchedule from "@/data/water-polo-schedule.json";
import {
  BEACHWATCH_GEOJSON_URL,
  BEACHWATCH_SITE_URL,
  DAWN_FRASER_COORDS,
  DAWN_FRASER_OPENING_HOURS_URL,
  OPEN_METEO_FORECAST_URL,
  OPEN_METEO_MARINE_URL,
  SYDNEY_TIMEZONE,
  TIDE_FALLBACK_URL,
  WATER_POLO_CALENDAR_URL,
  WATER_POLO_EVENTS_URL
} from "@/lib/constants";
import { withCache } from "@/lib/cache";
import { AggregatedResponse, HourlyCondition, MetricConfidence, ScoreMode, SourceReference } from "@/lib/types";
import { DEFAULT_WEIGHTS, explainBestTime, findBestWindow, recommendationLabel, scoreTimeline } from "@/lib/scoring";
import {
  average,
  clamp,
  confidenceLevel,
  formatSydneyTime,
  sydneyDateKey,
  sydneyParts,
  sydneyWallTimeToDate,
  weatherCodeLabel
} from "@/lib/utils";

const TTL = 1000 * 60 * 10;

type ForecastPayload = {
  hourly?: {
    time: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    cloud_cover?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    uv_index?: number[];
    precipitation?: number[];
    rain?: number[];
  };
};

type MarinePayload = {
  hourly?: {
    time: string[];
    sea_surface_temperature?: number[];
  };
};

type BeachwatchFeatureCollection = {
  features?: Array<{
    properties?: {
      siteName?: string;
      pollutionForecast?: string;
      pollutionForecastTimeStamp?: string;
      latestResult?: string;
      latestResultRating?: number;
      latestResultObservationDate?: string;
    };
  }>;
};

type TideEvent = {
  timeIso: string;
  heightM: number;
  type: "high" | "low";
};

type TideData = {
  events: TideEvent[];
  source: SourceReference;
  confidence: MetricConfidence;
};

type WaterPoloSchedule = {
  venue: string;
  timezone: string;
  source: string;
  blocks: Array<{
    dayOfWeek: number;
    start: string;
    end: string;
    note?: string;
  }>;
};

type WaterPoloEvent = {
  startIso: string;
  endIso: string;
  title: string;
};

type CalendarFeedEvent = {
  title?: string;
  start?: string;
  end?: string;
};

type OpeningHoursData = {
  source: SourceReference;
  confidence: MetricConfidence;
  rules: {
    octNov: { open: string; close: string };
    decFeb: { open: string; close: string };
    marApr: { open: string; close: string };
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "user-agent": "FraserFacts/0.1 (local dashboard)" },
    next: { revalidate: 600 }
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "FraserFacts/0.1 (local dashboard)" },
    next: { revalidate: 600 }
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }
  return response.text();
}

function startOfTodaySydney() {
  return sydneyDateKey(new Date());
}

// Open-Meteo returns Sydney wall-clock times without an offset; convert them to real UTC ISO instants.
function toUtcTimes<T extends { hourly?: { time: string[] } }>(payload: T): T {
  if (payload.hourly?.time) {
    payload.hourly.time = payload.hourly.time.map((time) => sydneyWallTimeToDate(time).toISOString());
  }
  return payload;
}

function parseFeedTime(value: string) {
  return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? new Date(value) : sydneyWallTimeToDate(value);
}

function rainfallPenalty(mm24?: number, mm48?: number, mm72?: number) {
  const weighted = (mm24 ?? 0) * 0.55 + (mm48 ?? 0) * 0.3 + (mm72 ?? 0) * 0.15;
  return clamp(weighted / 25);
}

// Beachwatch forecasts are "Unlikely" (green), "Possible" (amber), "Likely" (red) or "Forecast not available".
// Latest sample ratings are 4 Good, 3 Fair, 2 Poor, 1 Bad.
function isPollutionLikely(pollutionForecast?: string) {
  return (pollutionForecast ?? "").trim().toLowerCase() === "likely";
}

function pollutionRiskFromBeachwatch(pollutionForecast?: string, latestRating?: number) {
  const forecast = (pollutionForecast ?? "").trim().toLowerCase();
  if (forecast === "likely") return 0.85;
  if (forecast === "possible") return 0.55;
  if (forecast === "unlikely") return latestRating !== undefined && latestRating <= 2 ? 0.3 : 0.15;
  if (latestRating === 4) return 0.2;
  if (latestRating === 3) return 0.4;
  if (latestRating === 2) return 0.65;
  if (latestRating === 1) return 0.85;
  return 0.5;
}

function pollutionSummary(pollutionForecast?: string, latestResult?: string) {
  if (!pollutionForecast && !latestResult) return "Beachwatch pollution context unavailable.";
  const forecast = !pollutionForecast
    ? "Forecast unavailable"
    : /^forecast/i.test(pollutionForecast)
      ? pollutionForecast
      : `Pollution ${pollutionForecast.toLowerCase()}`;
  return latestResult ? `${forecast}. Latest result: ${latestResult}.` : `${forecast}.`;
}

function sunlightHeuristic(isoTime: string) {
  const date = new Date(isoTime);
  const position = SunCalc.getPosition(date, DAWN_FRASER_COORDS.latitude, DAWN_FRASER_COORDS.longitude);
  const altitude = position.altitude;
  const azimuthFromNorth = ((position.azimuth * 180) / Math.PI + 360 + 180) % 360;

  if (altitude <= 0) {
    return { score: 0, label: "No direct sun" };
  }

  const directionalFit = clamp(1 - Math.abs(azimuthFromNorth - 285) / 120);
  const elevationFit = clamp(altitude / (Math.PI / 3));
  const score = clamp(directionalFit * 0.65 + elevationFit * 0.35);

  let label = "Low direct sun";
  if (score >= 0.72) label = "High direct sun";
  else if (score >= 0.42) label = "Medium direct sun";

  return { score, label };
}

function parseTideDate(baseDate: string, timeText: string) {
  const minutesOfDay = parseMinutes(timeText.replace(":", ".").replace(/\s+/g, ""));
  if (minutesOfDay === null) {
    throw new Error(`Could not parse tide time "${timeText}"`);
  }
  const hours = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
  const minutes = String(minutesOfDay % 60).padStart(2, "0");
  return sydneyWallTimeToDate(`${baseDate.slice(0, 10)}T${hours}:${minutes}`);
}

function interpolateTide(target: Date, events: TideEvent[]) {
  if (events.length < 2) {
    return { heightM: undefined, state: "unknown" as const };
  }

  const sorted = [...events].sort((a, b) => new Date(a.timeIso).getTime() - new Date(b.timeIso).getTime());
  let prev = sorted[0];
  let next = sorted[1];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (new Date(current.timeIso).getTime() >= target.getTime()) {
      next = current;
      prev = sorted[Math.max(0, index - 1)];
      break;
    }
    prev = current;
    next = sorted[Math.min(sorted.length - 1, index + 1)];
  }

  const prevTime = new Date(prev.timeIso).getTime();
  const nextTime = new Date(next.timeIso).getTime();
  const duration = Math.max(1, nextTime - prevTime);
  const progress = clamp((target.getTime() - prevTime) / duration);
  const cosineProgress = (1 - Math.cos(progress * Math.PI)) / 2;
  const heightM = prev.heightM + (next.heightM - prev.heightM) * cosineProgress;

  let state: "rising" | "falling" | "high" | "low" = prev.type === "low" ? "rising" : "falling";
  if (Math.abs(progress) < 0.03) state = prev.type;
  if (Math.abs(1 - progress) < 0.03) state = next.type;

  return { heightM, state };
}

async function getForecast() {
  return withCache("forecast", TTL, async () => {
    const url = `${OPEN_METEO_FORECAST_URL}?latitude=${DAWN_FRASER_COORDS.latitude}&longitude=${DAWN_FRASER_COORDS.longitude}&timezone=${encodeURIComponent(
      SYDNEY_TIMEZONE
    )}&hourly=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index,precipitation,rain&forecast_days=1&past_days=3`;
    return toUtcTimes(await fetchJson<ForecastPayload>(url));
  });
}

async function getMarine() {
  return withCache("marine", TTL, async () => {
    const url = `${OPEN_METEO_MARINE_URL}?latitude=${DAWN_FRASER_COORDS.latitude}&longitude=${DAWN_FRASER_COORDS.longitude}&timezone=${encodeURIComponent(
      SYDNEY_TIMEZONE
    )}&hourly=sea_surface_temperature&forecast_days=1`;
    return toUtcTimes(await fetchJson<MarinePayload>(url));
  });
}

async function getBeachwatch() {
  return withCache("beachwatch", TTL, async () => fetchJson<BeachwatchFeatureCollection>(BEACHWATCH_GEOJSON_URL));
}

async function getOpeningHours(): Promise<OpeningHoursData> {
  return withCache("opening-hours", TTL, async () => {
    const pageText = cheerio.load(await fetchText(DAWN_FRASER_OPENING_HOURS_URL))("body").text().replace(/\s+/g, " ").trim();
    // The page lists every Inner West aquatic centre; only read the Dawn Fraser Baths section.
    const sectionStart = pageText.search(/Dawn Fraser Baths \(DFB\)|Dawn Fraser Baths is a seasonal facility/i);
    const hoursText = sectionStart >= 0 ? pageText.slice(sectionStart) : pageText;

    let parsedCount = 0;
    const parseRange = (fromMonth: string, toMonth: string, fallbackOpen: string, fallbackClose: string) => {
      const time = "\\d{1,2}(?:\\.\\d{2})?\\s*";
      const regex = new RegExp(`${fromMonth}\\s*[-–]\\s*${toMonth}[^0-9]{0,80}?(${time}am)\\s*(?:-|–|to)\\s*(${time}pm)`, "i");
      const match = hoursText.match(regex);
      if (match) parsedCount += 1;
      return {
        open: match ? match[1].replace(/\s+/g, "") : fallbackOpen,
        close: match ? match[2].replace(/\s+/g, "") : fallbackClose
      };
    };

    const rules = {
      octNov: parseRange("October", "November", "7.15am", "6.30pm"),
      decFeb: parseRange("December", "February", "6.45am", "7pm"),
      marApr: parseRange("March", "April", "7.15am", "6.30pm")
    };
    const parsedAll = parsedCount === 3;
    const redIconNote = /red icon (?:will indicate|indicates)/i.test(hoursText)
      ? " Inner West also states that a red Beachwatch icon means the baths will not be open."
      : "";

    return {
      source: {
        name: "Inner West Council opening hours",
        url: DAWN_FRASER_OPENING_HOURS_URL,
        lastUpdated: new Date().toISOString(),
        note: "Official seasonal opening hours plus closure notes scraped from Inner West Council."
      },
      confidence: {
        label: "Opening hours",
        value: parsedAll ? 0.9 : 0.55,
        level: parsedAll ? "high" : "medium",
        note: parsedAll
          ? `Official hours page parsed successfully.${redIconNote}`
          : "Could not read every season from the council page, so some hours are last-known values.",
        source: { name: "Inner West Council", url: DAWN_FRASER_OPENING_HOURS_URL }
      },
      rules
    };
  });
}

async function getTides(): Promise<TideData> {
  if (process.env.WORLDTIDES_API_KEY) {
    const day = startOfTodaySydney();
    return withCache("tides-worldtides", TTL, async () => {
      const worldTidesUrl = `https://www.worldtides.info/api/v3?heights&lat=${DAWN_FRASER_COORDS.latitude}&lon=${DAWN_FRASER_COORDS.longitude}&date=${day}&days=1&key=${process.env.WORLDTIDES_API_KEY}`;
      const data = await fetchJson<{ heights?: Array<{ dt: number; height: number }> }>(worldTidesUrl);
      const points = data.heights ?? [];
      const events: TideEvent[] = [];

      for (let index = 1; index < points.length - 1; index += 1) {
        const prev = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        if (current.height >= prev.height && current.height >= next.height) {
          events.push({ timeIso: new Date(current.dt * 1000).toISOString(), heightM: current.height, type: "high" });
        }
        if (current.height <= prev.height && current.height <= next.height) {
          events.push({ timeIso: new Date(current.dt * 1000).toISOString(), heightM: current.height, type: "low" });
        }
      }

      return {
        events,
        source: {
          name: "WorldTides",
          url: "https://www.worldtides.info/",
          note: "Hourly tide heights via optional API key."
        },
        confidence: {
          label: "Tides",
          value: 0.85,
          level: "high",
          note: "WorldTides API",
          source: { name: "WorldTides", url: "https://www.worldtides.info/" }
        }
      };
    });
  }

  return withCache("tides-scrape", TTL, async () => {
    const html = await fetchText(TIDE_FALLBACK_URL);
    const $ = cheerio.load(html);
    const todayBlock = $("section.forecast li.day").first();
    const dateParts = todayBlock.find("time").attr("datetime");

    if (!todayBlock.length || !dateParts) {
      throw new Error("Could not parse WillyWeather tide block");
    }

    const events: TideEvent[] = [];
    todayBlock.find("ul.icon-list.static li").each((_, element) => {
      const item = $(element);
      const className = item.attr("class") ?? "";
      const timeText = item.find("h3").text().trim();
      const heightText = item.find("span").text().trim().replace("m", "");
      const type = className.includes("point-high") ? "high" : className.includes("point-low") ? "low" : null;

      if (!type || !timeText || !heightText) {
        return;
      }

      events.push({
        timeIso: parseTideDate(dateParts, timeText).toISOString(),
        heightM: Number(heightText),
        type
      });
    });

    if (events.length < 2) {
      throw new Error("WillyWeather tide block did not contain enough events");
    }

    const fetchedAt = new Date().toISOString();
    const eventSummary = events.map((event) => `${event.type} ${formatSydneyTime(event.timeIso)} ${event.heightM.toFixed(2)} m`).join(", ");

    return {
      events,
      source: {
        name: "WillyWeather Balmain East Tides",
        url: TIDE_FALLBACK_URL,
        lastUpdated: fetchedAt,
        note: `Scraped WillyWeather's Today tide block at ${formatSydneyTime(fetchedAt)}. Parsed events: ${eventSummary}.`
      },
      confidence: {
        label: "Tides",
        value: 0.72,
        level: "high",
        note: "Daily Balmain East tide events scraped from WillyWeather, then interpolated between listed highs and lows.",
        source: { name: "WillyWeather", url: TIDE_FALLBACK_URL }
      }
    };
  });
}

async function getWaterPoloStatus(timeline: string[]) {
  const liveAttempt = await tryGetWaterPoloFromCalendar(timeline);
  if (liveAttempt) {
    return liveAttempt;
  }

  const schedule = localWaterPoloSchedule as WaterPoloSchedule;
  const annotate = (isoTime: string) => {
    const { weekday, hour, minute } = sydneyParts(new Date(isoTime));
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const matching = schedule.blocks.find((block) => block.dayOfWeek === weekday && time >= block.start && time < block.end);
    return matching
      ? { active: true, note: matching.note ?? "Scheduled club session from the fallback schedule." }
      : { active: false, note: "No club session in the fallback schedule for this hour." };
  };

  return {
    timeline: Object.fromEntries(timeline.map((isoTime) => [isoTime, annotate(isoTime)])),
    confidence: {
      label: "Water polo",
      value: 0.48,
      level: "medium",
      note: "Balmain Water Polo calendar could not be fetched, so the bundled fallback schedule is in use.",
      source: { name: "Balmain Water Polo calendar", url: WATER_POLO_CALENDAR_URL }
    } satisfies MetricConfidence,
    source: {
      name: "Water polo fallback schedule",
      url: WATER_POLO_CALENDAR_URL,
      note: "The live Balmain Water Polo calendar could not be fetched, so a bundled weekly schedule (data/water-polo-schedule.json) is in use."
    } satisfies SourceReference
  };
}

async function tryGetWaterPoloFromCalendar(timeline: string[]) {
  try {
    const feed = await withCache("water-polo", TTL, () => fetchJson<CalendarFeedEvent[]>(WATER_POLO_EVENTS_URL));
    if (!Array.isArray(feed)) {
      return null;
    }

    const today = startOfTodaySydney();
    // The club calendar has no venue field; the club's home pool is Dawn Fraser Baths, so every event is treated as on-site.
    const todaysEvents: WaterPoloEvent[] = feed
      .filter((event): event is Required<CalendarFeedEvent> => Boolean(event.start && event.end))
      .map((event) => ({
        startIso: parseFeedTime(event.start).toISOString(),
        endIso: parseFeedTime(event.end).toISOString(),
        title: event.title?.trim() || "Balmain Water Polo event"
      }))
      .filter((event) => sydneyDateKey(new Date(event.startIso)) === today);

    const annotate = (isoTime: string) => {
      const hourStart = new Date(isoTime).getTime();
      const hourEnd = hourStart + 60 * 60 * 1000;
      const activeEvent = todaysEvents.find(
        (event) => new Date(event.startIso).getTime() < hourEnd && new Date(event.endIso).getTime() > hourStart
      );
      if (activeEvent) {
        return {
          active: true,
          note: `${activeEvent.title} from ${formatSydneyTime(activeEvent.startIso)}-${formatSydneyTime(activeEvent.endIso)}.`
        };
      }
      if (todaysEvents.length) {
        return {
          active: false,
          note: `Balmain Water Polo has ${todaysEvents.length} event${todaysEvents.length > 1 ? "s" : ""} today, but not during this hour.`
        };
      }
      return {
        active: false,
        note: "No Balmain Water Polo events on the club calendar today."
      };
    };

    return {
      timeline: Object.fromEntries(timeline.map((isoTime) => [isoTime, annotate(isoTime)])),
      confidence: {
        label: "Water polo",
        value: 0.78,
        level: "high",
        note: "Live Balmain Water Polo calendar feed.",
        source: { name: "Balmain Water Polo calendar", url: WATER_POLO_CALENDAR_URL }
      } satisfies MetricConfidence,
      source: {
        name: "Balmain Water Polo calendar",
        url: WATER_POLO_CALENDAR_URL,
        lastUpdated: new Date().toISOString(),
        note: `Live calendar feed${todaysEvents.length ? ` with ${todaysEvents.length} club event${todaysEvents.length > 1 ? "s" : ""} today.` : " with no club events today."}`
      } satisfies SourceReference
    };
  } catch {
    return null;
  }
}

function buildTimeline(
  forecast: ForecastPayload,
  marine: MarinePayload,
  tides: TideData,
  beachwatch: BeachwatchFeatureCollection,
  waterPolo: Awaited<ReturnType<typeof getWaterPoloStatus>>,
  openingHours: OpeningHoursData
) {
  const today = startOfTodaySydney();
  const forecastTimes = forecast.hourly?.time ?? [];
  const marineLookup = new Map(
    (marine.hourly?.time ?? []).map((time, index) => [time, marine.hourly?.sea_surface_temperature?.[index]])
  );
  const beachwatchProps = beachwatch.features?.[0]?.properties;
  const now = Date.now();
  const rainfallValues = forecast.hourly?.rain ?? forecast.hourly?.precipitation ?? [];

  return forecastTimes
    .map((time, index): HourlyCondition => {
    const date = new Date(time);
    const tideSnapshot = interpolateTide(date, tides.events);
    const sunlight = sunlightHeuristic(time);
    const rainfallIndex = index;
    const getRollingRain = (hours: number) =>
      rainfallValues
        .slice(Math.max(0, rainfallIndex - hours + 1), rainfallIndex + 1)
        .reduce((sum, value) => sum + (value ?? 0), 0);

    const rain24 = getRollingRain(24);
    const rain48 = getRollingRain(48);
    const rain72 = getRollingRain(72);
    const pollutionRiskScore = pollutionRiskFromBeachwatch(
      beachwatchProps?.pollutionForecast,
      beachwatchProps?.latestResultRating
    );
    const bathsStatus = getBathsOpenStatus(time, openingHours, beachwatchProps?.pollutionForecast);

      return {
        isoTime: time,
        label: formatSydneyTime(time),
        isNow: now >= date.getTime() && now < date.getTime() + 60 * 60 * 1000,
        isBathsOpen: bathsStatus.isOpen,
        openStatusReason: bathsStatus.reason,
        weatherCode: forecast.hourly?.weather_code?.[index],
        weatherLabel: weatherCodeLabel(forecast.hourly?.weather_code?.[index]),
        airTempC: forecast.hourly?.temperature_2m?.[index],
        waterTempC: marineLookup.get(time),
        windSpeedKph: forecast.hourly?.wind_speed_10m?.[index],
        windDirectionDeg: forecast.hourly?.wind_direction_10m?.[index],
        uvIndex: forecast.hourly?.uv_index?.[index],
        cloudCoverPct: forecast.hourly?.cloud_cover?.[index],
        precipitationMm: forecast.hourly?.precipitation?.[index],
        tideHeightM: tideSnapshot.heightM,
        tideState: tideSnapshot.state,
        sunlightScore: sunlight.score,
        sunlightLabel: sunlight.label,
        pollutionRiskScore,
        pollutionSummary: pollutionSummary(beachwatchProps?.pollutionForecast, beachwatchProps?.latestResult),
        rainfallPenaltyScore: rainfallPenalty(rain24, rain48, rain72),
        rainfallLast24hMm: rain24,
        rainfallLast48hMm: rain48,
        rainfallLast72hMm: rain72,
        waterPoloActive: waterPolo.timeline[time]?.active ?? null,
        waterPoloNote: waterPolo.timeline[time]?.note ?? "Unknown",
        rawConfidence: average([
          forecast.hourly?.temperature_2m?.[index] !== undefined ? 0.95 : 0,
          marineLookup.get(time) !== undefined ? 0.75 : 0.2,
          tideSnapshot.heightM !== undefined ? tides.confidence.value : 0.2,
          beachwatchProps?.pollutionForecast ? 0.9 : 0.25,
          waterPolo.timeline[time]?.active === null ? 0.3 : 0.55
        ]),
        confidenceNote: "Combined from source availability for this hour."
      };
    })
    .filter((hour) => sydneyDateKey(new Date(hour.isoTime)) === today);
}

export async function getConditions(mode: ScoreMode = "balanced"): Promise<AggregatedResponse> {
  const results = await Promise.allSettled([getForecast(), getMarine(), getBeachwatch(), getTides(), getOpeningHours()]);
  const forecast = results[0].status === "fulfilled" ? results[0].value : {};
  const marine = results[1].status === "fulfilled" ? results[1].value : {};
  const beachwatch = results[2].status === "fulfilled" ? results[2].value : {};
  const waterPolo = await getWaterPoloStatus((forecast as ForecastPayload).hourly?.time ?? []);
  const tides =
    results[3].status === "fulfilled"
      ? results[3].value
      : ({
          events: [],
          source: { name: "Tides", url: TIDE_FALLBACK_URL, note: "Unavailable" },
          confidence: { label: "Tides", value: 0.2, level: "low", note: "Tide source unavailable." }
        } satisfies TideData);
  const openingHours =
    results[4].status === "fulfilled"
      ? results[4].value
      : ({
          source: {
            name: "Opening hours",
            url: DAWN_FRASER_OPENING_HOURS_URL,
            note: "Unavailable"
          },
          confidence: {
            label: "Opening hours",
            value: 0.3,
            level: "low",
            note: "Could not verify official opening hours."
          },
          rules: {
            octNov: { open: "7.15am", close: "6.30pm" },
            decFeb: { open: "6.45am", close: "7pm" },
            marApr: { open: "7.15am", close: "6.30pm" }
          }
        } satisfies OpeningHoursData);

  const timeline = buildTimeline(
    forecast as ForecastPayload,
    marine as MarinePayload,
    tides,
    beachwatch as BeachwatchFeatureCollection,
    waterPolo,
    openingHours
  );
  if (!timeline.length) {
    throw new Error("No hourly forecast data available.");
  }

  const scored = scoreTimeline(timeline, DEFAULT_WEIGHTS[mode]);
  const { current, best: bestToday, bestWindow } = findBestWindow(scored);
  const nextOpenHour = scored.slice(scored.indexOf(current)).find((hour) => hour.isBathsOpen);

  const weatherConfidence = {
    label: "Weather",
    value: results[0].status === "fulfilled" ? 0.95 : 0.2,
    level: confidenceLevel(results[0].status === "fulfilled" ? 0.95 : 0.2),
    note: "Open-Meteo forecast and hourly rain/UV data.",
    updatedAt: new Date().toISOString(),
    source: { name: "Open-Meteo", url: "https://open-meteo.com/" }
  } satisfies MetricConfidence;

  const marineConfidence = {
    label: "Water temperature",
    value: results[1].status === "fulfilled" ? 0.76 : 0.2,
    level: confidenceLevel(results[1].status === "fulfilled" ? 0.76 : 0.2),
    note: "Nearest marine grid sea-surface temperature, not an in-baths sensor.",
    updatedAt: new Date().toISOString(),
    source: { name: "Open-Meteo Marine", url: "https://open-meteo.com/en/docs/marine-weather-api" }
  } satisfies MetricConfidence;

  const pollutionProps = (beachwatch as BeachwatchFeatureCollection).features?.[0]?.properties;
  const pollutionConfidence = {
    label: "Pollution",
    value: results[2].status === "fulfilled" ? 0.9 : 0.22,
    level: confidenceLevel(results[2].status === "fulfilled" ? 0.9 : 0.22),
    note: pollutionProps?.pollutionForecast
      ? `Beachwatch forecast: ${pollutionProps.pollutionForecast}`
      : "Beachwatch data unavailable.",
    updatedAt: pollutionProps?.pollutionForecastTimeStamp,
    source: { name: "NSW Beachwatch", url: BEACHWATCH_SITE_URL }
  } satisfies MetricConfidence;

  const rainfallConfidence = {
    label: "Rainfall",
    value: results[0].status === "fulfilled" ? 0.88 : 0.2,
    level: confidenceLevel(results[0].status === "fulfilled" ? 0.88 : 0.2),
    note: "Computed from Open-Meteo hourly rain history over the last 72 hours.",
    updatedAt: new Date().toISOString(),
    source: { name: "Open-Meteo", url: "https://open-meteo.com/" }
  } satisfies MetricConfidence;

  const bathsStatus = current.isBathsOpen
    ? {
        isOpenNow: true,
        statusLabel: "Open now",
        reason: current.openStatusReason,
        nextOpenWindow: undefined
      }
    : {
        isOpenNow: false,
        statusLabel: "Closed now",
        reason: current.openStatusReason,
        nextOpenWindow: nextOpenHour ? formatSydneyTime(nextOpenHour.isoTime) : undefined
      };

  return {
    fetchedAt: new Date().toISOString(),
    timezone: SYDNEY_TIMEZONE,
    mode,
    defaultWeights: DEFAULT_WEIGHTS,
    current,
    bestToday,
    recommendation: recommendationLabel(current.score),
    bestWindow,
    bestWindowReason: explainBestTime(current, bestToday),
    bathsStatus,
    timeline,
    sources: [
      {
        name: "NSW Beachwatch",
        url: BEACHWATCH_SITE_URL,
        lastUpdated: pollutionProps?.pollutionForecastTimeStamp,
        note: "Official water quality context and latest swim result."
      },
      {
        name: "Open-Meteo Forecast",
        url: "https://open-meteo.com/",
        lastUpdated: new Date().toISOString(),
        note: "Weather, UV, wind, and rain history/forecast."
      },
      {
        name: "Open-Meteo Marine",
        url: "https://open-meteo.com/en/docs/marine-weather-api",
        lastUpdated: new Date().toISOString(),
        note: "Sea surface temperature near Dawn Fraser Baths."
      },
      openingHours.source,
      tides.source,
      waterPolo.source
    ],
    confidences: {
      current: {
        label: "Current score",
        value: current.confidence,
        level: confidenceLevel(current.confidence),
        note: current.confidenceNote
      },
      best: {
        label: "Best-time score",
        value: bestToday.confidence,
        level: confidenceLevel(bestToday.confidence),
        note: bestToday.confidenceNote
      },
      pollution: pollutionConfidence,
      tides: tides.confidence,
      weather: weatherConfidence,
      marine: marineConfidence,
      rainfall: rainfallConfidence,
      waterPolo: waterPolo.confidence,
      openingHours: openingHours.confidence
    },
    assumptions: [
      "Sunlight is a heuristic based on solar position and a practical assumption that the baths favour north-west to west sun later in the day.",
      "Water temperature uses the nearest marine grid sea-surface value, not an on-site harbour thermometer.",
      "Opening status uses the official Inner West seasonal hours (October to Easter) and closure rules. A Beachwatch \"Pollution likely\" (red) forecast is treated as a closure. If the baths are closed, the score is forced to 0.",
      "If WorldTides is not configured, tide height is interpolated from WillyWeather's Balmain East daily tide events.",
      "Water polo reads the Balmain Water Polo club calendar and treats every club event as using Dawn Fraser Baths. If the calendar is unreachable, a bundled weekly schedule is used instead."
    ]
  };
}

function parseMinutes(timeText: string) {
  const normalized = timeText.trim().toLowerCase();
  const match = normalized.match(/(\d{1,2})(?:\.(\d{2}))?(am|pm)/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3];
  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function getBathsOpenStatus(isoTime: string, openingHours: OpeningHoursData, pollutionForecast?: string) {
  const { month, hour, minute, dateKey, year } = sydneyParts(new Date(isoTime));
  const minutesNow = hour * 60 + minute;
  const easterSunday = calculateEasterSunday(year);
  const dayOffsetKey = (days: number) => new Date(easterSunday.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const monthRules =
    month === 10 || month === 11
      ? openingHours.rules.octNov
      : month === 12 || month === 1 || month === 2
        ? openingHours.rules.decFeb
        : month === 3 || month === 4
          ? openingHours.rules.marApr
          : null;

  // The baths are seasonal: open from October until Easter (Easter Monday is the last day).
  const afterEaster = (month === 3 || month === 4) && dateKey > dayOffsetKey(1);
  if (!monthRules || afterEaster) {
    return {
      isOpen: false,
      reason: "Outside the Dawn Fraser Baths season (October to Easter)."
    };
  }

  if (dateKey.endsWith("-12-25")) {
    return {
      isOpen: false,
      reason: "Closed on Christmas Day."
    };
  }

  if (dateKey === dayOffsetKey(-2)) {
    return {
      isOpen: false,
      reason: "Closed on Good Friday."
    };
  }

  if (isPollutionLikely(pollutionForecast)) {
    return {
      isOpen: false,
      reason: "Likely closed: Beachwatch forecasts pollution as likely (red icon)."
    };
  }

  const openMinutes = parseMinutes(monthRules.open);
  const closeMinutes = parseMinutes(monthRules.close);
  if (openMinutes === null || closeMinutes === null) {
    return {
      isOpen: true,
      reason: "Opening-hours parse fallback."
    };
  }

  if (minutesNow < openMinutes || minutesNow >= closeMinutes) {
    return {
      isOpen: false,
      reason: `Closed outside official hours (${monthRules.open}-${monthRules.close}).`
    };
  }

  return {
    isOpen: true,
    reason: `Within official hours (${monthRules.open}-${monthRules.close}).`
  };
}

function calculateEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
