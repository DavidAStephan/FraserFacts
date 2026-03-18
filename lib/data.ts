import { promises as fs } from "fs";
import path from "path";
import SunCalc from "suncalc";
import * as cheerio from "cheerio";
import {
  BEACHWATCH_GEOJSON_URL,
  BEACHWATCH_SITE_URL,
  DAWN_FRASER_COORDS,
  DAWN_FRASER_MAIN_URL,
  DAWN_FRASER_OPENING_HOURS_URL,
  OPEN_METEO_FORECAST_URL,
  OPEN_METEO_MARINE_URL,
  SYDNEY_TIMEZONE,
  TIDE_FALLBACK_URL,
  WATER_POLO_CALENDAR_URL,
  WATER_POLO_DEFAULT_PATH
} from "@/lib/constants";
import { withCache } from "@/lib/cache";
import { AggregatedResponse, HourlyCondition, MetricConfidence, ScoreMode, SourceReference } from "@/lib/types";
import { DEFAULT_WEIGHTS, explainBestTime, recommendationLabel, scoreTimeline } from "@/lib/scoring";
import { average, clamp, confidenceLevel, formatSydneyTime, formatWindow, weatherCodeLabel } from "@/lib/utils";

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
  location?: string;
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function rainfallPenalty(mm24?: number, mm48?: number, mm72?: number) {
  const weighted = (mm24 ?? 0) * 0.55 + (mm48 ?? 0) * 0.3 + (mm72 ?? 0) * 0.15;
  return clamp(weighted / 25);
}

