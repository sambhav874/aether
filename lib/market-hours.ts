const IST_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** NSE cash/derivatives session: Mon–Fri, 09:15–15:30 IST. */
export function isNseOpen(now = new Date()): boolean {
  const parts = Object.fromEntries(IST_PARTS.formatToParts(now).map((p) => [p.type, p.value]));
  const day = WEEKDAY_INDEX[parts.weekday];
  const minutesSinceMidnight = Number(parts.hour) * 60 + Number(parts.minute);
  return day >= 1 && day <= 5 && minutesSinceMidnight >= 9 * 60 + 15 && minutesSinceMidnight <= 15 * 60 + 30;
}

/** Retail FX session: opens Sun 21:00 UTC, closes Fri 21:00 UTC. */
export function isForexLive(now = new Date()): boolean {
  const day = now.getUTCDay();
  const minutesSinceMidnightUtc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const afterSundayOpen = day === 0 && minutesSinceMidnightUtc >= 21 * 60;
  const beforeFridayClose = day === 5 && minutesSinceMidnightUtc < 21 * 60;
  const midWeek = day >= 1 && day <= 4;
  return afterSundayOpen || beforeFridayClose || midWeek;
}

const IST_CALENDAR_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The UTC instant at which the current IST calendar day began — 18:30 UTC on
 * the previous day. Daily counters for an India-market product have to roll
 * at IST midnight; a UTC-midnight boundary resets them at 05:30 IST, which is
 * mid-session for anything counting trades placed that day.
 *
 * Goes through the timezone database rather than a hardcoded +5:30 so the
 * offset stays correct if that ever stops being true.
 */
export function istDayStartUtc(now = new Date()): Date {
  // en-CA formats as YYYY-MM-DD, so this is the IST calendar date.
  return new Date(`${IST_CALENDAR_DATE.format(now)}T00:00:00+05:30`);
}
