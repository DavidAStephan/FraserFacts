"use client";

import { TideEvent } from "@/lib/types";
import { formatSydneyTime, sydneyDateKey } from "@/lib/utils";

export function nextTide(events: TideEvent[], now = Date.now()) {
  return events.find((event) => new Date(event.timeIso).getTime() > now);
}

export function describeTide(event: TideEvent, now = Date.now()) {
  const isToday = sydneyDateKey(new Date(event.timeIso)) === sydneyDateKey(new Date(now));
  return `${event.type === "high" ? "High" : "Low"} tide ${isToday ? "" : "tomorrow "}at ${formatSydneyTime(event.timeIso)}`;
}

// Today's high and low tides, with past ones faded and the next one highlighted.
export function TideTimes({ events }: { events: TideEvent[] }) {
  const now = Date.now();
  const today = sydneyDateKey(new Date(now));
  const todays = events.filter((event) => sydneyDateKey(new Date(event.timeIso)) === today);
  const next = nextTide(events, now);

  if (!events.length) {
    return <p>Tide times are unavailable right now.</p>;
  }

  return (
    <div>
      <ul className="space-y-1">
        {todays.map((event) => {
          const isPast = new Date(event.timeIso).getTime() <= now;
          const isNext = event === next;
          return (
            <li
              key={event.timeIso}
              className={`flex items-center justify-between gap-2 rounded-xl px-2 py-0.5 ${
                isNext ? "bg-[#ece6ff] font-bold text-[#7457e8]" : isPast ? "text-slate-400" : "text-[var(--text)]"
              }`}
            >
              <span className="whitespace-nowrap">
                <span aria-hidden="true">{event.type === "high" ? "▲" : "▼"}</span>{" "}
                <span className="sr-only">{event.type === "high" ? "High tide" : "Low tide"}</span>
                {formatSydneyTime(event.timeIso)}
              </span>
              <span className="whitespace-nowrap text-xs">{event.heightM.toFixed(1)} m</span>
            </li>
          );
        })}
      </ul>
      {next && !todays.includes(next) ? (
        <p className="mt-2 font-bold text-[#7457e8]">
          Next: {describeTide(next, now)} ({next.heightM.toFixed(2)} m)
        </p>
      ) : null}
      <p className="mt-2 text-xs">▲ high tide · ▼ low tide. Lower tide scores better in this model.</p>
    </div>
  );
}