function pollutionRiskFromBeachwatch(pollutionForecast?: string, latestRating?: number, latestResult?: string) {
  const text = `${pollutionForecast ?? ""} ${latestResult ?? ""} ${latestRating ?? ""}`.toLowerCase();
  if (text.includes("unlikely")) return 0.15;
  if (text.includes("very likely")) return 0.92;
  if (text.includes("likely")) return 0.78;
  if (text.includes("very poor") || text.includes("avoid")) return 0.95;
  if (text.includes("poor")) return 0.8;
  if (text.includes("fair")) return 0.55;
  if (text.includes("good")) return 0.2;
  if (text.includes("very good") || latestRating === 4) return 0.12;
  if (latestRating === 3) return 0.28;
  if (latestRating === 2) return 0.58;
  if (latestRating === 1) return 0.85;
  return 0.5;
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
  const [time, meridiem] = timeText.trim().split(" ");
  const [hoursText, minutesText] = time.split(":");
  let hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (meridiem.toLowerCase() === "pm" && hours !== 12) hours += 12;
  if (meridiem.toLowerCase() === "am" && hours === 12) hours = 0;
  return new Date(`${baseDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
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
    return fetchJson<ForecastPayload>(url);
  });
}

async function getMarine() {
  return withCache("marine", TTL, async () => {
    const url = `${OPEN_METEO_MARINE_URL}?latitude=${DAWN_FRASER_COORDS.latitude}&longitude=${DAWN_FRASER_COORDS.longitude}&timezone=${encodeURIComponent(
      SYDNEY_TIMEZONE
    )}&hourly=sea_surface_temperature&forecast_days=1`;
    return fetchJson<MarinePayload>(url);
  });
}

async function getBeachwatch() {
  return withCache("beachwatch", TTL, async () => fetchJson<BeachwatchFeatureCollection>(BEACHWATCH_GEOJSON_URL));
}

async function getOpeningHours(): Promise<OpeningHoursData> {
  return withCache("opening-hours", TTL, async () => {
    const [hoursHtml, mainHtml] = await Promise.all([
      fetchText(DAWN_FRASER_OPENING_HOURS_URL),
      fetchText(DAWN_FRASER_MAIN_URL)
    ]);
    const hoursText = cheerio.load(hoursHtml)("body").text().replace(/\s+/g, " ").trim();
    const mainText = cheerio.load(mainHtml)("body").text().replace(/\s+/g, " ").trim();

    const parseRange = (label: string, fallbackOpen: string, fallbackClose: string) => {
      const regex = new RegExp(`${label}\\s+(\\d{1,2}\\.\\d{2}am)\\s+-\\s+(\\d{1,2}(?:\\.\\d{2})?pm)`, "i");
      const match = hoursText.match(regex);
      return {
        open: match?.[1] ?? fallbackOpen,
        close: match?.[2] ?? fallbackClose
      };
    };

    return {
      source: {
        name: "Inner West Council opening hours",
        url: DAWN_FRASER_OPENING_HOURS_URL,
        lastUpdated: new Date().toISOString(),
        note: "Official seasonal opening hours plus closure notes scraped from Inner West Council."
      },
      confidence: {
        label: "Opening hours",
        value: 0.9,
        level: "high",
        note: mainText.toLowerCase().includes("red icon indicates the harbour water is not suitable for swimming and the baths will not be open")
          ? "Official hours page parsed successfully. Inner West also states that a red Harbourwatch icon means the baths will not be open."
          : "Official hours page parsed successfully.",
        source: { name: "Inner West Council", url: DAWN_FRASER_OPENING_HOURS_URL }
      },
      rules: {
        octNov: parseRange("October - November", "7.15am", "6.30pm"),
        decFeb: parseRange("December - February", "6.45am", "7pm"),
        marApr: parseRange("March - April", "7.15am", "6.30pm")
      }
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

async function getWaterPoloStatus(nowIso: string, timeline: string[]) {
  const liveAttempt = await tryGetWaterPoloFromCalendar(nowIso, timeline);
  if (liveAttempt) {
    return liveAttempt;
  }

  const schedulePath = process.env.WATER_POLO_SCHEDULE_PATH ?? WATER_POLO_DEFAULT_PATH;
  const resolvedPath = path.resolve(schedulePath);
  try {
    const json = await fs.readFile(resolvedPath, "utf8");
    const schedule = JSON.parse(json) as WaterPoloSchedule;
    const annotate = (isoTime: string) => {
      const date = new Date(isoTime);
      const weekday = date.getDay();
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: SYDNEY_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(date);
      const matching = schedule.blocks.find((block) => block.dayOfWeek === weekday && time >= block.start && time < block.end);
      return matching
        ? { active: true, note: matching.note ?? "Scheduled water polo use from local JSON." }
        : { active: false, note: "No scheduled water polo block in local JSON." };
    };

    return {
      current: annotate(nowIso),
      timeline: Object.fromEntries(timeline.map((isoTime) => [isoTime, annotate(isoTime)])),
      confidence: {
        label: "Water polo",
        value: 0.48,
        level: "medium",
        note: "Balmain Water Polo calendar could not be fetched automatically, so local JSON fallback is in use.",
        source: { name: "Local JSON schedule", url: resolvedPath }
      } satisfies MetricConfidence,
      source: {
        name: "Local water polo schedule",
        url: resolvedPath,
        note: "Primary source is Balmain Water Polo calendar, but the site currently returns a CloudFront WAF challenge to server-side fetches. Using local fallback file."
      } satisfies SourceReference
    };
  } catch {
    return {
      current: { active: null, note: "Water polo status unavailable." },
      timeline: Object.fromEntries(timeline.map((isoTime) => [isoTime, { active: null, note: "Water polo status unavailable." }])),
      confidence: {
        label: "Water polo",
        value: 0.2,
        level: "low",
        note: "Balmain Water Polo calendar could not be fetched automatically and the local schedule file could not be read."
      } satisfies MetricConfidence,
      source: {
        name: "Water polo status",
        url: resolvedPath,
        note: "Live calendar fetch failed and fallback file is missing or invalid."
      } satisfies SourceReference
    };
  }
}

async function tryGetWaterPoloFromCalendar(nowIso: string, timeline: string[]) {
  try {
    const response = await fetch(WATER_POLO_CALENDAR_URL, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        accept: "text/html,application/xhtml+xml"
      },
      next: { revalidate: 600 }
    });

    const wafAction = response.headers.get("x-amzn-waf-action");
    const html = await response.text();
    if (wafAction === "challenge" || response.status === 202 || !html.trim()) {
      return null;
    }

    const events = parseWaterPoloCalendar(html);
    const today = startOfTodaySydney();
    const todaysEvents = events.filter((event) => event.startIso.startsWith(today));
    const annotate = (isoTime: string) => {
      const activeEvent = todaysEvents.find((event) => new Date(isoTime) >= new Date(event.startIso) && new Date(isoTime) < new Date(event.endIso));
      if (activeEvent) {
        return {
          active: true,
          note: `${activeEvent.title}${activeEvent.location ? ` at ${activeEvent.location}` : ""} from ${formatSydneyTime(activeEvent.startIso)}-${formatSydneyTime(activeEvent.endIso)}.`
        };
      }
      if (todaysEvents.length) {
        return {
          active: false,
          note: `Balmain Water Polo calendar found ${todaysEvents.length} Dawn Fraser event${todaysEvents.length > 1 ? "s" : ""} today, but not during this hour.`
        };
      }
      return {
        active: false,
        note: "No Dawn Fraser Baths event found in the Balmain Water Polo calendar today."
      };
    };

    return {
      current: annotate(nowIso),
      timeline: Object.fromEntries(timeline.map((isoTime) => [isoTime, annotate(isoTime)])),
      confidence: {
        label: "Water polo",
        value: 0.78,
        level: "high",
        note: "Live Balmain Water Polo calendar parse.",
        source: { name: "Balmain Water Polo calendar", url: WATER_POLO_CALENDAR_URL }
      } satisfies MetricConfidence,
      source: {
        name: "Balmain Water Polo calendar",
        url: WATER_POLO_CALENDAR_URL,
        lastUpdated: new Date().toISOString(),
        note: `Live calendar parse${todaysEvents.length ? ` with ${todaysEvents.length} Dawn Fraser event${todaysEvents.length > 1 ? "s" : ""} today.` : " with no Dawn Fraser events found today."}`
      } satisfies SourceReference
    };
  } catch {
    return null;
  }
}

function parseWaterPoloCalendar(html: string): WaterPoloEvent[] {
  const $ = cheerio.load(html);
  const events: WaterPoloEvent[] = [];

  const addEvent = (rawText: string, startIso?: string, endIso?: string, title?: string, location?: string) => {
    const normalized = rawText.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    const relevant =
      /dawn fraser|balmain east|balmain baths|dawn fraser baths/i.test(normalized) ||
      /dawn fraser|balmain east|balmain baths|dawn fraser baths/i.test(location ?? "");
    if (!relevant || !startIso || !endIso) return;
    events.push({
      startIso,
      endIso,
      title: title?.trim() || "Balmain Water Polo event",
      location: location?.trim()
    });
  };

  $("article, .event, .tribe-events-calendar-list__event-row, .tribe-events-calendar-month__multiday-event-bar, .tribe-events-calendar-month__calendar-event").each(
    (_, element) => {
      const item = $(element);
      const rawText = item.text();
      const startIso =
        item.find("time").first().attr("datetime") ||
        item.attr("datetime") ||
        item.find("[datetime]").first().attr("datetime");
      const endIso =
        item.find("time").last().attr("datetime") ||
        item.find("[datetime]").last().attr("datetime") ||
        startIso;
      const title =
        item.find("h3, h2, h1, .tribe-events-calendar-list__event-title, .tribe-events-calendar-month__event-title").first().text();
      const location =
        item.find(".tribe-events-calendar-list__event-venue, .tribe-events-calendar-list__event-venue-title, .tribe-events-calendar-list__event-address").text() ||
        rawText;
      if (startIso) {
        const resolvedEnd = endIso && endIso !== startIso ? endIso : new Date(new Date(startIso).getTime() + 90 * 60 * 1000).toISOString();
        addEvent(rawText, new Date(startIso).toISOString(), new Date(resolvedEnd).toISOString(), title, location);
      }
    }
  );

  return events;
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
  const nowHour = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TIMEZONE,
    hour: "2-digit"
  }).format(new Date());
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
      beachwatchProps?.latestResultRating,
      beachwatchProps?.latestResult
    );
    const bathsStatus = getBathsOpenStatus(time, openingHours, beachwatchProps?.pollutionForecast);

      return {
        isoTime: time,
        label: formatSydneyTime(time),
        isNow:
          new Intl.DateTimeFormat("en-CA", { timeZone: SYDNEY_TIMEZONE, hour: "2-digit" }).format(date) === nowHour &&
          time.startsWith(today),
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
        pollutionSummary:
          beachwatchProps?.pollutionForecast && beachwatchProps?.latestResult
            ? `${beachwatchProps.pollutionForecast}. Latest result: ${beachwatchProps.latestResult}.`
            : "Beachwatch pollution context unavailable.",
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
    .filter((hour) => hour.isoTime.startsWith(today));
}

export async function getConditions(mode: ScoreMode = "balanced"): Promise<AggregatedResponse> {
  const results = await Promise.allSettled([getForecast(), getMarine(), getBeachwatch(), getTides(), getOpeningHours()]);
  const forecast = results[0].status === "fulfilled" ? results[0].value : {};
  const marine = results[1].status === "fulfilled" ? results[1].value : {};
  const beachwatch = results[2].status === "fulfilled" ? results[2].value : {};
  const provisionalTimeline = (forecast as ForecastPayload).hourly?.time ?? [];
  const nowIso =
    provisionalTimeline.find((time) => new Date(time).getHours() === new Date().getHours()) ??
    provisionalTimeline[0] ??
    new Date().toISOString();
  const waterPolo = await getWaterPoloStatus(nowIso, provisionalTimeline);
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
  const current = scored.find((item) => item.isNow) ?? scored[0];
  const currentIndex = scored.findIndex((item) => item.isoTime === current.isoTime);
  const remaining = scored.slice(currentIndex);
  const bestToday = remaining.reduce((best, hour) => (hour.score > best.score ? hour : best), remaining[0]);
  const bestIndex = remaining.findIndex((hour) => hour.isoTime === bestToday.isoTime);
  const bestWindow = bestToday.isBathsOpen
    ? formatWindow(bestToday.isoTime, remaining[Math.min(remaining.length - 1, bestIndex + 1)].isoTime)
    : "No open window today";
  const nextOpenHour = remaining.find((hour) => hour.isBathsOpen);

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
      "Opening status uses the official Inner West seasonal hours and closure rules. If the baths are closed, the score is forced to 0.",
      "If WorldTides is not configured, tide height is interpolated from WillyWeather's Balmain East daily tide events.",
      "Water polo first attempts the Balmain Water Polo calendar, then falls back to the local JSON schedule when the site blocks automated fetches."
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
  const date = new Date(isoTime);
  const month = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY_TIMEZONE,
      month: "numeric"
    }).format(date)
  );
  const minutesNow =
    Number(
      new Intl.DateTimeFormat("en-AU", {
        timeZone: SYDNEY_TIMEZONE,
        hour: "numeric",
        hourCycle: "h23"
      }).format(date)
    ) *
      60 +
    Number(
      new Intl.DateTimeFormat("en-AU", {
        timeZone: SYDNEY_TIMEZONE,
        minute: "2-digit"
      }).format(date)
    );

  const monthRules =
    month === 10 || month === 11
      ? openingHours.rules.octNov
      : month === 12 || month === 1 || month === 2
        ? openingHours.rules.decFeb
        : month === 3 || month === 4
          ? openingHours.rules.marApr
          : null;

  if (!monthRules) {
    return {
      isOpen: false,
      reason: "Outside the normal Dawn Fraser Baths season."
    };
  }

  const closedHoliday = isChristmasDaySydney(date) || isGoodFridaySydney(date);
  if (closedHoliday) {
    return {
      isOpen: false,
      reason: isChristmasDaySydney(date) ? "Closed on Christmas Day." : "Closed on Good Friday."
    };
  }

  if ((pollutionForecast ?? "").toLowerCase().includes("very likely")) {
    return {
      isOpen: false,
      reason: "Likely closed due to Harbourwatch water-quality risk."
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

function isChristmasDaySydney(date: Date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIMEZONE,
    month: "numeric",
    day: "numeric"
  })
    .format(date)
    .split("/");
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  return day === 25 && month === 12;
}

function isGoodFridaySydney(date: Date) {
  const year = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY_TIMEZONE,
      year: "numeric"
    }).format(date)
  );
  const easterSunday = calculateEasterSunday(year);
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(easterSunday.getDate() - 2);
  const currentLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  const goodFridayLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(goodFriday);
  return currentLocal === goodFridayLocal;
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
